/**
 * Platform admin + aal2 gate for connector type management.
 * @param {import('h3').H3Event} event
 */
export async function requirePlatformAdmin(event) {
  const { user, token } = await requireVerifiedUser(event)

  const payload = decodeJwtPayload(token)
  if (payload?.aal !== 'aal2') {
    throw createError({
      statusCode: 403,
      statusMessage: 'MFA (aal2) required for platform actions',
    })
  }

  const admin = useSupabaseAdmin()
  const { data: profile } = await admin
    .from('profiles')
    .select('id, is_platform_admin')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.is_platform_admin) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Platform admin required',
    })
  }

  return { user, profile, isPlatformAdmin: true }
}
