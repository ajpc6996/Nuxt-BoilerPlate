-- Repair ingest.* tables after bootstrap order bug: lockdown migration ran after
-- ingest_cycle and reverted ensure_ingest_table without cycle_time, while
-- ingest_append_rows still inserts into cycle_time.

-- Fix ensure_ingest_table (keep lockdown RLS / grants behaviour).
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
      ingested_at timestamptz not null default now(),
      cycle_time timestamptz not null default now()
    )',
    t
  );

  execute format(
    'alter table ingest.%I add column if not exists cycle_time timestamptz not null default now()',
    t
  );

  execute format(
    'create index if not exists %I on ingest.%I (connection_id)',
    t || '_connection_id_idx',
    t
  );
  execute format(
    'create index if not exists %I on ingest.%I (organization_id, cycle_time)',
    t || '_cycle_time_idx',
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

-- Backfill cycle_time on tables created before the fix.
do $$
declare
  t text;
  col_type text;
begin
  for t in
    select c.relname::text
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'ingest'
      and c.relkind = 'r'
      and c.relname ~ '^[a-z][a-z0-9_]*$'
  loop
    select c.data_type
    into col_type
    from information_schema.columns c
    where c.table_schema = 'ingest'
      and c.table_name = t
      and c.column_name = 'cycle_time';

    if col_type is null then
      execute format(
        'alter table ingest.%I add column cycle_time timestamptz not null default now()',
        t
      );
    elsif col_type <> 'timestamp with time zone' then
      -- Legacy promoted jsonb cycle_time from source rows (e.g. cycleTime).
      execute format(
        'alter table ingest.%I rename column cycle_time to cycle_time_src',
        t
      );
      execute format(
        'alter table ingest.%I add column cycle_time timestamptz not null default now()',
        t
      );
    end if;

    execute format(
      'create index if not exists %I on ingest.%I (organization_id, cycle_time)',
      t || '_cycle_time_idx',
      t
    );
  end loop;
end;
$$;
