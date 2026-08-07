-- Dashboard queries: ORDER BY + top-N limit, preserve row order in jsonb_agg.
-- orderBy modes: none | metric (by metric alias) | diff (agg(left - right)).

drop function if exists public.dashboard_run_query(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, text, integer);

create or replace function public.dashboard_run_query(
  p_organization_id uuid,
  p_sources jsonb,
  p_joins jsonb default '[]'::jsonb,
  p_dimensions jsonb default '[]'::jsonb,
  p_metrics jsonb default '[]'::jsonb,
  p_filters jsonb default '[]'::jsonb,
  p_series_field text default null,
  p_limit integer default 500,
  p_order_by jsonb default '{}'::jsonb
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
  order_sql text := '';
  first_alias text;
  lim integer := greatest(1, least(coalesce(p_limit, 500), 5000));
  result jsonb;
  i integer := 0;
  order_mode text;
  order_dir text;
  order_metric text;
  order_agg text;
  order_expr text;
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

  -- Filters
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

  -- ORDER BY
  order_mode := lower(trim(coalesce(p_order_by->>'mode', 'none')));
  order_dir := lower(trim(coalesce(p_order_by->>'dir', 'desc')));
  if order_dir not in ('asc', 'desc') then
    order_dir := 'desc';
  end if;

  if order_mode = 'metric' then
    order_metric := lower(trim(coalesce(p_order_by->>'metricAs', '')));
    if order_metric !~ '^[a-z][a-z0-9_]{0,62}$' then
      raise exception 'Invalid orderBy.metricAs: %', order_metric;
    end if;
    order_sql := format(' order by %I %s nulls last', order_metric, order_dir);
  elsif order_mode = 'diff' then
    order_agg := lower(trim(coalesce(p_order_by->>'agg', 'max')));
    if order_agg not in ('sum', 'min', 'max') then
      raise exception 'Unsupported orderBy.diff aggregate: %', order_agg;
    end if;
    left_alias := split_part(coalesce(p_order_by->>'left', ''), '.', 1);
    left_field := split_part(coalesce(p_order_by->>'left', ''), '.', 2);
    right_alias := split_part(coalesce(p_order_by->>'right', ''), '.', 1);
    right_field := split_part(coalesce(p_order_by->>'right', ''), '.', 2);
    if left_alias !~ '^[a-z][a-z0-9_]{0,30}$' or left_field !~ '^[a-zA-Z_][a-zA-Z0-9_]{0,62}$' then
      raise exception 'Invalid orderBy.diff left field';
    end if;
    if right_alias !~ '^[a-z][a-z0-9_]{0,30}$' or right_field !~ '^[a-zA-Z_][a-zA-Z0-9_]{0,62}$' then
      raise exception 'Invalid orderBy.diff right field';
    end if;
    -- Sort by agg(left - right), e.g. max(high_24h - low_24h)
    order_expr := format(
      '%s(nullif(%I.data ->> %L, '''')::numeric - nullif(%I.data ->> %L, '''')::numeric)',
      order_agg,
      left_alias,
      left_field,
      right_alias,
      right_field
    );
    order_sql := format(' order by %s %s nulls last', order_expr, order_dir);
  end if;

  sql := 'select ' || array_to_string(select_parts, ', ')
    || ' ' || from_sql || join_sql
    || ' ' || where_sql;

  if cardinality(group_parts) > 0 then
    sql := sql || ' group by ' || array_to_string(group_parts, ', ');
  end if;

  sql := sql || order_sql || format(' limit %s', lim);

  -- Preserve ORDER BY when aggregating to jsonb (jsonb_agg alone is unordered).
  execute format(
    $q$
    select coalesce(
      (
        select jsonb_agg(x.body order by x.ord)
        from (
          select to_jsonb(s) as body, row_number() over () as ord
          from (%s) s
        ) x
      ),
      '[]'::jsonb
    )
    $q$,
    sql
  )
  into result
  using p_organization_id;

  return coalesce(result, '[]'::jsonb);
end;
$$;

revoke all on function public.dashboard_run_query(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, text, integer, jsonb) from public;
grant execute on function public.dashboard_run_query(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, text, integer, jsonb) to service_role;
