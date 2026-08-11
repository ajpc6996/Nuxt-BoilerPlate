/**
 * Org admin: billing catalog (all plans + add-ons). Mock mode.
 * Query: organizationId
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const organizationId = String(query.organizationId || '')
  if (!organizationId) {
    throw createError({ statusCode: 400, statusMessage: 'organizationId is required' })
  }

  await requireOrgAdmin(event, organizationId)
  const admin = useSupabaseAdmin()
  const catalog = await getBillingCatalog(admin)
  const licence = await resolveOrgLicence(admin, organizationId)

  return {
    ...catalog,
    currentPlanKey: licence.planKey,
    currentStatus: licence.status,
  }
})
