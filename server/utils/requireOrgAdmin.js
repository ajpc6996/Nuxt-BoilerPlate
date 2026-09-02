/**
 * Verify the caller JWT and return user + whether they may admin an org.
 * Requires Authorization: Bearer <access_token>
 * @param {import('h3').H3Event} event
 * @param {string} organizationId
 */
export async function requireOrgAdmin(event, organizationId) {
  const { user, token } = await requireVerifiedUser(event)

  const payload = decodeJwtPayload(token)
  if (payload?.aal !== 'aal2') {
    throw createError({
      statusCode: 403,
      statusMessage: 'MFA (aal2) required for administration actions',
    })
  }

  const admin = useSupabaseAdmin()
  const { data: profile } = await admin
    .from('profiles')
    .select('id, is_platform_admin')
    .eq('id', user.id)
    .maybeSingle()

  if (profile?.is_platform_admin) {
    return { user, profile, isPlatformAdmin: true }
  }

  const { data: roleRows } = await admin
    .from('user_roles')
    .select('id, roles!inner(name)')
    .eq('organization_id', organizationId)
    .eq('user_id', user.id)

  const isOrgAdmin = (roleRows || []).some((row) => row.roles?.name === 'Admin')
  if (!isOrgAdmin) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Organization Admin role required',
    })
  }

  return { user, profile, isPlatformAdmin: false }
}
