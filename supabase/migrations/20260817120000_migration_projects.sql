-- Migration projects: multi-stage system migrations with hybrid ingest + dual-sink export.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.migration_projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  description text,
  status text not null default 'draft'
    check (status in ('draft', 'planning', 'ready', 'running', 'completed', 'archived')),
  source_connection_id uuid references public.connections (id) on delete set null,
  destination_connection_id uuid references public.connections (id) on delete set null,
  plan_config jsonb not null default '{}'::jsonb,
  default_run_mode text not null default 'sample'
    check (default_run_mode in ('sample', 'pilot', 'full')),
  sample_limit integer not null default 25
    check (sample_limit > 0 and sample_limit <= 500),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create index if not exists migration_projects_organization_id_idx
  on public.migration_projects (organization_id);
create index if not exists migration_projects_source_connection_id_idx
  on public.migration_projects (source_connection_id);
create index if not exists migration_projects_destination_connection_id_idx
  on public.migration_projects (destination_connection_id);

create table if not exists public.migration_stages (
  id uuid primary key default gen_random_uuid(),
  migration_project_id uuid not null references public.migration_projects (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  sort_order integer not null default 0,
  name text not null,
  description text,
  stage_type text not null default 'extract'
    check (stage_type in ('extract', 'transform', 'validate', 'export', 'manual')),
  entity_key text not null default '',
  status text not null default 'draft'
    check (status in ('draft', 'ready', 'blocked', 'skipped')),
  config jsonb not null default '{}'::jsonb,
  data_source_id uuid references public.data_sources (id) on delete set null,
  report_id uuid references public.reports (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists migration_stages_project_id_idx
  on public.migration_stages (migration_project_id, sort_order);
create index if not exists migration_stages_organization_id_idx
  on public.migration_stages (organization_id);
create index if not exists migration_stages_data_source_id_idx
  on public.migration_stages (data_source_id);

create table if not exists public.migration_runs (
  id uuid primary key default gen_random_uuid(),
  migration_project_id uuid not null references public.migration_projects (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  run_mode text not null default 'sample'
    check (run_mode in ('sample', 'pilot', 'full')),
  status text not null default 'pending'
    check (status in ('pending', 'running', 'completed', 'failed', 'cancelled')),
  run_tag uuid not null default gen_random_uuid(),
  stage_results jsonb not null default '[]'::jsonb,
  started_by uuid references public.profiles (id) on delete set null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  last_error text
);

create index if not exists migration_runs_project_id_idx
  on public.migration_runs (migration_project_id, started_at desc);
create index if not exists migration_runs_organization_id_idx
  on public.migration_runs (organization_id);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

drop trigger if exists migration_projects_set_updated_at on public.migration_projects;
create trigger migration_projects_set_updated_at
  before update on public.migration_projects
  for each row execute function public.set_updated_at();

drop trigger if exists migration_stages_set_updated_at on public.migration_stages;
create trigger migration_stages_set_updated_at
  before update on public.migration_stages
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS (org admin + platform admin, aal2 for writes)
-- ---------------------------------------------------------------------------

alter table public.migration_projects enable row level security;
alter table public.migration_stages enable row level security;
alter table public.migration_runs enable row level security;

create policy migration_projects_select on public.migration_projects
  for select to authenticated
  using (
    private.is_platform_admin()
    or private.is_org_admin(organization_id)
  );

create policy migration_projects_insert on public.migration_projects
  for insert to authenticated
  with check (
    private.is_platform_admin()
    or (private.is_org_admin(organization_id) and private.is_aal2())
  );

create policy migration_projects_update on public.migration_projects
  for update to authenticated
  using (
    private.is_platform_admin()
    or (private.is_org_admin(organization_id) and private.is_aal2())
  )
  with check (
    private.is_platform_admin()
    or (private.is_org_admin(organization_id) and private.is_aal2())
  );

create policy migration_projects_delete on public.migration_projects
  for delete to authenticated
  using (
    private.is_platform_admin()
    or (private.is_org_admin(organization_id) and private.is_aal2())
  );

create policy migration_stages_select on public.migration_stages
  for select to authenticated
  using (
    private.is_platform_admin()
    or private.is_org_admin(organization_id)
  );

create policy migration_stages_insert on public.migration_stages
  for insert to authenticated
  with check (
    private.is_platform_admin()
    or (private.is_org_admin(organization_id) and private.is_aal2())
  );

create policy migration_stages_update on public.migration_stages
  for update to authenticated
  using (
    private.is_platform_admin()
    or (private.is_org_admin(organization_id) and private.is_aal2())
  )
  with check (
    private.is_platform_admin()
    or (private.is_org_admin(organization_id) and private.is_aal2())
  );

create policy migration_stages_delete on public.migration_stages
  for delete to authenticated
  using (
    private.is_platform_admin()
    or (private.is_org_admin(organization_id) and private.is_aal2())
  );

create policy migration_runs_select on public.migration_runs
  for select to authenticated
  using (
    private.is_platform_admin()
    or private.is_org_admin(organization_id)
  );

create policy migration_runs_insert on public.migration_runs
  for insert to authenticated
  with check (
    private.is_platform_admin()
    or (private.is_org_admin(organization_id) and private.is_aal2())
  );

create policy migration_runs_update on public.migration_runs
  for update to authenticated
  using (
    private.is_platform_admin()
    or (private.is_org_admin(organization_id) and private.is_aal2())
  )
  with check (
    private.is_platform_admin()
    or (private.is_org_admin(organization_id) and private.is_aal2())
  );

grant select, insert, update, delete on public.migration_projects to authenticated, service_role;
grant select, insert, update, delete on public.migration_stages to authenticated, service_role;
grant select, insert, update, delete on public.migration_runs to authenticated, service_role;
