-- Dashboards v1: org-scoped dashboards, widgets, role visibility, query helper.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.dashboards (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  description text,
  visibility text not null default 'private'
    check (visibility in ('private', 'role', 'public')),
  owner_user_id uuid references public.profiles (id) on delete set null,
  layout jsonb not null default '{"version":1,"cols":12}'::jsonb,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dashboard_roles (
  id uuid primary key default gen_random_uuid(),
  dashboard_id uuid not null references public.dashboards (id) on delete cascade,
  role_id uuid not null references public.roles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (dashboard_id, role_id)
);

create table if not exists public.dashboard_widgets (
  id uuid primary key default gen_random_uuid(),
  dashboard_id uuid not null references public.dashboards (id) on delete cascade,
  widget_type text not null
    check (widget_type in ('kpi', 'bar', 'line', 'pie', 'donut', 'gauge', 'table')),
  title text not null default 'Widget',
  subtitle text,
  grid_x integer not null default 0,
  grid_y integer not null default 0,
  grid_w integer not null default 6,
  grid_h integer not null default 4,
  data_config jsonb not null default '{}'::jsonb,
  display_config jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dashboards_organization_id_idx
  on public.dashboards (organization_id);
create index if not exists dashboards_owner_user_id_idx
  on public.dashboards (owner_user_id);
create index if not exists dashboard_roles_dashboard_id_idx
  on public.dashboard_roles (dashboard_id);
create index if not exists dashboard_widgets_dashboard_id_idx
  on public.dashboard_widgets (dashboard_id);

-- ---------------------------------------------------------------------------
-- Visibility helper
-- ---------------------------------------------------------------------------

create or replace function private.can_view_dashboard(p_dashboard_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.dashboards d
    where d.id = p_dashboard_id
      and (
        private.is_platform_admin()
        or private.is_org_admin(d.organization_id)
        or (
          private.is_org_member(d.organization_id)
          and (
            d.visibility = 'public'
            or (d.visibility = 'private' and d.owner_user_id = (select auth.uid()))
            or (
              d.visibility = 'role'
              and exists (
                select 1
                from public.dashboard_roles dr
                join public.user_roles ur
                  on ur.role_id = dr.role_id
                 and ur.user_id = (select auth.uid())
                 and ur.organization_id = d.organization_id
                where dr.dashboard_id = d.id
              )
            )
          )
        )
      )
  );
$$;

revoke all on function private.can_view_dashboard(uuid) from public;
grant execute on function private.can_view_dashboard(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.dashboards enable row level security;
alter table public.dashboard_roles enable row level security;
alter table public.dashboard_widgets enable row level security;

create policy dashboards_select on public.dashboards
  for select to authenticated
  using (private.can_view_dashboard(id));

create policy dashboards_insert on public.dashboards
  for insert to authenticated
  with check (
    private.is_platform_admin()
    or (private.is_org_admin(organization_id) and private.is_aal2())
  );

create policy dashboards_update on public.dashboards
  for update to authenticated
  using (
    private.is_platform_admin()
    or (private.is_org_admin(organization_id) and private.is_aal2())
  )
  with check (
    private.is_platform_admin()
    or (private.is_org_admin(organization_id) and private.is_aal2())
  );

create policy dashboards_delete on public.dashboards
  for delete to authenticated
  using (
    private.is_platform_admin()
    or (private.is_org_admin(organization_id) and private.is_aal2())
  );

create policy dashboard_roles_select on public.dashboard_roles
  for select to authenticated
  using (private.can_view_dashboard(dashboard_id));

create policy dashboard_roles_write on public.dashboard_roles
  for all to authenticated
  using (
    exists (
      select 1 from public.dashboards d
      where d.id = dashboard_id
        and (
          private.is_platform_admin()
          or (private.is_org_admin(d.organization_id) and private.is_aal2())
        )
    )
  )
  with check (
    exists (
      select 1 from public.dashboards d
      where d.id = dashboard_id
        and (
          private.is_platform_admin()
          or (private.is_org_admin(d.organization_id) and private.is_aal2())
        )
    )
  );

create policy dashboard_widgets_select on public.dashboard_widgets
  for select to authenticated
  using (private.can_view_dashboard(dashboard_id));

create policy dashboard_widgets_write on public.dashboard_widgets
  for all to authenticated
  using (
    exists (
      select 1 from public.dashboards d
      where d.id = dashboard_id
        and (
          private.is_platform_admin()
          or (private.is_org_admin(d.organization_id) and private.is_aal2())
        )
    )
  )
  with check (
    exists (
      select 1 from public.dashboards d
      where d.id = dashboard_id
        and (
          private.is_platform_admin()
          or (private.is_org_admin(d.organization_id) and private.is_aal2())
        )
    )
  );

grant select, insert, update, delete on public.dashboards to authenticated, service_role;
grant select, insert, update, delete on public.dashboard_roles to authenticated, service_role;
grant select, insert, update, delete on public.dashboard_widgets to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Safe aggregate query over ingest.<table> (structured params only)
-- ---------------------------------------------------------------------------

create or replace function public.dashboard_run_query(
  p_organization_id uuid,
  p_sources jsonb,
  p_joins jsonb default '[]'::jsonb,
  p_dimensions jsonb default '[]'::jsonb,
  p_metrics jsonb default '[]'::jsonb,
  p_filters jsonb default '[]'::jsonb,
  p_series_field text default null,
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
  dim jsonb;
  met jsonb;
  filt jsonb;
  alias text;
  tbl text;
  left_alias text;
  left_field text;
  right_alias text;
  right_field text;
  field_alias text;
  field_name text;
  agg text;
  metric_as text;
  series_alias text;
  series_name text;
  sql text;
  select_parts text[] := array[]::text[];
  group_parts text[] := array[]::text[];
  from_sql text;
  join_sql text := '';
  where_sql text := '';
  first_alias text;
  lim integer := greatest(1, least(coalesce(p_limit, 500), 5000));
  result jsonb;
  i integer := 0;
begin
  if p_organization_id is null then
    raise exception 'organization_id is required';
  end if;
  if p_sources is null or jsonb_typeof(p_sources) <> 'array' or jsonb_array_length(p_sources) < 1 then
    raise exception 'At least one source is required';
  end if;
  if p_metrics is null or jsonb_typeof(p_metrics) <> 'array' or jsonb_array_length(p_metrics) < 1 then
    raise exception 'At least one metric is required';
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

  -- Additional sources via joins (inner)
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

    -- Find a join involving this alias
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

    if left_alias !~ '^[a-z][a-z0-9_]{0,30}$' or right_alias !~ '^[a-z][a-z0-9_]{0,30}$' then
      raise exception 'Invalid join aliases';
    end if;
    if left_field !~ '^[a-zA-Z_][a-zA-Z0-9_]{0,62}$' or right_field !~ '^[a-zA-Z_][a-zA-Z0-9_]{0,62}$' then
      raise exception 'Invalid join fields';
    end if;

    join_sql := join_sql || format(
      ' inner join ingest.%I as %I on (%I.data ->> %L) = (%I.data ->> %L) and %I.organization_id = $1',
      tbl,
      alias,
      left_alias,
      left_field,
      right_alias,
      right_field,
      alias
    );
  end loop;

  -- Dimensions
  for dim in select value from jsonb_array_elements(coalesce(p_dimensions, '[]'::jsonb))
  loop
    field_alias := split_part(dim#>>'{}', '.', 1);
    field_name := split_part(dim#>>'{}', '.', 2);
    if field_alias !~ '^[a-z][a-z0-9_]{0,30}$' or field_name !~ '^[a-zA-Z_][a-zA-Z0-9_]{0,62}$' then
      raise exception 'Invalid dimension: %', dim;
    end if;
    select_parts := array_append(
      select_parts,
      format('(%I.data ->> %L) as %I', field_alias, field_name, replace(field_alias || '_' || field_name, '.', '_'))
    );
    group_parts := array_append(
      group_parts,
      format('(%I.data ->> %L)', field_alias, field_name)
    );
  end loop;

  -- Optional series split
  if p_series_field is not null and trim(p_series_field) <> '' then
    series_alias := split_part(trim(p_series_field), '.', 1);
    series_name := split_part(trim(p_series_field), '.', 2);
    if series_alias !~ '^[a-z][a-z0-9_]{0,30}$' or series_name !~ '^[a-zA-Z_][a-zA-Z0-9_]{0,62}$' then
      raise exception 'Invalid series field: %', p_series_field;
    end if;
    select_parts := array_append(
      select_parts,
      format('(%I.data ->> %L) as series_key', series_alias, series_name)
    );
    group_parts := array_append(
      group_parts,
      format('(%I.data ->> %L)', series_alias, series_name)
    );
  end if;

  -- Metrics
  for met in select value from jsonb_array_elements(p_metrics)
  loop
    agg := lower(trim(coalesce(met->>'agg', 'count')));
    if agg not in ('sum', 'count', 'min', 'max') then
      raise exception 'Unsupported aggregate: %', agg;
    end if;
    metric_as := lower(trim(coalesce(met->>'as', agg || '_value')));
    if metric_as !~ '^[a-z][a-z0-9_]{0,62}$' then
      raise exception 'Invalid metric alias: %', metric_as;
    end if;

    if agg = 'count' and (met->>'field' is null or trim(met->>'field') in ('', '*')) then
      select_parts := array_append(select_parts, format('count(*)::float8 as %I', metric_as));
    else
      field_alias := split_part(met->>'field', '.', 1);
      field_name := split_part(met->>'field', '.', 2);
      if field_alias !~ '^[a-z][a-z0-9_]{0,30}$' or field_name !~ '^[a-zA-Z_][a-zA-Z0-9_]{0,62}$' then
        raise exception 'Invalid metric field: %', met->>'field';
      end if;
      select_parts := array_append(
        select_parts,
        format(
          '%s(nullif(%I.data ->> %L, '''')::numeric)::float8 as %I',
          agg,
          field_alias,
          field_name,
          metric_as
        )
      );
    end if;
  end loop;

  -- Filters: [{ field: "a.x", op: "eq"|"neq", value: "..." }]
  where_sql := format('where %I.organization_id = $1', first_alias);
  for filt in select value from jsonb_array_elements(coalesce(p_filters, '[]'::jsonb))
  loop
    field_alias := split_part(filt->>'field', '.', 1);
    field_name := split_part(filt->>'field', '.', 2);
    if field_alias !~ '^[a-z][a-z0-9_]{0,30}$' or field_name !~ '^[a-zA-Z_][a-zA-Z0-9_]{0,62}$' then
      continue;
    end if;
    if coalesce(filt->>'op', 'eq') = 'neq' then
      where_sql := where_sql || format(
        ' and (%I.data ->> %L) is distinct from %L',
        field_alias,
        field_name,
        coalesce(filt->>'value', '')
      );
    else
      where_sql := where_sql || format(
        ' and (%I.data ->> %L) = %L',
        field_alias,
        field_name,
        coalesce(filt->>'value', '')
      );
    end if;
  end loop;

  sql := 'select ' || array_to_string(select_parts, ', ')
    || ' ' || from_sql || join_sql
    || ' ' || where_sql;

  if cardinality(group_parts) > 0 then
    sql := sql || ' group by ' || array_to_string(group_parts, ', ');
  end if;

  sql := sql || format(' limit %s', lim);

  execute format('select coalesce(jsonb_agg(q), ''[]''::jsonb) from (%s) q', sql)
    into result
    using p_organization_id;

  return coalesce(result, '[]'::jsonb);
end;
$$;

revoke all on function public.dashboard_run_query(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, text, integer) from public;
grant execute on function public.dashboard_run_query(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, text, integer) to service_role;
