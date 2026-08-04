-- Data source connectors: types, connections, secrets, runs, ingest landing
-- Apply via Supabase SQL editor or CLI when linked.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Catalog: connector types (platform-managed)
-- ---------------------------------------------------------------------------

create table if not exists public.connector_types (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text,
  category text not null default 'api'
    check (category in ('api', 'file', 'rest')),
  auth_mode text not null default 'none'
    check (auth_mode in ('none', 'api_key', 'basic', 'oauth2', 'bearer')),
  runner_key text not null,
  config_schema jsonb not null default '{}'::jsonb,
  credential_schema jsonb not null default '{}'::jsonb,
  capabilities jsonb not null default '{}'::jsonb,
  is_system boolean not null default true,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Instances: connections (org-scoped)
-- ---------------------------------------------------------------------------

create table if not exists public.connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  connector_type_id uuid not null references public.connector_types (id) on delete restrict,
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

create index if not exists connections_org_id_idx
  on public.connections (organization_id);
create index if not exists connections_type_id_idx
  on public.connections (connector_type_id);

-- Secrets never exposed to authenticated clients via RLS
create table if not exists public.connection_secrets (
  connection_id uuid primary key references public.connections (id) on delete cascade,
  ciphertext text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.connection_runs (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.connections (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  status text not null default 'running'
    check (status in ('running', 'success', 'error')),
  mode text not null default 'run'
    check (mode in ('test', 'run')),
  rows_written integer not null default 0,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  started_by uuid references public.profiles (id) on delete set null
);

create index if not exists connection_runs_connection_id_idx
  on public.connection_runs (connection_id);

-- Logical destination landing (jsonb rows keyed by destination_table)
create table if not exists public.connection_ingest_rows (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  connection_id uuid not null references public.connections (id) on delete cascade,
  run_id uuid references public.connection_runs (id) on delete set null,
  destination_table text not null,
  row_index integer not null default 0,
  data jsonb not null,
  ingested_at timestamptz not null default now()
);

create index if not exists connection_ingest_rows_dest_idx
  on public.connection_ingest_rows (organization_id, destination_table);
create index if not exists connection_ingest_rows_connection_id_idx
  on public.connection_ingest_rows (connection_id);

drop trigger if exists connector_types_set_updated_at on public.connector_types;
create trigger connector_types_set_updated_at
  before update on public.connector_types
  for each row execute function public.set_updated_at();

drop trigger if exists connections_set_updated_at on public.connections;
create trigger connections_set_updated_at
  before update on public.connections
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Seed connector types
-- ---------------------------------------------------------------------------

insert into public.connector_types (
  key, name, description, category, auth_mode, runner_key,
  config_schema, credential_schema, capabilities, is_system, is_enabled
)
values
(
  'json_file',
  'JSON file / URL',
  'Ingest a JSON array or object from an HTTPS URL or pasted JSON.',
  'file',
  'none',
  'json_file',
  '{
    "type": "object",
    "required": ["sourceMode"],
    "properties": {
      "sourceMode": {
        "type": "string",
        "title": "Source mode",
        "enum": ["url", "inline"],
        "default": "url"
      },
      "sourceUrl": {
        "type": "string",
        "title": "JSON URL",
        "description": "HTTPS URL returning JSON (array or { items: [] })."
      },
      "inlineJson": {
        "type": "string",
        "title": "Inline JSON",
        "description": "Paste a JSON array or object when not using a URL."
      },
      "itemsPath": {
        "type": "string",
        "title": "Items path",
        "description": "Optional dotted path to the array (e.g. data.items).",
        "default": ""
      }
    }
  }'::jsonb,
  '{}'::jsonb,
  '{"tokenRenewal": false, "paging": false}'::jsonb,
  true,
  true
),
(
  'csv_file',
  'CSV file / URL',
  'Ingest CSV from an HTTPS URL or pasted CSV text (first row = headers).',
  'file',
  'none',
  'csv_file',
  '{
    "type": "object",
    "required": ["sourceMode"],
    "properties": {
      "sourceMode": {
        "type": "string",
        "title": "Source mode",
        "enum": ["url", "inline"],
        "default": "url"
      },
      "sourceUrl": {
        "type": "string",
        "title": "CSV URL"
      },
      "inlineCsv": {
        "type": "string",
        "title": "Inline CSV"
      },
      "delimiter": {
        "type": "string",
        "title": "Delimiter",
        "default": ","
      }
    }
  }'::jsonb,
  '{}'::jsonb,
  '{"tokenRenewal": false, "paging": false}'::jsonb,
  true,
  true
),
(
  'rest_generic',
  'REST API',
  'Fetch JSON from a REST endpoint. Supports API key / bearer auth and simple paging.',
  'rest',
  'api_key',
  'rest_generic',
  '{
    "type": "object",
    "required": ["baseUrl", "path"],
    "properties": {
      "baseUrl": { "type": "string", "title": "Base URL" },
      "path": { "type": "string", "title": "Path", "default": "/" },
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
        "title": "Max pages",
        "default": 5
      }
    }
  }'::jsonb,
  '{
    "type": "object",
    "properties": {
      "apiKey": {
        "type": "string",
        "title": "API key / token",
        "description": "Stored encrypted. Leave blank on update to keep existing."
      }
    }
  }'::jsonb,
  '{"tokenRenewal": false, "paging": true}'::jsonb,
  true,
  true
)
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  auth_mode = excluded.auth_mode,
  runner_key = excluded.runner_key,
  config_schema = excluded.config_schema,
  credential_schema = excluded.credential_schema,
  capabilities = excluded.capabilities,
  is_enabled = excluded.is_enabled,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.connector_types enable row level security;
alter table public.connections enable row level security;
alter table public.connection_secrets enable row level security;
alter table public.connection_runs enable row level security;
alter table public.connection_ingest_rows enable row level security;

-- Connector types: all authenticated can read enabled; only platform admin writes
drop policy if exists "connector_types_select" on public.connector_types;
create policy "connector_types_select"
  on public.connector_types for select to authenticated
  using (
    private.is_platform_admin()
    or is_enabled = true
  );

drop policy if exists "connector_types_write_platform" on public.connector_types;
create policy "connector_types_write_platform"
  on public.connector_types for all to authenticated
  using (private.is_platform_admin() and private.is_aal2())
  with check (private.is_platform_admin() and private.is_aal2());

-- Connections: org admin or platform admin
drop policy if exists "connections_select" on public.connections;
create policy "connections_select"
  on public.connections for select to authenticated
  using (
    private.is_platform_admin()
    or private.is_org_admin(organization_id)
  );

drop policy if exists "connections_write" on public.connections;
create policy "connections_write"
  on public.connections for all to authenticated
  using (
    (private.is_platform_admin() or private.is_org_admin(organization_id))
    and private.is_aal2()
  )
  with check (
    (private.is_platform_admin() or private.is_org_admin(organization_id))
    and private.is_aal2()
  );

-- Secrets: no policies for authenticated (server/service role only)
-- (intentional empty — deny by default under RLS)

-- Runs + ingest: same as connections
drop policy if exists "connection_runs_select" on public.connection_runs;
create policy "connection_runs_select"
  on public.connection_runs for select to authenticated
  using (
    private.is_platform_admin()
    or private.is_org_admin(organization_id)
  );

drop policy if exists "connection_runs_write" on public.connection_runs;
create policy "connection_runs_write"
  on public.connection_runs for all to authenticated
  using (
    (private.is_platform_admin() or private.is_org_admin(organization_id))
    and private.is_aal2()
  )
  with check (
    (private.is_platform_admin() or private.is_org_admin(organization_id))
    and private.is_aal2()
  );

drop policy if exists "connection_ingest_rows_select" on public.connection_ingest_rows;
create policy "connection_ingest_rows_select"
  on public.connection_ingest_rows for select to authenticated
  using (
    private.is_platform_admin()
    or private.is_org_admin(organization_id)
  );

drop policy if exists "connection_ingest_rows_write" on public.connection_ingest_rows;
create policy "connection_ingest_rows_write"
  on public.connection_ingest_rows for all to authenticated
  using (
    (private.is_platform_admin() or private.is_org_admin(organization_id))
    and private.is_aal2()
  )
  with check (
    (private.is_platform_admin() or private.is_org_admin(organization_id))
    and private.is_aal2()
  );

grant select on public.connector_types to authenticated;
grant select, insert, update, delete on public.connector_types to authenticated;
grant select, insert, update, delete on public.connections to authenticated;
grant select, insert, update, delete on public.connection_runs to authenticated;
grant select, insert, update, delete on public.connection_ingest_rows to authenticated;
-- connection_secrets: no grant to authenticated
