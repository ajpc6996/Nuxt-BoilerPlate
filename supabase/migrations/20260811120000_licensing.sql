-- ---------------------------------------------------------------------------
-- Phase 1 licensing: plans, org licences, platform policy settings
-- Entitlements are resolved server-side only (service_role). Clients never
-- unlock features by forging local state.
-- ---------------------------------------------------------------------------

-- Platform-wide grace / retention / renew window (single row)
create table if not exists public.licence_platform_settings (
  id smallint primary key default 1 check (id = 1),
  grace_days integer not null default 3 check (grace_days >= 0 and grace_days <= 90),
  data_retention_days integer not null default 15
    check (data_retention_days >= 0 and data_retention_days <= 365),
  renew_refresh_hours integer not null default 72
    check (renew_refresh_hours >= 0 and renew_refresh_hours <= 720),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

insert into public.licence_platform_settings (id)
values (1)
on conflict (id) do nothing;

-- Sellable / assignable plans
create table if not exists public.licence_plans (
  key text primary key
    check (key ~ '^[a-z][a-z0-9_]{0,62}$'),
  name text not null,
  description text not null default '',
  features jsonb not null default '{}'::jsonb,
  limits jsonb not null default '{}'::jsonb,
  trial_days integer not null default 0 check (trial_days >= 0 and trial_days <= 365),
  is_default boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists licence_plans_one_default_idx
  on public.licence_plans (is_default)
  where is_default = true;

drop trigger if exists licence_plans_set_updated_at on public.licence_plans;
create trigger licence_plans_set_updated_at
  before update on public.licence_plans
  for each row execute function public.set_updated_at();

-- One active licence row per organization (history can be added later)
create table if not exists public.organization_licences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations (id) on delete cascade,
  plan_key text not null references public.licence_plans (key),
  status text not null default 'trialing'
    check (status in ('trialing', 'active', 'past_due', 'locked', 'canceled')),
  -- Snapshot at assign time (plan edits do not rewrite existing orgs unless reassigned)
  features jsonb not null default '{}'::jsonb,
  limits jsonb not null default '{}'::jsonb,
  overrides jsonb not null default '{}'::jsonb,
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  grace_ends_at timestamptz,
  data_purge_at timestamptz,
  -- HMAC token material is issued by the API; DB stores last issued metadata only
  licence_version integer not null default 1,
  last_validated_at timestamptz,
  notes text not null default '',
  -- Stripe fields reserved for Phase 3
  stripe_customer_id text,
  stripe_subscription_id text,
  assigned_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists organization_licences_status_idx
  on public.organization_licences (status);
create index if not exists organization_licences_plan_key_idx
  on public.organization_licences (plan_key);

drop trigger if exists organization_licences_set_updated_at on public.organization_licences;
create trigger organization_licences_set_updated_at
  before update on public.organization_licences
  for each row execute function public.set_updated_at();

-- Cached usage meters (refreshed by server on demand / after writes)
create table if not exists public.organization_usage (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  period_start date not null,
  users_active integer not null default 0,
  connections integer not null default 0,
  data_sources integer not null default 0,
  dashboards integer not null default 0,
  reports integer not null default 0,
  ingest_rows_period bigint not null default 0,
  updated_at timestamptz not null default now()
);

-- Seed plans (limits: -1 = unlimited)
insert into public.licence_plans (key, name, description, features, limits, trial_days, is_default, sort_order)
values
  (
    'trial',
    'Trial',
    'Time-boxed trial with modest connection, source, and ingest caps.',
    '{
      "dataSources": true,
      "dashboards": true,
      "reports": true,
      "export": true,
      "mfaRequired": false,
      "connectorTypes": false
    }'::jsonb,
    '{
      "maxUsers": 3,
      "maxConnections": 2,
      "maxDataSources": 2,
      "maxDashboards": 3,
      "maxReports": 3,
      "maxIngestRowsPerMonth": 50000
    }'::jsonb,
    14,
    true,
    10
  ),
  (
    'starter',
    'Starter',
    'Small teams getting started with core analytics.',
    '{
      "dataSources": true,
      "dashboards": true,
      "reports": true,
      "export": true,
      "mfaRequired": false,
      "connectorTypes": false
    }'::jsonb,
    '{
      "maxUsers": 10,
      "maxConnections": 5,
      "maxDataSources": 10,
      "maxDashboards": 10,
      "maxReports": 10,
      "maxIngestRowsPerMonth": 250000
    }'::jsonb,
    0,
    false,
    20
  ),
  (
    'pro',
    'Pro',
    'Growing orgs with higher ingest and MFA required.',
    '{
      "dataSources": true,
      "dashboards": true,
      "reports": true,
      "export": true,
      "mfaRequired": true,
      "connectorTypes": true
    }'::jsonb,
    '{
      "maxUsers": 50,
      "maxConnections": 25,
      "maxDataSources": 50,
      "maxDashboards": 50,
      "maxReports": 50,
      "maxIngestRowsPerMonth": 2000000
    }'::jsonb,
    0,
    false,
    30
  ),
  (
    'enterprise',
    'Enterprise',
    'High ceilings for large deployments.',
    '{
      "dataSources": true,
      "dashboards": true,
      "reports": true,
      "export": true,
      "mfaRequired": true,
      "connectorTypes": true
    }'::jsonb,
    '{
      "maxUsers": -1,
      "maxConnections": -1,
      "maxDataSources": -1,
      "maxDashboards": -1,
      "maxReports": -1,
      "maxIngestRowsPerMonth": -1
    }'::jsonb,
    0,
    false,
    40
  )
on conflict (key) do nothing;

-- Assign default trial licence when an organization is created
create or replace function private.assign_default_org_licence()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  plan_rec public.licence_plans%rowtype;
  trial_end timestamptz;
begin
  select * into plan_rec
  from public.licence_plans
  where is_default = true and is_active = true
  order by sort_order
  limit 1;

  if not found then
    select * into plan_rec
    from public.licence_plans
    where key = 'trial' and is_active = true
    limit 1;
  end if;

  if not found then
    return new;
  end if;

  if plan_rec.trial_days > 0 then
    trial_end := now() + make_interval(days => plan_rec.trial_days);
  else
    trial_end := null;
  end if;

  insert into public.organization_licences (
    organization_id,
    plan_key,
    status,
    features,
    limits,
    trial_ends_at,
    current_period_start,
    current_period_end
  )
  values (
    new.id,
    plan_rec.key,
    case when plan_rec.trial_days > 0 then 'trialing' else 'active' end,
    coalesce(plan_rec.features, '{}'::jsonb),
    coalesce(plan_rec.limits, '{}'::jsonb),
    trial_end,
    now(),
    trial_end
  )
  on conflict (organization_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_organization_assign_licence on public.organizations;
create trigger on_organization_assign_licence
  after insert on public.organizations
  for each row execute function private.assign_default_org_licence();

-- Backfill licences for existing organizations
insert into public.organization_licences (
  organization_id,
  plan_key,
  status,
  features,
  limits,
  trial_ends_at,
  current_period_start,
  current_period_end
)
select
  o.id,
  p.key,
  case when p.trial_days > 0 then 'trialing' else 'active' end,
  p.features,
  p.limits,
  case when p.trial_days > 0 then now() + make_interval(days => p.trial_days) else null end,
  now(),
  case when p.trial_days > 0 then now() + make_interval(days => p.trial_days) else null end
from public.organizations o
cross join lateral (
  select * from public.licence_plans
  where is_default = true and is_active = true
  order by sort_order
  limit 1
) p
on conflict (organization_id) do nothing;

-- RLS: members can read their org licence + usage; plans readable to authenticated;
-- writes are platform / service_role only.
alter table public.licence_platform_settings enable row level security;
alter table public.licence_plans enable row level security;
alter table public.organization_licences enable row level security;
alter table public.organization_usage enable row level security;

drop policy if exists "licence_plans_select" on public.licence_plans;
create policy "licence_plans_select"
  on public.licence_plans for select to authenticated
  using (is_active = true or private.is_platform_admin());

drop policy if exists "licence_plans_write_platform" on public.licence_plans;
create policy "licence_plans_write_platform"
  on public.licence_plans for all to authenticated
  using (private.is_platform_admin() and private.is_aal2())
  with check (private.is_platform_admin() and private.is_aal2());

drop policy if exists "licence_settings_select_platform" on public.licence_platform_settings;
create policy "licence_settings_select_platform"
  on public.licence_platform_settings for select to authenticated
  using (private.is_platform_admin());

drop policy if exists "licence_settings_write_platform" on public.licence_platform_settings;
create policy "licence_settings_write_platform"
  on public.licence_platform_settings for all to authenticated
  using (private.is_platform_admin() and private.is_aal2())
  with check (private.is_platform_admin() and private.is_aal2());

drop policy if exists "organization_licences_select" on public.organization_licences;
create policy "organization_licences_select"
  on public.organization_licences for select to authenticated
  using (
    private.is_platform_admin()
    or private.is_org_member(organization_id)
  );

drop policy if exists "organization_licences_write_platform" on public.organization_licences;
create policy "organization_licences_write_platform"
  on public.organization_licences for all to authenticated
  using (private.is_platform_admin() and private.is_aal2())
  with check (private.is_platform_admin() and private.is_aal2());

drop policy if exists "organization_usage_select" on public.organization_usage;
create policy "organization_usage_select"
  on public.organization_usage for select to authenticated
  using (
    private.is_platform_admin()
    or private.is_org_member(organization_id)
  );

-- Usage writes only via service role (no authenticated write policy)

grant select on public.licence_plans to authenticated;
grant select, insert, update, delete on public.licence_plans to service_role;

grant select on public.licence_platform_settings to authenticated;
grant select, insert, update, delete on public.licence_platform_settings to service_role;

grant select on public.organization_licences to authenticated;
grant select, insert, update, delete on public.organization_licences to service_role;

grant select on public.organization_usage to authenticated;
grant select, insert, update, delete on public.organization_usage to service_role;
