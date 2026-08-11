-- Licence MFA sync helpers + purge tracking + purge RPC

alter table public.organization_licences
  add column if not exists data_purged_at timestamptz;

comment on column public.organization_licences.data_purged_at is
  'Set when retained tenant data was purged after data_purge_at.';

-- Delete all ingest.* rows for one organization (physical landing tables)
create or replace function public.licence_purge_ingest_rows(p_organization_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public, ingest
as $$
declare
  t text;
  n bigint := 0;
  deleted bigint;
begin
  if p_organization_id is null then
    raise exception 'organization_id is required';
  end if;

  for t in
    select c.relname::text
    from pg_class c
    join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'ingest'
      and c.relkind = 'r'
      and c.relname ~ '^[a-z][a-z0-9_]*$'
  loop
    execute format(
      'delete from ingest.%I where organization_id = $1',
      t
    ) using p_organization_id;
    get diagnostics deleted = row_count;
    n := n + coalesce(deleted, 0);
  end loop;

  return n;
end;
$$;

revoke all on function public.licence_purge_ingest_rows(uuid) from public;
grant execute on function public.licence_purge_ingest_rows(uuid) to service_role;
