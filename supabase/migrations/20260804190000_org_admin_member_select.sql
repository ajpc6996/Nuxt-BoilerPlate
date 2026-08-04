-- Allow org Admins to list/manage all members & role assignments in their org.
-- (Previously SELECT was own-row or platform-admin only, which broke Administration UI.)

create or replace function public.is_org_admin_uid(org_id uuid)
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
      and r.name = 'Admin'
  );
$$;

revoke all on function public.is_org_admin_uid(uuid) from public;
grant execute on function public.is_org_admin_uid(uuid) to authenticated, service_role;

drop policy if exists "members_select" on public.organization_members;
drop policy if exists "members_select_own" on public.organization_members;
create policy "members_select"
  on public.organization_members for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_platform_admin_uid()
    or public.is_org_admin_uid(organization_id)
  );

drop policy if exists "user_roles_select" on public.user_roles;
drop policy if exists "user_roles_select_own" on public.user_roles;
create policy "user_roles_select"
  on public.user_roles for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_platform_admin_uid()
    or public.is_org_admin_uid(organization_id)
  );
