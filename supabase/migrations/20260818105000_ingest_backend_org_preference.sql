-- Per-organization ingest backend selection:
-- - 'supabase' keeps existing behavior (hosted Postgres ingest + stages)
-- - 'local' routes ingest.* / staged.* reads/writes to a local Postgres warehouse

alter table public.organizations
  add column if not exists ingest_backend text not null default 'supabase'
  check (ingest_backend in ('supabase', 'local'));

-- Backfill any NULLs (defensive for older migrations / manual edits).
update public.organizations
set ingest_backend = 'supabase'
where ingest_backend is null;

