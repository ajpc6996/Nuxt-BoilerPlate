-- Platform-enabled optional connector drivers (MySQL, Postgres, …).

alter table public.platform_system_settings
  add column if not exists enabled_runners jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- Connector types: MySQL + PostgreSQL (disabled until platform enables runner)
-- ---------------------------------------------------------------------------

insert into public.connector_types (
  key, name, description, category, auth_mode, runner_key,
  connection_schema, config_schema, credential_schema, capabilities, is_system, is_enabled
)
values
(
  'mysql',
  'MySQL / MariaDB',
  'Read from MySQL/MariaDB (SELECT). Enable the mysql driver under Administration → Connector drivers.',
  'api',
  'basic',
  'mysql',
  '{
    "type": "object",
    "required": ["host", "database"],
    "properties": {
      "host": { "type": "string", "title": "Host", "default": "127.0.0.1" },
      "port": { "type": "integer", "title": "Port", "default": 3306 },
      "database": { "type": "string", "title": "Database name" },
      "ssl": { "type": "boolean", "title": "Use SSL", "default": false }
    }
  }'::jsonb,
  '{
    "type": "object",
    "required": ["table"],
    "properties": {
      "table": { "type": "string", "title": "Table name", "description": "Schema-qualified if needed, e.g. rt.Users" },
      "query": { "type": "string", "title": "Custom SELECT (optional)", "description": "Overrides table. Use for filtered extracts." },
      "maxRows": { "type": "integer", "title": "Max rows", "default": 5000 }
    }
  }'::jsonb,
  '{
    "type": "object",
    "required": ["username", "password"],
    "properties": {
      "username": { "type": "string", "title": "Username" },
      "password": { "type": "string", "title": "Password" }
    }
  }'::jsonb,
  '{"paging": false, "tokenRenewal": false, "notes": "Requires platform mysql driver"}'::jsonb,
  true,
  false
),
(
  'postgres',
  'PostgreSQL',
  'Read from PostgreSQL (SELECT). Enable the postgres driver under Administration → Connector drivers.',
  'api',
  'basic',
  'postgres',
  '{
    "type": "object",
    "required": ["host", "database"],
    "properties": {
      "host": { "type": "string", "title": "Host", "default": "127.0.0.1" },
      "port": { "type": "integer", "title": "Port", "default": 5432 },
      "database": { "type": "string", "title": "Database name" },
      "ssl": { "type": "boolean", "title": "Use SSL", "default": false }
    }
  }'::jsonb,
  '{
    "type": "object",
    "required": ["table"],
    "properties": {
      "table": { "type": "string", "title": "Table name", "description": "e.g. public.users" },
      "query": { "type": "string", "title": "Custom SELECT (optional)" },
      "maxRows": { "type": "integer", "title": "Max rows", "default": 5000 }
    }
  }'::jsonb,
  '{
    "type": "object",
    "required": ["username", "password"],
    "properties": {
      "username": { "type": "string", "title": "Username" },
      "password": { "type": "string", "title": "Password" }
    }
  }'::jsonb,
  '{"paging": false, "tokenRenewal": false, "notes": "Requires platform postgres driver"}'::jsonb,
  true,
  false
)
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  auth_mode = excluded.auth_mode,
  runner_key = excluded.runner_key,
  connection_schema = excluded.connection_schema,
  config_schema = excluded.config_schema,
  credential_schema = excluded.credential_schema,
  capabilities = excluded.capabilities,
  updated_at = now();
