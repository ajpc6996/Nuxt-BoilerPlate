import { parseDashboardBody } from '~~/server/utils/dashboards.js'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const organizationId = String(body?.organizationId || '')
  if (!organizationId) {
    throw createError({ statusCode: 400, statusMessage: 'organizationId is required' })
  }

  const { user, isPlatformAdmin } = await requireOrgAdmin(event, organizationId)
  const parsed = parseDashboardBody(body)
  if (!parsed.name) {
    throw createError({ statusCode: 400, statusMessage: 'Name is required' })
  }

  const admin = useSupabaseAdmin()
  await assertLicenceAllows(admin, {
    organizationId,
    isPlatformAdmin,
    feature: 'dashboards',
    limitKey: 'maxDashboards',
  })

  const { data: dash, error } = await admin
    .from('dashboards')
    .insert({
      organization_id: organizationId,
      name: parsed.name,
      description: parsed.description,
      visibility: parsed.visibility,
      owner_user_id: user.id,
      layout: parsed.layout,
      created_by: user.id,
    })
    .select('*')
    .single()

  if (error || !dash) {
    throw createError({ statusCode: 500, statusMessage: error?.message || 'Create failed' })
  }

  if (parsed.visibility === 'role' && parsed.roleIds.length) {
    const rows = parsed.roleIds.map((role_id) => ({
      dashboard_id: dash.id,
      role_id,
    }))
    const { error: roleError } = await admin.from('dashboard_roles').insert(rows)
    if (roleError) {
      console.warn('[dashboards] role link failed', roleError.message)
    }
  }

  return { item: dash }
})
