-- Plain Postgres prerequisites for the local ingest warehouse.
-- Run this BEFORE ingest-related Supabase migrations.
-- Do NOT run 20260803120000_multi_tenant_auth.sql on plain Postgres (requires Supabase Auth).

create extension if not exists pgcrypto;

do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;

create schema if not exists auth;
create schema if not exists private;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select null::uuid;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  is_platform_admin boolean not null default false,
  mfa_opt_in boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organizations (
  id uuid primary key,
  name text,
  slug text unique,
  mfa_mode text not null default 'optional',
  ingest_backend text not null default 'supabase'
    check (ingest_backend in ('supabase', 'local')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.connections (
  id uuid primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade
);

create table if not exists public.data_sources (
  id uuid primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  connection_id uuid references public.connections (id) on delete set null,
  destination_table text not null default ''
);

create table if not exists public.organization_licences (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  data_purged_at timestamptz
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function private.jwt_aal()
returns text
language sql
stable
as $$
  select 'aal2'::text;
$$;

create or replace function private.is_aal2()
returns boolean
language sql
stable
as $$
  select true;
$$;

create or replace function private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select false;
$$;

create or replace function private.is_org_member(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select false;
$$;

create or replace function private.has_org_role(org_id uuid, role_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select false;
$$;

create or replace function private.is_org_admin(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select false;
$$;

grant usage on schema public to anon, authenticated, service_role;

-- ingest.* landing tables (schema only — functions come from later migrations)
create schema if not exists ingest;

grant usage on schema ingest to service_role, authenticated;
grant all on schema ingest to service_role;

alter default privileges in schema ingest
  grant select on tables to authenticated;
alter default privileges in schema ingest
  grant all on tables to service_role;
