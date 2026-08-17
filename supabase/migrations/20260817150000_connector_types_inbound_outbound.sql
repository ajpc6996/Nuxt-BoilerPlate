-- Full connector catalog: inbound + outbound support for migrations and data flows.

-- Update built-in types (REST, CSV, JSON) with outbound config fields
update public.connector_types set
  description = 'REST API read (GET) and write (POST/PUT). Supports API key / bearer auth and paging.',
  capabilities = '{"paging": true, "tokenRenewal": false, "directions": ["inbound", "outbound"]}'::jsonb,
  config_schema = config_schema || '{
    "properties": {
      "exportMethod": { "type": "string", "title": "Export method", "enum": ["POST", "PUT", "PATCH"], "default": "POST" },
      "bodyMode": { "type": "string", "title": "Body mode", "enum": ["array", "row"], "default": "array", "description": "Send all rows in one request or one request per row." }
    }
  }'::jsonb,
  updated_at = now()
where key = 'rest_generic';

update public.connector_types set
  description = 'CSV read from URL/inline and write via PUT URL, local path, or inline preview.',
  capabilities = '{"paging": false, "tokenRenewal": false, "directions": ["inbound", "outbound"]}'::jsonb,
  config_schema = config_schema || '{
    "properties": {
      "destMode": { "type": "string", "title": "Destination mode", "enum": ["inline", "putUrl", "localPath"], "default": "putUrl" },
      "destUrl": { "type": "string", "title": "Destination URL (PUT)" },
      "destPath": { "type": "string", "title": "Local file path (server)" }
    }
  }'::jsonb,
  updated_at = now()
where key = 'csv_file';

update public.connector_types set
  description = 'JSON read from URL/inline and write via PUT URL, local path, or inline preview.',
  capabilities = '{"paging": false, "tokenRenewal": false, "directions": ["inbound", "outbound"]}'::jsonb,
  config_schema = config_schema || '{
    "properties": {
      "destMode": { "type": "string", "title": "Destination mode", "enum": ["inline", "putUrl", "localPath"], "default": "putUrl" },
      "destUrl": { "type": "string", "title": "Destination URL (PUT)" },
      "destPath": { "type": "string", "title": "Local file path (server)" },
      "wrapKey": { "type": "string", "title": "Wrap key", "description": "Optional root key when exporting, e.g. items" }
    }
  }'::jsonb,
  updated_at = now()
where key = 'json_file';

-- Update MySQL / Postgres descriptions
update public.connector_types set
  description = 'MySQL/MariaDB read (SELECT) and write (INSERT). Enable the mysql driver under Administration → Connector drivers.',
  capabilities = '{"paging": false, "tokenRenewal": false, "directions": ["inbound", "outbound"]}'::jsonb,
  updated_at = now()
where key = 'mysql';

update public.connector_types set
  description = 'PostgreSQL read (SELECT) and write (INSERT). Enable the postgres driver under Administration → Connector drivers.',
  capabilities = '{"paging": false, "tokenRenewal": false, "directions": ["inbound", "outbound"]}'::jsonb,
  updated_at = now()
where key = 'postgres';

-- Optional drivers (disabled until platform enables runner)
insert into public.connector_types (
  key, name, description, category, auth_mode, runner_key,
  connection_schema, config_schema, credential_schema, capabilities, is_system, is_enabled
)
values
(
  'mssql',
  'Microsoft SQL Server',
  'SQL Server read/write. Enable the mssql driver under Administration → Connector drivers.',
  'api',
  'basic',
  'mssql',
  '{
    "type": "object",
    "required": ["host", "database"],
    "properties": {
      "host": { "type": "string", "title": "Host", "default": "127.0.0.1" },
      "port": { "type": "integer", "title": "Port", "default": 1433 },
      "database": { "type": "string", "title": "Database name" },
      "encrypt": { "type": "boolean", "title": "Encrypt", "default": true },
      "trustServerCertificate": { "type": "boolean", "title": "Trust server certificate", "default": false }
    }
  }'::jsonb,
  '{
    "type": "object",
    "required": ["table"],
    "properties": {
      "table": { "type": "string", "title": "Table name" },
      "query": { "type": "string", "title": "Custom SELECT (inbound only)" },
      "maxRows": { "type": "integer", "title": "Max rows (inbound)", "default": 5000 }
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
  '{"paging": false, "directions": ["inbound", "outbound"]}'::jsonb,
  true,
  false
),
(
  'mongodb',
  'MongoDB',
  'MongoDB find/insertMany. Enable the mongodb driver under Administration → Connector drivers.',
  'api',
  'basic',
  'mongodb',
  '{
    "type": "object",
    "properties": {
      "host": { "type": "string", "title": "Host", "default": "127.0.0.1" },
      "port": { "type": "integer", "title": "Port", "default": 27017 },
      "database": { "type": "string", "title": "Database name" },
      "connectionString": { "type": "string", "title": "Connection string (optional)" }
    }
  }'::jsonb,
  '{
    "type": "object",
    "required": ["collection"],
    "properties": {
      "collection": { "type": "string", "title": "Collection name" },
      "filter": { "type": "object", "title": "Find filter (inbound)" },
      "maxRows": { "type": "integer", "title": "Max rows (inbound)", "default": 5000 }
    }
  }'::jsonb,
  '{
    "type": "object",
    "properties": {
      "username": { "type": "string", "title": "Username" },
      "password": { "type": "string", "title": "Password" },
      "connectionString": { "type": "string", "title": "Connection string" }
    }
  }'::jsonb,
  '{"paging": false, "directions": ["inbound", "outbound"]}'::jsonb,
  true,
  false
),
(
  'elasticsearch',
  'Elasticsearch',
  'Elasticsearch search/bulk index. Enable the elasticsearch driver under Administration → Connector drivers.',
  'api',
  'basic',
  'elasticsearch',
  '{
    "type": "object",
    "properties": {
      "node": { "type": "string", "title": "Node URL", "default": "http://127.0.0.1:9200" }
    }
  }'::jsonb,
  '{
    "type": "object",
    "required": ["index"],
    "properties": {
      "index": { "type": "string", "title": "Index name" },
      "query": { "type": "object", "title": "Search query (inbound)" },
      "idField": { "type": "string", "title": "Document ID field (outbound)", "default": "_id" },
      "maxRows": { "type": "integer", "title": "Max rows (inbound)", "default": 1000 }
    }
  }'::jsonb,
  '{
    "type": "object",
    "properties": {
      "username": { "type": "string", "title": "Username" },
      "password": { "type": "string", "title": "Password" },
      "apiKey": { "type": "string", "title": "API key" }
    }
  }'::jsonb,
  '{"paging": false, "directions": ["inbound", "outbound"]}'::jsonb,
  true,
  false
),
(
  'oracle',
  'Oracle Database',
  'Oracle read/write. Requires oracledb + Instant Client. Enable under Administration → Connector drivers.',
  'api',
  'basic',
  'oracle',
  '{
    "type": "object",
    "required": ["connectString"],
    "properties": {
      "connectString": { "type": "string", "title": "Connect string", "description": "e.g. localhost:1521/ORCL" }
    }
  }'::jsonb,
  '{
    "type": "object",
    "required": ["table"],
    "properties": {
      "table": { "type": "string", "title": "Table name" },
      "query": { "type": "string", "title": "Custom SELECT (inbound)" },
      "maxRows": { "type": "integer", "title": "Max rows (inbound)", "default": 5000 }
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
  '{"paging": false, "directions": ["inbound", "outbound"]}'::jsonb,
  true,
  false
),
(
  's3',
  'S3 / object storage',
  'S3-compatible GetObject/PutObject for JSON or CSV. Enable the s3 driver under Administration → Connector drivers.',
  'file',
  'basic',
  's3',
  '{
    "type": "object",
    "properties": {
      "region": { "type": "string", "title": "Region", "default": "us-east-1" },
      "endpoint": { "type": "string", "title": "Custom endpoint (MinIO, etc.)" },
      "forcePathStyle": { "type": "boolean", "title": "Force path-style URLs", "default": true }
    }
  }'::jsonb,
  '{
    "type": "object",
    "required": ["bucket", "key"],
    "properties": {
      "bucket": { "type": "string", "title": "Bucket" },
      "key": { "type": "string", "title": "Object key" },
      "format": { "type": "string", "title": "Format", "enum": ["json", "csv"], "default": "json" },
      "delimiter": { "type": "string", "title": "CSV delimiter", "default": "," },
      "itemsPath": { "type": "string", "title": "Items path (JSON inbound)" }
    }
  }'::jsonb,
  '{
    "type": "object",
    "properties": {
      "accessKeyId": { "type": "string", "title": "Access key ID" },
      "secretAccessKey": { "type": "string", "title": "Secret access key" }
    }
  }'::jsonb,
  '{"paging": false, "directions": ["inbound", "outbound"]}'::jsonb,
  true,
  false
),
(
  'sftp',
  'SFTP',
  'SFTP download/upload for JSON or CSV. Enable the sftp driver under Administration → Connector drivers.',
  'file',
  'basic',
  'sftp',
  '{
    "type": "object",
    "required": ["host"],
    "properties": {
      "host": { "type": "string", "title": "Host" },
      "port": { "type": "integer", "title": "Port", "default": 22 }
    }
  }'::jsonb,
  '{
    "type": "object",
    "required": ["remotePath"],
    "properties": {
      "remotePath": { "type": "string", "title": "Remote file path" },
      "format": { "type": "string", "title": "Format", "enum": ["json", "csv"], "default": "json" },
      "delimiter": { "type": "string", "title": "CSV delimiter", "default": "," },
      "itemsPath": { "type": "string", "title": "Items path (JSON inbound)" }
    }
  }'::jsonb,
  '{
    "type": "object",
    "required": ["username"],
    "properties": {
      "username": { "type": "string", "title": "Username" },
      "password": { "type": "string", "title": "Password" },
      "privateKey": { "type": "string", "title": "Private key (PEM)" }
    }
  }'::jsonb,
  '{"paging": false, "directions": ["inbound", "outbound"]}'::jsonb,
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
