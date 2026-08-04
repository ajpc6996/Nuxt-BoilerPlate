-- Fix empty org switcher when memberships exist in SQL but client gets none.
-- Cause: RLS policies call private.* helpers; without USAGE on schema private,
-- PostgREST returns "permission denied for schema private" and the app clears orgs.
--
-- 1) Grant private helpers (preferred long-term)
-- 2) Add / rewrite SELECT policies so own-row reads do not require private.*

grant usage on schema private to authenticated;

grant execute on function private.jwt_aal() to authenticated;
grant execute on function private.is_aal2() to authenticated;
grant execute on function private.is_platform_admin() to authenticated;
grant execute on function private.is_org_member(uuid) to authenticated;
grant execute on function private.has_org_role(uuid, text) to authenticated;
grant execute on function private.is_org_admin(uuid) to authenticated;

-- Own membership rows (no private.* — critical for org switcher)
drop policy if exists "members_select_own" on public.organization_members;
create policy "members_select_own"
  on public.organization_members for select to authenticated
  using (user_id = (select auth.uid()));

-- Keep broader admin policy, but also replace base select to be resilient
drop policy if exists "members_select" on public.organization_members;
create policy "members_select"
  on public.organization_members for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.is_platform_admin = true
    )
  );

-- Organizations: member via direct membership check (no private.*)
drop policy if exists "organizations_select" on public.organizations;
create policy "organizations_select"
  on public.organizations for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.is_platform_admin = true
    )
    or exists (
      select 1 from public.organization_members m
      where m.organization_id = organizations.id
        and m.user_id = (select auth.uid())
        and m.status = 'active'
    )
  );

-- Roles in orgs you belong to
drop policy if exists "roles_select" on public.roles;
create policy "roles_select"
  on public.roles for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.is_platform_admin = true
    )
    or exists (
      select 1 from public.organization_members m
      where m.organization_id = roles.organization_id
        and m.user_id = (select auth.uid())
        and m.status = 'active'
    )
  );

-- Own user_roles
drop policy if exists "user_roles_select_own" on public.user_roles;
create policy "user_roles_select_own"
  on public.user_roles for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "user_roles_select" on public.user_roles;
create policy "user_roles_select"
  on public.user_roles for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.is_platform_admin = true
    )
  );
