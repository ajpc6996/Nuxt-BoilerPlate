/**
 * Platform: update organization MFA mode (respects licence mfaRequired).
 * Body: { mfaMode: 'off'|'optional'|'required' }
 */
export default defineEventHandler(async (event) => {
  await requirePlatformAdmin(event)
  const organizationId = String(getRouterParam(event, 'id') || '')
  const body = await readBody(event)
  const mfaMode = String(body?.mfaMode || body?.mfa_mode || '')

  if (!organizationId) {
    throw createError({ statusCode: 400, statusMessage: 'organization id is required' })
  }

  const admin = useSupabaseAdmin()
  await assertOrgMfaModeAllowed(admin, organizationId, mfaMode)

  const { data, error } = await admin
    .from('organizations')
    .update({ mfa_mode: mfaMode })
    .eq('id', organizationId)
    .select('id, name, slug, mfa_mode')
    .single()

  if (error || !data) {
    throw createError({
      statusCode: 500,
      statusMessage: error?.message || 'Failed to update MFA mode',
    })
  }

  return { item: data }
})
