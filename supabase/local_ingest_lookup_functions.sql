-- Local ingest warehouse: lookup RPCs only.
-- Skips the connector_types UPDATE in 20260804200000_ingest_lookup_expansion.sql
-- (control-plane metadata lives on Supabase, not the local warehouse).

create or replace function public.list_ingest_tables()
returns table (table_name text)
language sql
stable
security definer
set search_path = public, ingest
as $$
  select c.relname::text as table_name
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'ingest'
    and c.relkind = 'r'
    and c.relname ~ '^[a-z][a-z0-9_]*$'
  order by c.relname;
$$;

create or replace function public.list_ingest_columns(p_table text)
returns table (column_name text, data_type text)
language plpgsql
stable
security definer
set search_path = public, ingest
as $$
declare
  t text := lower(trim(p_table));
begin
  if t is null or t !~ '^[a-z][a-z0-9_]{0,62}$' then
    raise exception 'Invalid ingest table name';
  end if;

  return query
  select a.attname::text, format_type(a.atttypid, a.atttypmod)::text
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'ingest'
    and c.relname = t
    and a.attnum > 0
    and not a.attisdropped
  order by a.attnum;
end;
$$;

create or replace function public.ingest_lookup_distinct(
  p_table text,
  p_columns text[],
  p_organization_id uuid,
  p_limit integer default 100
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, ingest
as $$
declare
  t text := lower(trim(p_table));
  col text;
  col_type oid;
  expr text;
  first_expr text;
  select_list text := '';
  sql text;
  result jsonb;
  lim integer := greatest(1, least(coalesce(p_limit, 100), 500));
begin
  if t is null or t !~ '^[a-z][a-z0-9_]{0,62}$' then
    raise exception 'Invalid ingest table name';
  end if;
  if p_organization_id is null then
    raise exception 'organization_id is required';
  end if;
  if p_columns is null or cardinality(p_columns) < 1 then
    raise exception 'At least one lookup column is required';
  end if;

  foreach col in array p_columns
  loop
    col := lower(trim(col));
    if col is null or col !~ '^[a-z][a-z0-9_]{0,62}$' then
      raise exception 'Invalid column name: %', col;
    end if;

    select a.atttypid into col_type
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'ingest'
      and c.relname = t
      and a.attname = col
      and a.attnum > 0
      and not a.attisdropped;

    if col_type is null then
      raise exception 'Column %.% not found', t, col;
    end if;

    if col_type = 'jsonb'::regtype then
      expr := format('(%I #>> ''{}'')', col);
    else
      expr := format('%I::text', col);
    end if;

    if select_list <> '' then
      select_list := select_list || ', ';
    end if;
    select_list := select_list || format('%s AS %I', expr, col);

    if first_expr is null then
      first_expr := expr;
    end if;
  end loop;

  sql := format(
    'SELECT coalesce(jsonb_agg(to_jsonb(q)), ''[]''::jsonb)
     FROM (
       SELECT DISTINCT %s
       FROM ingest.%I
       WHERE organization_id = $1
         AND (%s) IS NOT NULL
         AND btrim(%s) <> ''''
       LIMIT %s
     ) q',
    select_list,
    t,
    first_expr,
    first_expr,
    lim
  );

  execute sql into result using p_organization_id;
  return coalesce(result, '[]'::jsonb);
end;
$$;

revoke all on function public.list_ingest_tables() from public;
revoke all on function public.list_ingest_columns(text) from public;
revoke all on function public.ingest_lookup_distinct(text, text[], uuid, integer) from public;
grant execute on function public.list_ingest_tables() to service_role;
grant execute on function public.list_ingest_columns(text) to service_role;
grant execute on function public.ingest_lookup_distinct(text, text[], uuid, integer) to service_role;
