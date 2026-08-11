-- Lock down physical ingest.* tables:
-- - Revoke authenticated SELECT / schema USAGE
-- - Enable RLS with deny-all for authenticated (defense in depth)
-- - New tables from ensure_ingest_table follow the same rules
-- Access remains via service_role RPCs / Nitro admin client only.

revoke usage on schema ingest from authenticated;

alter default privileges in schema ingest
  revoke select on tables from authenticated;

-- Existing tables: revoke SELECT, enable RLS, deny-all policy for authenticated
do $$
declare
  t text;
begin
  for t in
    select c.relname::text
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'ingest'
      and c.relkind = 'r'
      and c.relname ~ '^[a-z][a-z0-9_]*$'
  loop
    execute format('revoke all on table ingest.%I from authenticated', t);
    execute format('alter table ingest.%I enable row level security', t);

    execute format('drop policy if exists ingest_no_direct_access on ingest.%I', t);
    execute format(
      'create policy ingest_no_direct_access on ingest.%I
         for all to authenticated
         using (false)
         with check (false)',
      t
    );

    -- Keep service_role fully capable (BYPASSRLS typically applies; grant remains)
    execute format('grant all on table ingest.%I to service_role', t);
  end loop;
end;
$$;

-- Recreate ensure_ingest_table without authenticated grants
create or replace function public.ensure_ingest_table(p_table text)
returns text
language plpgsql
security definer
set search_path = public, ingest
as $$
declare
  t text := lower(trim(p_table));
begin
  if t is null or t !~ '^[a-z][a-z0-9_]{0,62}$' then
    raise exception 'Invalid ingest table name: %', p_table;
  end if;

  execute format(
    'create table if not exists ingest.%I (
      id uuid primary key default gen_random_uuid(),
      organization_id uuid references public.organizations (id) on delete cascade,
      connection_id uuid references public.connections (id) on delete set null,
      run_id uuid,
      row_index integer not null default 0,
      data jsonb not null,
      ingested_at timestamptz not null default now()
    )',
    t
  );

  execute format(
    'create index if not exists %I on ingest.%I (connection_id)',
    t || '_connection_id_idx',
    t
  );

  execute format('alter table ingest.%I enable row level security', t);
  execute format('drop policy if exists ingest_no_direct_access on ingest.%I', t);
  execute format(
    'create policy ingest_no_direct_access on ingest.%I
       for all to authenticated
       using (false)
       with check (false)',
    t
  );

  execute format('revoke all on table ingest.%I from authenticated', t);
  execute format('grant all on ingest.%I to service_role', t);

  return 'ingest.' || t;
end;
$$;

revoke all on function public.ensure_ingest_table(text) from public;
grant execute on function public.ensure_ingest_table(text) to service_role;

-- Schema usage: service_role only (authenticated no longer needs ingest schema)
grant usage on schema ingest to service_role;
grant all on schema ingest to service_role;
