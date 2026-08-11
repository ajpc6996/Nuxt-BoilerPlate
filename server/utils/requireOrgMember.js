/**
 * Org membership gate with MFA when org policy or licence requires it.
 * Platform admins may access any org but still need aal2 when MFA is required.
 *
 * @param {import('h3').H3Event} event
 * @param {string} organizationId
 */
export async function requireOrgMember(event, organizationId) {
  const { user, token } = await requireUser(event)
  const admin = useSupabaseAdmin()

  const { data: profile } = await admin
    .from('profiles')
    .select('id, is_platform_admin')
    .eq('id', user.id)
    .maybeSingle()

  let isOrgAdmin = false
  const isPlatformAdmin = Boolean(profile?.is_platform_admin)

  if (!isPlatformAdmin) {
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

    isOrgAdmin = (roleRows || []).some((row) => row.roles?.name === 'Admin')
  }
  else {
    isOrgAdmin = true
  }

  await assertOrgApiMfa(admin, organizationId, token)

  return {
    user,
    profile,
    token,
    isPlatformAdmin,
    isOrgAdmin,
  }
}

/**
 * If org mfa_mode is required or licence features.mfaRequired, require JWT aal2.
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {string} organizationId
 * @param {string} token
 */
export async function assertOrgApiMfa(admin, organizationId, token) {
  if (!organizationId) return

  const { data: org } = await admin
    .from('organizations')
    .select('id, mfa_mode')
    .eq('id', organizationId)
    .maybeSingle()

  let licenceRequires = false
  const { data: licence } = await admin
    .from('organization_licences')
    .select('features, overrides')
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (licence) {
    const features = {
      ...(licence.features && typeof licence.features === 'object' ? licence.features : {}),
      ...(licence.overrides?.features && typeof licence.overrides.features === 'object'
        ? licence.overrides.features
        : {}),
    }
    licenceRequires = features.mfaRequired === true
  }

  const orgRequires = org?.mfa_mode === 'required'
  if (!orgRequires && !licenceRequires) return

  const payload = decodeJwtPayload(token)
  if (payload?.aal !== 'aal2') {
    throw createError({
      statusCode: 403,
      statusMessage: 'MFA (aal2) required for this organization',
      data: {
        code: 'ORG_MFA_REQUIRED',
        orgMfaMode: org?.mfa_mode || null,
        licenceMfaRequired: licenceRequires,
      },
    })
  }
}

/**
 * @param {string} token
 */
function decodeJwtPayload(token) {
  try {
    const part = token.split('.')[1]
    const json = Buffer.from(part, 'base64url').toString('utf8')
    return JSON.parse(json)
  }
  catch {
    return null
  }
}
