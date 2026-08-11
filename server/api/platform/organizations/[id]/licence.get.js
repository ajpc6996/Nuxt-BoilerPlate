/**
 * Platform: get org licence + usage.
 */
export default defineEventHandler(async (event) => {
  await requirePlatformAdmin(event)
  const organizationId = String(getRouterParam(event, 'id') || '')
  if (!organizationId) {
    throw createError({ statusCode: 400, statusMessage: 'organization id is required' })
  }

  const admin = useSupabaseAdmin()
  const licence = await resolveOrgLicence(admin, organizationId)
  const usage = await measureOrgUsage(admin, organizationId)

  return { licence, usage }
})
