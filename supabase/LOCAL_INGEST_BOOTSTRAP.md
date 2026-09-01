# Local Ingest Backend Bootstrap (Postgres)

This project can route `ingest.*` and `staged.*` reads/writes to a locally
hosted Postgres warehouse when:

- `organizations.ingest_backend = 'local'`
- `INGEST_DATABASE_URL` (server env) points to that local Postgres

## What the local DB must contain

In addition to the dynamic ingest/stage functions, the local SQL functions
also reference a minimal subset of your control-plane tables:

- `public.organizations` (at least `id`)
- `public.connections` (at least `id`)
- `public.data_sources` (at least `id`, `organization_id`, `destination_table`)

The easiest way to satisfy this is to apply the same Supabase migrations used
in this repo (in dependency order) onto the local Postgres.

## Suggested migration subset

Apply these migrations (copy their names from `supabase/migrations/`):

- `20260803120000_multi_tenant_auth.sql` (creates organizations)
- `20260804210000_connections_and_data_sources.sql` (creates connections + data_sources)
- `20260814120000_ingest_cycle_stage_system_settings.sql` (creates ingest/staged functions + schemas)
- `20260805140000_ingest_read_rows.sql` (creates `ingest_read_rows`)
- `20260804200000_ingest_lookup_expansion.sql` (creates `ingest_lookup_distinct`)
- `20260807140000_reports.sql` (creates `report_run_query`)
- `20260806110000_dashboard_order_limit.sql` (creates `dashboard_run_query`)
- `20260811140000_licence_mfa_and_purge.sql` (creates `licence_purge_ingest_rows`)
- `20260811150000_ingest_lockdown.sql` (locks down ingest schema; optional for dev)

## Role / grants note (`service_role`)

The migrations include `grant execute ... to service_role;`.
On a plain local Postgres, ensure a role named `service_role` exists (or
adjust grants) if those migrations fail on role resolution.

## How to use

1. Start local Postgres.
2. Set server env: `INGEST_DATABASE_URL=postgres://...`
3. Update an organization:
   - `PUT /api/platform/organizations/:id/ingest-backend` with
     `{"ingestBackend":"local"}`
4. Run a single data source:
   - verify rows appear in local `ingest.<table>` and stage is used as expected.

