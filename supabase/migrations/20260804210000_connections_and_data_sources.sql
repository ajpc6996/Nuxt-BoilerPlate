-- Split shared Connections (auth) from Data Sources (fetch + ingest).
-- Add connection_schema on connector types; migrate existing rows.

-- ---------------------------------------------------------------------------
-- connector_types: shared connection form schema (base URL, auth headers, …)
-- ---------------------------------------------------------------------------

alter table public.connector_types
  add column if not exists connection_schema jsonb not null default '{}'::jsonb;

alter table public.connector_types
  add column if not exists generation_notes text;

-- ---------------------------------------------------------------------------
-- data_sources: per-endpoint ingest definitions that reuse a connection
-- ---------------------------------------------------------------------------

create table if not exists public.data_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  connection_id uuid not null references public.connections (id) on delete cascade,
  name text not null,
  status text not null default 'draft'
    check (status in ('draft', 'ready', 'error')),
  config jsonb not null default '{}'::jsonb,
  destination_table text not null,
  sync_state jsonb not null default '{}'::jsonb,
  last_run_at timestamptz,
  last_error text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create index if not exists data_sources_org_id_idx
  on public.data_sources (organization_id);
create index if not exists data_sources_connection_id_idx
  on public.data_sources (connection_id);

drop trigger if exists data_sources_set_updated_at on public.data_sources;
create trigger data_sources_set_updated_at
  before update on public.data_sources
  for each row execute function public.set_updated_at();

alter table public.connection_runs
  add column if not exists data_source_id uuid references public.data_sources (id) on delete cascade;

create index if not exists connection_runs_data_source_id_idx
  on public.connection_runs (data_source_id);

alter table public.connection_ingest_rows
  add column if not exists data_source_id uuid references public.data_sources (id) on delete cascade;

create index if not exists connection_ingest_rows_data_source_id_idx
  on public.connection_ingest_rows (data_source_id);

-- ---------------------------------------------------------------------------
-- Migrate existing connections → one data_source each + split configs
-- ---------------------------------------------------------------------------

do $$
declare
  r record;
  conn_cfg jsonb;
  src_cfg jsonb;
  k text;
  conn_keys text[] := array[
    'baseUrl', 'authHeader', 'authPrefix',
    'tokenUrl', 'clientId', 'scopes', 'tokenRenewal'
  ];
  ds_id uuid;
begin
  for r in
    select c.*, ct.key as type_key
    from public.connections c
    join public.connector_types ct on ct.id = c.connector_type_id
    where not exists (
      select 1 from public.data_sources d where d.connection_id = c.id
    )
  loop
    conn_cfg := '{}'::jsonb;
    src_cfg := coalesce(r.config, '{}'::jsonb);

    if r.type_key = 'rest_generic' or src_cfg ? 'baseUrl' then
      foreach k in array conn_keys
      loop
        if src_cfg ? k then
          conn_cfg := conn_cfg || jsonb_build_object(k, src_cfg -> k);
          src_cfg := src_cfg - k;
        end if;
      end loop;
    end if;

    insert into public.data_sources (
      organization_id,
      connection_id,
      name,
      status,
      config,
      destination_table,
      sync_state,
      last_run_at,
      last_error,
      created_by,
      created_at,
      updated_at
    )
    values (
      r.organization_id,
      r.id,
      r.name,
      r.status,
      src_cfg,
      coalesce(nullif(r.destination_table, ''), 'legacy_' || substr(replace(r.id::text, '-', ''), 1, 12)),
      coalesce(r.sync_state, '{}'::jsonb),
      r.last_run_at,
      r.last_error,
      r.created_by,
      r.created_at,
      r.updated_at
    )
    returning id into ds_id;

    update public.connections
    set
      config = conn_cfg,
      sync_state = '{}'::jsonb,
      last_run_at = null,
      last_error = null,
      status = case when r.status = 'error' then 'draft' else r.status end
    where id = r.id;

    update public.connection_runs
    set data_source_id = ds_id
    where connection_id = r.id
      and data_source_id is null;

    update public.connection_ingest_rows
    set data_source_id = ds_id
    where connection_id = r.id
      and data_source_id is null;
  end loop;
end $$;

-- Make destination_table optional on connections (legacy column; unused going forward)
alter table public.connections
  alter column destination_table drop not null;

alter table public.connections
  alter column destination_table set default null;

update public.connections set destination_table = null where destination_table is not null;

-- ---------------------------------------------------------------------------
-- Update seeded type schemas
-- ---------------------------------------------------------------------------

update public.connector_types
set
  connection_schema = '{
    "type": "object",
    "properties": {}
  }'::jsonb,
  updated_at = now()
where key in ('json_file', 'csv_file');

update public.connector_types
set
  connection_schema = '{
    "type": "object",
    "required": ["baseUrl"],
    "properties": {
      "baseUrl": { "type": "string", "title": "Base URL" },
      "authHeader": {
        "type": "string",
        "title": "Auth header name",
        "default": "Authorization"
      },
      "authPrefix": {
        "type": "string",
        "title": "Auth value prefix",
        "description": "e.g. Bearer or Api-Key",
        "default": "Bearer"
      }
    }
  }'::jsonb,
  config_schema = '{
    "type": "object",
    "required": ["path"],
    "properties": {
      "path": {
        "type": "string",
        "title": "Path template",
        "description": "Use {variable} placeholders, e.g. /teams/{team_id}/players",
        "default": "/"
      },
      "method": {
        "type": "string",
        "title": "Method",
        "enum": ["GET", "POST"],
        "default": "GET"
      },
      "itemsPath": {
        "type": "string",
        "title": "Items path",
        "description": "Dotted path to the array in the response.",
        "default": ""
      },
      "pagingMode": {
        "type": "string",
        "title": "Paging mode",
        "enum": ["none", "next_url", "page_param"],
        "default": "none"
      },
      "nextUrlPath": {
        "type": "string",
        "title": "Next URL path",
        "description": "Dotted path to next page URL (pagingMode=next_url).",
        "default": "next"
      },
      "pageParam": {
        "type": "string",
        "title": "Page query param",
        "default": "page"
      },
      "maxPages": {
        "type": "integer",
        "title": "Max pages (per resolved URL)",
        "default": 5
      },
      "lookupEnabled": {
        "type": "boolean",
        "title": "Expand URL from ingest table",
        "description": "Fetch once per distinct value set from a prior ingest table.",
        "default": false
      },
      "lookupTable": {
        "type": "string",
        "title": "Lookup ingest table",
        "description": "Table name under ingest schema (without ingest. prefix)."
      },
      "maxExpansions": {
        "type": "integer",
        "title": "Max URL expansions",
        "default": 100
      }
    }
  }'::jsonb,
  capabilities = '{"tokenRenewal": false, "paging": true, "lookupExpansion": true}'::jsonb,
  updated_at = now()
where key = 'rest_generic';

-- ---------------------------------------------------------------------------
-- RLS + grants
-- ---------------------------------------------------------------------------

alter table public.data_sources enable row level security;

drop policy if exists "data_sources_select" on public.data_sources;
create policy "data_sources_select"
  on public.data_sources for select to authenticated
  using (
    private.is_platform_admin()
    or private.is_org_admin(organization_id)
  );

drop policy if exists "data_sources_write" on public.data_sources;
create policy "data_sources_write"
  on public.data_sources for all to authenticated
  using (
    (private.is_platform_admin() or private.is_org_admin(organization_id))
    and private.is_aal2()
  )
  with check (
    (private.is_platform_admin() or private.is_org_admin(organization_id))
    and private.is_aal2()
  );

grant select, insert, update, delete on public.data_sources to service_role;
grant select on public.data_sources to authenticated;
