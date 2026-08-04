-- Fix service_role table grants + SELECT RLS without private schema / recursion.

grant usage on schema public to service_role, authenticated;
grant usage on schema private to service_role, authenticated;

-- Public security-definer helpers (bypass RLS; no private schema needed)
create or replace function public.is_platform_admin_uid()
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

create or replace function public.is_active_org_member(org_id uuid)
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

revoke all on function public.is_platform_admin_uid() from public;
revoke all on function public.is_active_org_member(uuid) from public;
grant execute on function public.is_platform_admin_uid() to authenticated, service_role;
grant execute on function public.is_active_org_member(uuid) to authenticated, service_role;

-- Optional: keep private helpers usable too
do $$ begin
  grant execute on function private.jwt_aal() to authenticated, service_role;
  grant execute on function private.is_aal2() to authenticated, service_role;
  grant execute on function private.is_platform_admin() to authenticated, service_role;
  grant execute on function private.is_org_member(uuid) to authenticated, service_role;
  grant execute on function private.has_org_role(uuid, text) to authenticated, service_role;
  grant execute on function private.is_org_admin(uuid) to authenticated, service_role;
exception when undefined_function then null;
end $$;

grant select, insert, update, delete on public.profiles to service_role;
grant select, insert, update, delete on public.organizations to service_role;
grant select, insert, update, delete on public.organization_members to service_role;
grant select, insert, update, delete on public.roles to service_role;
grant select, insert, update, delete on public.user_roles to service_role;

grant select, insert, update, delete on public.connector_types to service_role;
grant select, insert, update, delete on public.connections to service_role;
grant select, insert, update, delete on public.connection_secrets to service_role;
grant select, insert, update, delete on public.connection_runs to service_role;
grant select, insert, update, delete on public.connection_ingest_rows to service_role;

-- Also ensure authenticated keeps access
grant select, update on public.profiles to authenticated;
grant select, insert, update on public.organizations to authenticated;
grant select, insert, update, delete on public.organization_members to authenticated;
grant select, insert, update, delete on public.roles to authenticated;
grant select, insert, update, delete on public.user_roles to authenticated;

drop policy if exists "members_select" on public.organization_members;
drop policy if exists "members_select_own" on public.organization_members;
create policy "members_select"
  on public.organization_members for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_platform_admin_uid()
  );

drop policy if exists "organizations_select" on public.organizations;
create policy "organizations_select"
  on public.organizations for select to authenticated
  using (
    public.is_platform_admin_uid()
    or public.is_active_org_member(id)
  );

drop policy if exists "roles_select" on public.roles;
create policy "roles_select"
  on public.roles for select to authenticated
  using (
    public.is_platform_admin_uid()
    or public.is_active_org_member(organization_id)
  );

drop policy if exists "user_roles_select" on public.user_roles;
drop policy if exists "user_roles_select_own" on public.user_roles;
create policy "user_roles_select"
  on public.user_roles for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_platform_admin_uid()
  );

drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select"
  on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or public.is_platform_admin_uid()
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
