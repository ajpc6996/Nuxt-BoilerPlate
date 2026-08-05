-- Read jsonb rows from a physical ingest.<table> for merge Fetch (last_ingest mode).
-- Service role only — called from Nuxt admin execute path.

create or replace function public.ingest_read_rows(
  p_table text,
  p_organization_id uuid,
  p_connection_id uuid default null,
  p_limit integer default 100000
)
returns jsonb
language plpgsql
security definer
set search_path = public, ingest
as $$
declare
  t text := lower(trim(p_table));
  lim integer := greatest(1, least(coalesce(p_limit, 100000), 500000));
  result jsonb;
begin
  if t is null or t !~ '^[a-z][a-z0-9_]{0,62}$' then
    raise exception 'Invalid ingest table name: %', p_table;
  end if;

  if p_organization_id is null then
    raise exception 'organization_id is required';
  end if;

  -- Table may not exist yet (source never run)
  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'ingest'
      and table_name = t
  ) then
    return '[]'::jsonb;
  end if;

  if p_connection_id is not null then
    execute format(
      'select coalesce(jsonb_agg(q.data order by q.row_index), ''[]''::jsonb)
       from (
         select data, row_index
         from ingest.%I
         where organization_id = $1 and connection_id = $2
         order by row_index
         limit $3
       ) q',
      t
    )
    into result
    using p_organization_id, p_connection_id, lim;
  else
    execute format(
      'select coalesce(jsonb_agg(q.data order by q.row_index), ''[]''::jsonb)
       from (
         select data, row_index
         from ingest.%I
         where organization_id = $1
         order by row_index
         limit $2
       ) q',
      t
    )
    into result
    using p_organization_id, lim;
  end if;

  return coalesce(result, '[]'::jsonb);
end;
$$;

revoke all on function public.ingest_read_rows(text, uuid, uuid, integer) from public;
grant execute on function public.ingest_read_rows(text, uuid, uuid, integer) to service_role;
