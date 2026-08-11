/**
 * Platform: assign / renew org licence.
 * Body: { planKey, status?, periodDays?, overrides?, notes? }
 */
export default defineEventHandler(async (event) => {
  const { user } = await requirePlatformAdmin(event)
  const organizationId = String(getRouterParam(event, 'id') || '')
  const body = await readBody(event)

  if (!organizationId) {
    throw createError({ statusCode: 400, statusMessage: 'organization id is required' })
  }
  if (!body?.planKey) {
    throw createError({ statusCode: 400, statusMessage: 'planKey is required' })
  }

  const admin = useSupabaseAdmin()

  const { data: org } = await admin
    .from('organizations')
    .select('id, name, slug')
    .eq('id', organizationId)
    .maybeSingle()

  if (!org) {
    throw createError({ statusCode: 404, statusMessage: 'Organization not found' })
  }

  const result = await assignOrgLicence(admin, {
    organizationId,
    planKey: String(body.planKey),
    status: body.status || undefined,
    periodDays: body.periodDays != null ? Number(body.periodDays) : undefined,
    overrides: body.overrides || {},
    notes: body.notes,
    assignedBy: user.id,
  })

  const licence = await resolveOrgLicence(admin, organizationId)
  const usage = await measureOrgUsage(admin, organizationId)

  return {
    organization: org,
    licence,
    usage,
    item: result.item,
  }
})
