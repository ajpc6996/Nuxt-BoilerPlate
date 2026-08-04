-- Multi-tenant auth foundation: profiles, orgs, roles, RLS helpers
-- Apply via Supabase SQL editor or `supabase db push` when CLI is linked.

create extension if not exists "pgcrypto";

create schema if not exists private;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  is_platform_admin boolean not null default false,
  mfa_opt_in boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  mfa_mode text not null default 'optional'
    check (mfa_mode in ('off', 'optional', 'required')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'active'
    check (status in ('active', 'invited', 'disabled')),
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  description text,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role_id uuid not null references public.roles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, role_id)
);

create index if not exists organization_members_user_id_idx
  on public.organization_members (user_id);
create index if not exists organization_members_org_id_idx
  on public.organization_members (organization_id);
create index if not exists user_roles_user_id_idx
  on public.user_roles (user_id);
create index if not exists user_roles_org_id_idx
  on public.user_roles (organization_id);

-- ---------------------------------------------------------------------------
-- Helper functions (authorization data lives in tables, not user_metadata)
-- ---------------------------------------------------------------------------

create or replace function private.jwt_aal()
returns text
language sql
stable
as $$
  select coalesce((select auth.jwt() ->> 'aal'), 'aal1');
$$;

create or replace function private.is_aal2()
returns boolean
language sql
stable
as $$
  select private.jwt_aal() = 'aal2';
$$;

create or replace function private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select p.is_platform_admin
      from public.profiles p
      where p.id = (select auth.uid())
    ),
    false
  );
$$;

create or replace function private.is_org_member(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = org_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  );
$$;

create or replace function private.has_org_role(org_id uuid, role_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.organization_id = org_id
      and ur.user_id = (select auth.uid())
      and r.name = role_name
  );
$$;

create or replace function private.is_org_admin(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select private.has_org_role(org_id, 'Admin');
$$;

-- Public wrappers for the client (read-only checks)
create or replace function public.current_is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select private.is_platform_admin();
$$;

create or replace function public.current_has_org_role(org_id uuid, role_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select private.has_org_role(org_id, role_name);
$$;

revoke all on function public.current_is_platform_admin() from public;
revoke all on function public.current_has_org_role(uuid, text) from public;
grant execute on function public.current_is_platform_admin() to authenticated;
grant execute on function public.current_has_org_role(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do update
    set email = excluded.email,
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.handle_new_organization()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.roles (organization_id, name, description, is_system)
  values (new.id, 'Admin', 'Organization administrator', true)
  on conflict (organization_id, name) do nothing;
  return new;
end;
$$;

drop trigger if exists on_organization_created on public.organizations;
create trigger on_organization_created
  after insert on public.organizations
  for each row execute function public.handle_new_organization();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists organizations_set_updated_at on public.organizations;
create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.roles enable row level security;
alter table public.user_roles enable row level security;

-- Profiles
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select"
  on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or private.is_platform_admin()
    or exists (
      select 1
      from public.organization_members mine
      join public.organization_members theirs
        on theirs.organization_id = mine.organization_id
      where mine.user_id = (select auth.uid())
        and mine.status = 'active'
        and theirs.user_id = profiles.id
        and theirs.status in ('active', 'invited', 'disabled')
    )
  );

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (
    id = (select auth.uid())
    and is_platform_admin = (
      select p.is_platform_admin from public.profiles p where p.id = (select auth.uid())
    )
  );

drop policy if exists "profiles_platform_admin_update" on public.profiles;
create policy "profiles_platform_admin_update"
  on public.profiles for update to authenticated
  using (private.is_platform_admin() and private.is_aal2())
  with check (private.is_platform_admin() and private.is_aal2());

-- Organizations
drop policy if exists "organizations_select" on public.organizations;
create policy "organizations_select"
  on public.organizations for select to authenticated
  using (
    private.is_platform_admin()
    or private.is_org_member(id)
  );

drop policy if exists "organizations_insert_platform" on public.organizations;
create policy "organizations_insert_platform"
  on public.organizations for insert to authenticated
  with check (private.is_platform_admin() and private.is_aal2());

drop policy if exists "organizations_update_platform" on public.organizations;
create policy "organizations_update_platform"
  on public.organizations for update to authenticated
  using (private.is_platform_admin() and private.is_aal2())
  with check (private.is_platform_admin() and private.is_aal2());

drop policy if exists "organizations_update_org_admin" on public.organizations;
create policy "organizations_update_org_admin"
  on public.organizations for update to authenticated
  using (private.is_org_admin(id) and private.is_aal2())
  with check (private.is_org_admin(id) and private.is_aal2());

-- Members
drop policy if exists "members_select" on public.organization_members;
create policy "members_select"
  on public.organization_members for select to authenticated
  using (
    private.is_platform_admin()
    or private.is_org_member(organization_id)
  );

drop policy if exists "members_write_admins" on public.organization_members;
create policy "members_write_admins"
  on public.organization_members for all to authenticated
  using (
    (private.is_platform_admin() or private.is_org_admin(organization_id))
    and private.is_aal2()
  )
  with check (
    (private.is_platform_admin() or private.is_org_admin(organization_id))
    and private.is_aal2()
  );

-- Roles
drop policy if exists "roles_select" on public.roles;
create policy "roles_select"
  on public.roles for select to authenticated
  using (
    private.is_platform_admin()
    or private.is_org_member(organization_id)
  );

drop policy if exists "roles_write_admins" on public.roles;
create policy "roles_write_admins"
  on public.roles for all to authenticated
  using (
    (private.is_platform_admin() or private.is_org_admin(organization_id))
    and private.is_aal2()
  )
  with check (
    (private.is_platform_admin() or private.is_org_admin(organization_id))
    and private.is_aal2()
  );

-- User roles
drop policy if exists "user_roles_select" on public.user_roles;
create policy "user_roles_select"
  on public.user_roles for select to authenticated
  using (
    private.is_platform_admin()
    or private.is_org_member(organization_id)
  );

drop policy if exists "user_roles_write_admins" on public.user_roles;
create policy "user_roles_write_admins"
  on public.user_roles for all to authenticated
  using (
    (private.is_platform_admin() or private.is_org_admin(organization_id))
    and private.is_aal2()
  )
  with check (
    (private.is_platform_admin() or private.is_org_admin(organization_id))
    and private.is_aal2()
  );

-- Grants for Data API
grant usage on schema public to anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update on public.organizations to authenticated;
grant select, insert, update, delete on public.organization_members to authenticated;
grant select, insert, update, delete on public.roles to authenticated;
grant select, insert, update, delete on public.user_roles to authenticated;
