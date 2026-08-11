-- Physical ingest landing tables live in schema "ingest".
-- Destination name on a connection (e.g. ingest_traktor) → ingest.ingest_traktor
-- NOTE: Later migration 20260811150000_ingest_lockdown.sql revokes authenticated
-- access and enables deny-all RLS. Fresh installs still apply this file first, then lockdown.

create schema if not exists ingest;

grant usage on schema ingest to service_role, authenticated;
grant all on schema ingest to service_role;

alter default privileges in schema ingest
  grant select on tables to authenticated;
alter default privileges in schema ingest
  grant all on tables to service_role;

/**
 * Ensure ingest.<table> exists with metadata + jsonb data column.
 */
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

  execute format('grant select on ingest.%I to authenticated', t);
  execute format('grant all on ingest.%I to service_role', t);

  return 'ingest.' || t;
end;
$$;

/**
 * Replace rows for a connection in ingest.<table> from a JSON array of objects.
 * Also promotes top-level object keys to jsonb columns when possible.
 */
create or replace function public.ingest_replace_rows(
  p_table text,
  p_organization_id uuid,
  p_connection_id uuid,
  p_run_id uuid,
  p_rows jsonb
)
returns integer
language plpgsql
security definer
set search_path = public, ingest
as $$
declare
  t text := lower(trim(p_table));
  elem jsonb;
  key text;
  safe_key text;
  n integer := 0;
  idx integer := 0;
  col_list text;
  val_list text;
  keys text[];
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array';
  end if;

  perform public.ensure_ingest_table(t);

  -- Promote keys from object rows to columns (jsonb)
  for elem in select value from jsonb_array_elements(p_rows)
  loop
    if jsonb_typeof(elem) = 'object' then
      for key in select jsonb_object_keys(elem)
      loop
        safe_key := lower(regexp_replace(key, '[^a-zA-Z0-9_]', '_', 'g'));
        safe_key := regexp_replace(safe_key, '^_+', '');
        if safe_key = '' or safe_key !~ '^[a-z]' then
          safe_key := 'c_' || safe_key;
        end if;
        if safe_key in ('id', 'organization_id', 'connection_id', 'run_id', 'row_index', 'data', 'ingested_at') then
          safe_key := 'src_' || safe_key;
        end if;
        safe_key := left(safe_key, 63);

        execute format(
          'alter table ingest.%I add column if not exists %I jsonb',
          t,
          safe_key
        );
      end loop;
    end if;
  end loop;

  execute format('delete from ingest.%I where connection_id = $1', t)
    using p_connection_id;

  for elem in select value from jsonb_array_elements(p_rows)
  loop
    execute format(
      'insert into ingest.%I (organization_id, connection_id, run_id, row_index, data)
       values ($1, $2, $3, $4, $5)',
      t
    )
    using p_organization_id, p_connection_id, p_run_id, idx, elem;

    -- Copy promoted columns when elem is an object
    if jsonb_typeof(elem) = 'object' then
      for key in select jsonb_object_keys(elem)
      loop
        safe_key := lower(regexp_replace(key, '[^a-zA-Z0-9_]', '_', 'g'));
        safe_key := regexp_replace(safe_key, '^_+', '');
        if safe_key = '' or safe_key !~ '^[a-z]' then
          safe_key := 'c_' || safe_key;
        end if;
        if safe_key in ('id', 'organization_id', 'connection_id', 'run_id', 'row_index', 'data', 'ingested_at') then
          safe_key := 'src_' || safe_key;
        end if;
        safe_key := left(safe_key, 63);

        execute format(
          'update ingest.%I set %I = $1->%L where connection_id = $2 and row_index = $3',
          t,
          safe_key,
          key
        )
        using elem, p_connection_id, idx;
      end loop;
    end if;

    idx := idx + 1;
    n := n + 1;
  end loop;

  return n;
end;
$$;

revoke all on function public.ensure_ingest_table(text) from public;
revoke all on function public.ingest_replace_rows(text, uuid, uuid, uuid, jsonb) from public;
grant execute on function public.ensure_ingest_table(text) to service_role;
grant execute on function public.ingest_replace_rows(text, uuid, uuid, uuid, jsonb) to service_role;
