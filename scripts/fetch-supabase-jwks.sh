#!/usr/bin/env bash
# Cache Supabase JWKS into .env for local JWT verification (VPN / TLS MITM safe).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ROOT}/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing .env — copy from .env.example first." >&2
  exit 1
fi

SUPABASE_URL="$(grep '^NUXT_PUBLIC_SUPABASE_URL=' "$ENV_FILE" | head -n1 | cut -d= -f2- | tr -d '\r')"
if [[ -z "$SUPABASE_URL" ]]; then
  echo "NUXT_PUBLIC_SUPABASE_URL is not set in .env" >&2
  exit 1
fi

JWKS_URL="${SUPABASE_URL%/}/auth/v1/.well-known/jwks.json"
echo "Fetching JWKS from $JWKS_URL"

JWKS_JSON="$(curl -fsSL "$JWKS_URL")"
if ! printf '%s' "$JWKS_JSON" | python3 -c 'import json,sys; json.load(sys.stdin)' >/dev/null 2>&1; then
  echo "JWKS response was not valid JSON" >&2
  exit 1
fi

# Single-line JSON for .env
JWKS_LINE="$(printf '%s' "$JWKS_JSON" | python3 -c 'import json,sys; print(json.dumps(json.load(sys.stdin), separators=(",",":")))')"

TMP="$(mktemp)"
grep -v '^SUPABASE_JWKS_JSON=' "$ENV_FILE" > "$TMP" || true
printf 'SUPABASE_JWKS_JSON=%s\n' "'$JWKS_LINE'" >> "$TMP"
mv "$TMP" "$ENV_FILE"

echo "Updated SUPABASE_JWKS_JSON in .env"
echo "Restart npm run dev to apply."
