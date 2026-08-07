-- Reports MVP: org-scoped reports with multi-table query + column display config.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  description text,
  visibility text not null default 'private'
    check (visibility in ('private', 'public')),
  owner_user_id uuid references public.profiles (id) on delete set null,
  query_config jsonb not null default '{}'::jsonb,
  display_config jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists reports_organization_id_idx
  on public.reports (organization_id);
create index if not exists reports_owner_user_id_idx
  on public.reports (owner_user_id);

-- ---------------------------------------------------------------------------
-- Visibility helper
-- ---------------------------------------------------------------------------

create or replace function private.can_view_report(p_report_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.reports r
    where r.id = p_report_id
      and (
        private.is_platform_admin()
        or private.is_org_admin(r.organization_id)
        or (
          private.is_org_member(r.organization_id)
          and (
            r.visibility = 'public'
            or (r.visibility = 'private' and r.owner_user_id = (select auth.uid()))
          )
        )
      )
  );
$$;

revoke all on function private.can_view_report(uuid) from public;
grant execute on function private.can_view_report(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.reports enable row level security;

create policy reports_select on public.reports
  for select to authenticated
  using (private.can_view_report(id));

create policy reports_insert on public.reports
  for insert to authenticated
  with check (
    private.is_platform_admin()
    or (private.is_org_admin(organization_id) and private.is_aal2())
  );

create policy reports_update on public.reports
  for update to authenticated
  using (
    private.is_platform_admin()
    or (private.is_org_admin(organization_id) and private.is_aal2())
  )
  with check (
    private.is_platform_admin()
    or (private.is_org_admin(organization_id) and private.is_aal2())
  );

create policy reports_delete on public.reports
  for delete to authenticated
  using (
    private.is_platform_admin()
    or (private.is_org_admin(organization_id) and private.is_aal2())
  );

grant select, insert, update, delete on public.reports to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Flat multi-table select over ingest.<table> (inner + left joins)
-- ---------------------------------------------------------------------------

create or replace function public.report_run_query(
  p_organization_id uuid,
  p_sources jsonb,
  p_joins jsonb default '[]'::jsonb,
  p_fields jsonb default '[]'::jsonb,
  p_limit integer default 500
)
returns jsonb
language plpgsql
security definer
set search_path = public, ingest
as $$
declare
  src jsonb;
  j jsonb;
  fld jsonb;
  alias text;
  tbl text;
  left_alias text;
  left_field text;
  right_alias text;
  right_field text;
  join_type text;
  join_kw text;
  field_alias text;
  field_name text;
  col_as text;
  sql text;
  select_parts text[] := array[]::text[];
  from_sql text;
  join_sql text := '';
  first_alias text;
  lim integer := greatest(1, least(coalesce(p_limit, 500), 10000));
  result jsonb;
  i integer := 0;
begin
  if p_organization_id is null then
    raise exception 'organization_id is required';
  end if;
  if p_sources is null or jsonb_typeof(p_sources) <> 'array' or jsonb_array_length(p_sources) < 1 then
    raise exception 'At least one source is required';
  end if;
  if p_fields is null or jsonb_typeof(p_fields) <> 'array' or jsonb_array_length(p_fields) < 1 then
    raise exception 'At least one field is required';
  end if;

  -- FROM first source
  src := p_sources->0;
  alias := lower(trim(coalesce(src->>'alias', 't0')));
  tbl := lower(trim(src->>'table'));
  first_alias := alias;
  if alias !~ '^[a-z][a-z0-9_]{0,30}$' then
    raise exception 'Invalid source alias: %', alias;
  end if;
  if tbl is null or tbl !~ '^[a-z][a-z0-9_]{0,62}$' then
    raise exception 'Invalid source table: %', tbl;
  end if;
  if not exists (
    select 1 from public.data_sources ds
    where ds.organization_id = p_organization_id
      and ds.destination_table = tbl
  ) then
    raise exception 'Table % is not an ingest destination for this organization', tbl;
  end if;
  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'ingest'
      and table_name = tbl
  ) then
    return '[]'::jsonb;
  end if;

  from_sql := format('from ingest.%I as %I', tbl, alias);

  -- Additional sources via joins (inner | left)
  for i in 1 .. (jsonb_array_length(p_sources) - 1)
  loop
    src := p_sources->i;
    alias := lower(trim(coalesce(src->>'alias', 't' || i)));
    tbl := lower(trim(src->>'table'));
    if alias !~ '^[a-z][a-z0-9_]{0,30}$' then
      raise exception 'Invalid source alias: %', alias;
    end if;
    if tbl is null or tbl !~ '^[a-z][a-z0-9_]{0,62}$' then
      raise exception 'Invalid source table: %', tbl;
    end if;
    if not exists (
      select 1 from public.data_sources ds
      where ds.organization_id = p_organization_id
        and ds.destination_table = tbl
    ) then
      raise exception 'Table % is not an ingest destination for this organization', tbl;
    end if;
    if not exists (
      select 1
      from information_schema.tables
      where table_schema = 'ingest'
        and table_name = tbl
    ) then
      return '[]'::jsonb;
    end if;

    select value into j
    from jsonb_array_elements(coalesce(p_joins, '[]'::jsonb))
    where (value->>'left') like alias || '.%'
       or (value->>'right') like alias || '.%'
    limit 1;

    if j is null then
      raise exception 'Missing join for source alias %', alias;
    end if;

    left_alias := split_part(j->>'left', '.', 1);
    left_field := split_part(j->>'left', '.', 2);
    right_alias := split_part(j->>'right', '.', 1);
    right_field := split_part(j->>'right', '.', 2);
    join_type := lower(trim(coalesce(j->>'type', 'inner')));

    if join_type = 'left' then
      join_kw := 'left join';
    elsif join_type = 'inner' then
      join_kw := 'inner join';
    else
      raise exception 'Unsupported join type: % (MVP supports inner, left)', join_type;
    end if;

    if left_alias !~ '^[a-z][a-z0-9_]{0,30}$' or right_alias !~ '^[a-z][a-z0-9_]{0,30}$' then
      raise exception 'Invalid join aliases';
    end if;
    if left_field !~ '^[a-zA-Z_][a-zA-Z0-9_]{0,62}$' or right_field !~ '^[a-zA-Z_][a-zA-Z0-9_]{0,62}$' then
      raise exception 'Invalid join fields';
    end if;

    join_sql := join_sql || format(
      ' %s ingest.%I as %I on (%I.data ->> %L) = (%I.data ->> %L) and %I.organization_id = $1',
      join_kw,
      tbl,
      alias,
      left_alias,
      left_field,
      right_alias,
      right_field,
      alias
    );
  end loop;

  -- Selected fields (flat columns)
  for fld in select value from jsonb_array_elements(p_fields)
  loop
    field_alias := split_part(coalesce(fld->>'field', ''), '.', 1);
    field_name := split_part(coalesce(fld->>'field', ''), '.', 2);
    col_as := lower(trim(coalesce(nullif(fld->>'as', ''), replace(field_alias || '_' || field_name, '.', '_'))));
    col_as := regexp_replace(col_as, '[^a-z0-9_]', '_', 'g');
    if col_as = '' or col_as !~ '^[a-z][a-z0-9_]{0,62}$' then
      raise exception 'Invalid field alias: %', fld->>'as';
    end if;
    if field_alias !~ '^[a-z][a-z0-9_]{0,30}$' or field_name !~ '^[a-zA-Z_][a-zA-Z0-9_]{0,62}$' then
      raise exception 'Invalid field: %', fld->>'field';
    end if;
    select_parts := array_append(
      select_parts,
      format('(%I.data ->> %L) as %I', field_alias, field_name, col_as)
    );
  end loop;

  if coalesce(array_length(select_parts, 1), 0) < 1 then
    raise exception 'At least one field is required';
  end if;

  sql := 'select ' || array_to_string(select_parts, ', ')
    || ' ' || from_sql || join_sql
    || format(' where %I.organization_id = $1', first_alias)
    || format(' limit %s', lim);

  execute format(
    'select coalesce(jsonb_agg(to_jsonb(q)), ''[]''::jsonb) from (%s) as q',
    sql
  ) into result using p_organization_id;

  return coalesce(result, '[]'::jsonb);
end;
$$;

revoke all on function public.report_run_query(uuid, jsonb, jsonb, jsonb, integer) from public;
grant execute on function public.report_run_query(uuid, jsonb, jsonb, jsonb, integer) to service_role;
