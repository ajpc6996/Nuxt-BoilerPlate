-- Per-migration ingest reset before pilot/full runs.

alter table public.migration_projects
  add column if not exists reset_ingest_before_run boolean not null default false;

comment on column public.migration_projects.reset_ingest_before_run is
  'When true, pilot/full runs clear this project''s mig_raw_* / mig_mapped_* ingest tables for the org before executing stages.';

-- Clear one migration ingest table for an org (mig_raw_* / mig_mapped_* only).
create or replace function public.ingest_clear_org_table(
  p_table text,
  p_organization_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public, ingest
as $$
declare
  t text := lower(trim(p_table));
  n integer := 0;
begin
  if p_organization_id is null then
    raise exception 'organization_id is required';
  end if;

  if t is null or t !~ '^[a-z][a-z0-9_]{0,62}$' then
    raise exception 'Invalid ingest table name: %', p_table;
  end if;

  if t !~ '^mig_(raw|mapped)_' then
    raise exception 'Only migration ingest tables (mig_raw_* / mig_mapped_*) can be cleared';
  end if;

  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'ingest'
      and table_name = t
  ) then
    return 0;
  end if;

  execute format('delete from ingest.%I where organization_id = $1', t)
    using p_organization_id;

  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.ingest_clear_org_table(text, uuid) from public;
grant execute on function public.ingest_clear_org_table(text, uuid) to service_role;
