-- Fix: authenticated must USE private schema + EXECUTE helper functions
-- used by RLS. Without this, client queries fail with:
--   "permission denied for schema private"
-- and the org switcher stays empty.

grant usage on schema private to authenticated;

grant execute on function private.jwt_aal() to authenticated;
grant execute on function private.is_aal2() to authenticated;
grant execute on function private.is_platform_admin() to authenticated;
grant execute on function private.is_org_member(uuid) to authenticated;
grant execute on function private.has_org_role(uuid, text) to authenticated;
grant execute on function private.is_org_admin(uuid) to authenticated;
