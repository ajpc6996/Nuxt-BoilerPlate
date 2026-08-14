-- cycleTime on ingest.*, append + retention cleanup, transient staged.batches,
-- and platform_system_settings for Temp Stage hard caps.

-- ---------------------------------------------------------------------------
-- Platform system settings (single row)
-- ---------------------------------------------------------------------------
create table if not exists public.platform_system_settings (
  id smallint primary key default 1 check (id = 1),
  max_stage_rows_per_batch integer not null default 1000
    check (max_stage_rows_per_batch >= 50 and max_stage_rows_per_batch <= 50000),
  max_stage_bytes_per_batch integer not null default 2000000
    check (max_stage_bytes_per_batch >= 65536 and max_stage_bytes_per_batch <= 16777216),
  max_concurrent_stage_rows_per_org integer not null default 2000
    check (max_concurrent_stage_rows_per_org >= 100 and max_concurrent_stage_rows_per_org <= 500000),
  stage_stale_ttl_minutes integer not null default 30
    check (stage_stale_ttl_minutes >= 5 and stage_stale_ttl_minutes <= 1440),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

insert into public.platform_system_settings (id)
values (1)
on conflict (id) do nothing;

alter table public.platform_system_settings enable row level security;

drop policy if exists "system_settings_select_platform" on public.platform_system_settings;
create policy "system_settings_select_platform"
  on public.platform_system_settings for select to authenticated
  using (private.is_platform_admin());

drop policy if exists "system_settings_write_platform" on public.platform_system_settings;
create policy "system_settings_write_platform"
  on public.platform_system_settings for all to authenticated
  using (private.is_platform_admin() and private.is_aal2())
  with check (private.is_platform_admin() and private.is_aal2());

grant select on public.platform_system_settings to authenticated;
grant select, insert, update, delete on public.platform_system_settings to service_role;

-- ---------------------------------------------------------------------------
-- ingest.* cycle_time
-- ---------------------------------------------------------------------------
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
    execute format(
      'alter table ingest.%I add column if not exists cycle_time timestamptz not null default now()',
      t
    );
    execute format(
      'create index if not exists %I on ingest.%I (organization_id, cycle_time)',
      t || '_cycle_time_idx',
      t
    );
  end loop;
end;
$$;

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

drop function if exists public.ingest_replace_rows(text, uuid, uuid, uuid, jsonb);

create or replace function public.ingest_replace_rows(
  p_table text,
  p_organization_id uuid,
  p_connection_id uuid,
  p_run_id uuid,
  p_rows jsonb,
  p_cycle_time timestamptz default now()
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
  cycle_ts timestamptz := coalesce(p_cycle_time, now());
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array';
  end if;

  perform public.ensure_ingest_table(t);

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
        if safe_key in (
          'id', 'organization_id', 'connection_id', 'run_id', 'row_index',
          'data', 'ingested_at', 'cycle_time', 'cycletime'
        ) then
          continue;
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

  execute format('delete from ingest.%I where organization_id = $1 and connection_id = $2', t)
    using p_organization_id, p_connection_id;

  for elem in select value from jsonb_array_elements(p_rows)
  loop
    if jsonb_typeof(elem) <> 'object' then
      elem := jsonb_build_object('value', elem, 'cycleTime', cycle_ts);
    else
      elem := (elem - 'cycleTime') || jsonb_build_object('cycleTime', cycle_ts);
    end if;

    execute format(
      'insert into ingest.%I (organization_id, connection_id, run_id, row_index, data, cycle_time)
       values ($1, $2, $3, $4, $5, $6)',
      t
    )
    using p_organization_id, p_connection_id, p_run_id, idx, elem, cycle_ts;

    if jsonb_typeof(elem) = 'object' then
      for key in select jsonb_object_keys(elem)
      loop
        safe_key := lower(regexp_replace(key, '[^a-zA-Z0-9_]', '_', 'g'));
        safe_key := regexp_replace(safe_key, '^_+', '');
        if safe_key = '' or safe_key !~ '^[a-z]' then
          safe_key := 'c_' || safe_key;
        end if;
        if safe_key in (
          'id', 'organization_id', 'connection_id', 'run_id', 'row_index',
          'data', 'ingested_at', 'cycle_time', 'cycletime'
        ) then
          continue;
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

revoke all on function public.ingest_replace_rows(text, uuid, uuid, uuid, jsonb, timestamptz) from public;
grant execute on function public.ingest_replace_rows(text, uuid, uuid, uuid, jsonb, timestamptz) to service_role;

create or replace function public.ingest_append_rows(
  p_table text,
  p_organization_id uuid,
  p_connection_id uuid,
  p_run_id uuid,
  p_rows jsonb,
  p_cycle_time timestamptz default now()
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
  cycle_ts timestamptz := coalesce(p_cycle_time, now());
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array';
  end if;

  perform public.ensure_ingest_table(t);

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
        if safe_key in (
          'id', 'organization_id', 'connection_id', 'run_id', 'row_index',
          'data', 'ingested_at', 'cycle_time', 'cycletime'
        ) then
          continue;
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

  execute format(
    'select coalesce(max(row_index), -1) + 1 from ingest.%I where organization_id = $1 and connection_id = $2',
    t
  )
  into idx
  using p_organization_id, p_connection_id;

  for elem in select value from jsonb_array_elements(p_rows)
  loop
    if jsonb_typeof(elem) <> 'object' then
      elem := jsonb_build_object('value', elem, 'cycleTime', cycle_ts);
    else
      elem := (elem - 'cycleTime') || jsonb_build_object('cycleTime', cycle_ts);
    end if;

    execute format(
      'insert into ingest.%I (organization_id, connection_id, run_id, row_index, data, cycle_time)
       values ($1, $2, $3, $4, $5, $6)',
      t
    )
    using p_organization_id, p_connection_id, p_run_id, idx, elem, cycle_ts;

    idx := idx + 1;
    n := n + 1;
  end loop;

  return n;
end;
$$;

revoke all on function public.ingest_append_rows(text, uuid, uuid, uuid, jsonb, timestamptz) from public;
grant execute on function public.ingest_append_rows(text, uuid, uuid, uuid, jsonb, timestamptz) to service_role;

create or replace function public.ingest_cleanup_expired(
  p_table text,
  p_organization_id uuid,
  p_connection_id uuid,
  p_retention_days integer
)
returns integer
language plpgsql
security definer
set search_path = public, ingest
as $$
declare
  t text := lower(trim(p_table));
  days integer := greatest(1, least(coalesce(p_retention_days, 7), 365));
  n integer := 0;
begin
  if t is null or t !~ '^[a-z][a-z0-9_]{0,62}$' then
    raise exception 'Invalid ingest table name: %', p_table;
  end if;

  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'ingest' and table_name = t
  ) then
    return 0;
  end if;

  execute format(
    'delete from ingest.%I
     where organization_id = $1
       and connection_id = $2
       and cycle_time < (now() - ($3 || '' days'')::interval)',
    t
  )
  using p_organization_id, p_connection_id, days;

  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.ingest_cleanup_expired(text, uuid, uuid, integer) from public;
grant execute on function public.ingest_cleanup_expired(text, uuid, uuid, integer) to service_role;

-- ---------------------------------------------------------------------------
-- Transient Temp Stage
-- ---------------------------------------------------------------------------
create schema if not exists staged;
revoke all on schema staged from public, anon, authenticated;
grant usage, create on schema staged to service_role;

create table if not exists staged.batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  connection_id uuid references public.connections (id) on delete set null,
  data_source_id uuid,
  run_id uuid not null,
  batch_no integer not null default 0,
  row_index integer not null default 0,
  data jsonb not null,
  staged_at timestamptz not null default now()
);

create index if not exists staged_batches_org_run_idx
  on staged.batches (organization_id, run_id, batch_no);
create index if not exists staged_batches_stale_idx
  on staged.batches (staged_at);
create index if not exists staged_batches_org_idx
  on staged.batches (organization_id);

alter table staged.batches enable row level security;
drop policy if exists staged_no_direct_access on staged.batches;
create policy staged_no_direct_access
  on staged.batches for all to authenticated
  using (false)
  with check (false);

revoke all on table staged.batches from public, anon, authenticated;
grant all on table staged.batches to service_role;

create or replace function public.staged_append_rows(
  p_organization_id uuid,
  p_connection_id uuid,
  p_data_source_id uuid,
  p_run_id uuid,
  p_batch_no integer,
  p_rows jsonb
)
returns integer
language plpgsql
security definer
set search_path = public, staged
as $$
declare
  elem jsonb;
  n integer := 0;
  idx integer := 0;
begin
  if p_organization_id is null or p_run_id is null then
    raise exception 'organization_id and run_id are required';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array';
  end if;

  for elem in select value from jsonb_array_elements(p_rows)
  loop
    insert into staged.batches (
      organization_id, connection_id, data_source_id, run_id, batch_no, row_index, data
    )
    values (
      p_organization_id, p_connection_id, p_data_source_id, p_run_id,
      coalesce(p_batch_no, 0), idx, elem
    );
    idx := idx + 1;
    n := n + 1;
  end loop;

  return n;
end;
$$;

create or replace function public.staged_delete_batch(p_run_id uuid, p_batch_no integer)
returns integer
language plpgsql
security definer
set search_path = public, staged
as $$
declare
  n integer := 0;
begin
  delete from staged.batches
  where run_id = p_run_id
    and batch_no = coalesce(p_batch_no, 0);
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function public.staged_delete_run(p_run_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, staged
as $$
declare
  n integer := 0;
begin
  delete from staged.batches where run_id = p_run_id;
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function public.staged_count_org(p_organization_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, staged
as $$
declare
  n integer := 0;
begin
  select count(*)::integer into n
  from staged.batches
  where organization_id = p_organization_id;
  return coalesce(n, 0);
end;
$$;

create or replace function public.staged_cleanup_stale(p_ttl_minutes integer)
returns integer
language plpgsql
security definer
set search_path = public, staged
as $$
declare
  mins integer := greatest(5, least(coalesce(p_ttl_minutes, 30), 1440));
  n integer := 0;
begin
  delete from staged.batches
  where staged_at < (now() - (mins || ' minutes')::interval);
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.staged_append_rows(uuid, uuid, uuid, uuid, integer, jsonb) from public;
revoke all on function public.staged_delete_batch(uuid, integer) from public;
revoke all on function public.staged_delete_run(uuid) from public;
revoke all on function public.staged_count_org(uuid) from public;
revoke all on function public.staged_cleanup_stale(integer) from public;

grant execute on function public.staged_append_rows(uuid, uuid, uuid, uuid, integer, jsonb) to service_role;
grant execute on function public.staged_delete_batch(uuid, integer) to service_role;
grant execute on function public.staged_delete_run(uuid) to service_role;
grant execute on function public.staged_count_org(uuid) to service_role;
grant execute on function public.staged_cleanup_stale(integer) to service_role;
