# Local Ingest Backend Bootstrap (Postgres)

This project can route `ingest.*` and `staged.*` reads/writes to a locally
hosted Postgres warehouse when:

- `organizations.ingest_backend = 'local'`
- `INGEST_DATABASE_URL` (server env) points to that local Postgres

## Important: plain Postgres ≠ Supabase

**Do not** run `20260803120000_multi_tenant_auth.sql` on plain Postgres. It
references `auth.users` from Supabase Auth, which does not exist outside
hosted Supabase.

Use the dedicated bootstrap below instead.

## What the local DB must contain

In addition to the dynamic ingest/stage functions, the local SQL functions
reference a minimal subset of control-plane tables (synced from Supabase by
Nitro when an org runs ingest):

- `public.organizations` (at least `id`)
- `public.connections` (at least `id`, `organization_id`)
- `public.data_sources` (at least `id`, `organization_id`, `destination_table`)

`supabase/local_ingest_prereqs.sql` creates these stubs, the `ingest` schema
(required before `ingest_cycle` — that migration only creates `staged` explicitly),
and Supabase-role shims (`service_role`, `authenticated`, stub `auth.uid()`, etc.).

## Quick bootstrap (recommended)

**Step 0 — create the database** (the name must match your connection URL):

```bash
createdb ingest_warehouse
# or: psql postgres -c "CREATE DATABASE ingest_warehouse;"
```

Then bootstrap schema + functions into that database:

```bash
chmod +x scripts/bootstrap-local-ingest.sh
./scripts/bootstrap-local-ingest.sh 'postgres://user:pass@127.0.0.1:5432/ingest_warehouse'
```

Or with `INGEST_DATABASE_URL` already set:

```bash
./scripts/bootstrap-local-ingest.sh "$INGEST_DATABASE_URL"
```

## Manual bootstrap (same order)

1. `supabase/local_ingest_prereqs.sql`
2. `supabase/migrations/20260814120000_ingest_cycle_stage_system_settings.sql`
3. `supabase/migrations/20260805140000_ingest_read_rows.sql`
4. `supabase/local_ingest_lookup_functions.sql` (warehouse RPCs only — **not**
   `20260804200000_ingest_lookup_expansion.sql`, which updates `connector_types`
   on the Supabase control plane)
5. `supabase/migrations/20260807140000_reports.sql`
6. `supabase/migrations/20260806110000_dashboard_order_limit.sql`
7. `supabase/migrations/20260811140000_licence_mfa_and_purge.sql`
8. `supabase/migrations/20260811150000_ingest_lockdown.sql` (optional for dev)
9. `supabase/migrations/20260902100000_ingest_cycle_time_repair.sql` (fixes
   `cycle_time` on ingest tables when lockdown ran after cycle migration)

Skip `20260803120000_multi_tenant_auth.sql` and
`20260804210000_connections_and_data_sources.sql` — prereqs already provides
the minimal `organizations` / `connections` / `data_sources` tables.

## Role / grants note (`service_role`)

Migrations grant execute to `service_role`. `local_ingest_prereqs.sql` creates
that role if missing.

## How to use

1. Bootstrap local Postgres (above).
2. Set server env: `INGEST_DATABASE_URL=postgres://...`
3. In the app (platform admin): **Platform → Organizations** — use the
   **ingest: supabase / local** dropdown per org.
4. Run a single data source and verify rows appear in local `ingest.<table>`
   and stage batches behave as expected.

## Already applied migrations without `ingest` schema?

If you ran `20260814120000_ingest_cycle_stage_system_settings.sql` before
prereqs (or on a DB missing the schema), create it manually:

```sql
create schema if not exists ingest;
grant usage on schema ingest to service_role, authenticated;
grant all on schema ingest to service_role;
```

Then continue with the remaining bootstrap migrations.

## `ingest_lookup_expansion` / `connector_types` error?

`20260804200000_ingest_lookup_expansion.sql` ends with an `UPDATE` on
`public.connector_types` (Supabase control plane). Skip that file on the local
warehouse and run `supabase/local_ingest_lookup_functions.sql` instead.

If the migration failed on the `UPDATE` after creating functions, the lookup RPCs
may already exist — verify with:

```sql
select proname from pg_proc
where proname in ('ingest_lookup_distinct', 'list_ingest_tables', 'list_ingest_columns');
```

If missing, run `local_ingest_lookup_functions.sql`.
