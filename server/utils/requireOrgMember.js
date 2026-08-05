/**
 * Authenticated org member (no MFA / admin requirement).
 * @param {import('h3').H3Event} event
 * @param {string} organizationId
 */
export async function requireOrgMember(event, organizationId) {
  const { user } = await requireUser(event)
  const admin = useSupabaseAdmin()

  const { data: profile } = await admin
    .from('profiles')
    .select('id, is_platform_admin')
    .eq('id', user.id)
    .maybeSingle()

  if (profile?.is_platform_admin) {
    return { user, profile, isPlatformAdmin: true, isOrgAdmin: true }
  }

  const { data: membership } = await admin
    .from('organization_members')
    .select('id, status')
    .eq('organization_id', organizationId)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle()

  if (!membership) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Organization membership required',
    })
  }

  const { data: roleRows } = await admin
    .from('user_roles')
    .select('id, roles!inner(name)')
    .eq('organization_id', organizationId)
    .eq('user_id', user.id)

  const isOrgAdmin = (roleRows || []).some((row) => row.roles?.name === 'Admin')

  return {
    user,
    profile,
    isPlatformAdmin: false,
    isOrgAdmin,
  }
}
