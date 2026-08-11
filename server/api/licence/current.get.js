/**
 * Org member/admin: current licence + live usage for active org.
 * Query: organizationId
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const organizationId = String(query.organizationId || '')
  if (!organizationId) {
    throw createError({ statusCode: 400, statusMessage: 'organizationId is required' })
  }

  const member = await requireOrgMember(event, organizationId)
  const admin = useSupabaseAdmin()

  // Platform admin still sees the org's licence (not a bypass snapshot)
  const licence = await resolveOrgLicence(admin, organizationId)
  const usage = await measureOrgUsage(admin, organizationId)

  return {
    licence: {
      planKey: licence.planKey,
      planName: licence.planName,
      status: licence.status,
      operational: licence.operational || member.isPlatformAdmin,
      features: licence.features,
      limits: licence.limits,
      trialEndsAt: licence.trialEndsAt,
      currentPeriodEnd: licence.currentPeriodEnd,
      graceEndsAt: licence.graceEndsAt,
      dataPurgeAt: licence.dataPurgeAt,
      dataPurgedAt: licence.dataPurgedAt,
      // Token is informational; UI must not treat it as an unlock key.
      licenceToken: licence.licenceToken,
      settings: licence.settings,
    },
    usage,
    isPlatformAdmin: member.isPlatformAdmin,
  }
})
