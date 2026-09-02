#!/usr/bin/env bash
# Bootstrap a plain Postgres database for organizations.ingest_backend = 'local'.
# Usage: ./scripts/bootstrap-local-ingest.sh 'postgres://user:pass@127.0.0.1:5433/ingest_warehouse'

set -euo pipefail

DB_URL="${1:-${INGEST_DATABASE_URL:-}}"
if [[ -z "$DB_URL" ]]; then
  echo "Usage: $0 'postgres://user:pass@host:port/dbname'" >&2
  echo "Or set INGEST_DATABASE_URL." >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MIGRATIONS=(
  local_ingest_prereqs.sql
  migrations/20260814120000_ingest_cycle_stage_system_settings.sql
  migrations/20260805140000_ingest_read_rows.sql
  local_ingest_lookup_functions.sql
  migrations/20260807140000_reports.sql
  migrations/20260806110000_dashboard_order_limit.sql
  migrations/20260811140000_licence_mfa_and_purge.sql
  migrations/20260811150000_ingest_lockdown.sql
  migrations/20260902100000_ingest_cycle_time_repair.sql
)

for rel in "${MIGRATIONS[@]}"; do
  file="$ROOT/supabase/$rel"
  if [[ ! -f "$file" ]]; then
    echo "Missing: $file" >&2
    exit 1
  fi
  echo "==> $rel"
  psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$file"
done

echo "Local ingest warehouse bootstrap complete."
