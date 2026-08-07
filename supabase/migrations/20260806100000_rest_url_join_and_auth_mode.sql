-- REST: avoid appending "/" after query strings; optional no-auth connections.

update public.connector_types
set
  auth_mode = 'api_key',
  description = 'Fetch JSON from a REST endpoint. Supports no auth or API key / bearer, and simple paging.',
  connection_schema = '{
    "type": "object",
    "required": ["baseUrl"],
    "properties": {
      "baseUrl": {
        "type": "string",
        "title": "Base URL",
        "description": "Origin + optional path prefix, e.g. https://api.coingecko.com/api/v3 — or the full URL if Path is left empty."
      },
      "authMode": {
        "type": "string",
        "title": "Authentication",
        "description": "Use none for public APIs (no Authorization header).",
        "enum": ["none", "api_key"],
        "default": "none"
      },
      "authHeader": {
        "type": "string",
        "title": "Auth header name",
        "default": "Authorization"
      },
      "authPrefix": {
        "type": "string",
        "title": "Auth value prefix",
        "description": "e.g. Bearer or Api-Key. Leave empty to send the raw key.",
        "default": "Bearer"
      }
    }
  }'::jsonb,
  config_schema = '{
    "type": "object",
    "properties": {
      "path": {
        "type": "string",
        "title": "Path template",
        "description": "Relative to Base URL, e.g. /coins/markets?vs_currency=usd. Leave empty if Base URL is already the full request URL. Do not use a lone / when Base URL includes a query string.",
        "default": ""
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
        "description": "Dotted path to the array in the response. Leave empty if the root is an array.",
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
  credential_schema = '{
    "type": "object",
    "properties": {
      "apiKey": {
        "type": "string",
        "title": "API key / token",
        "description": "Required only when Authentication is api_key. Leave blank for public APIs."
      }
    }
  }'::jsonb,
  updated_at = now()
where key = 'rest_generic';

-- Existing REST connections: default to no auth unless they already store secrets.
update public.connections c
set
  config = coalesce(c.config, '{}'::jsonb) || jsonb_build_object(
    'authMode',
    case
      when exists (
        select 1 from public.connection_secrets s where s.connection_id = c.id
      ) then 'api_key'
      else 'none'
    end
  ),
  updated_at = now()
where c.connector_type_id in (
  select id from public.connector_types where key = 'rest_generic'
)
and coalesce(c.config ->> 'authMode', '') = '';
