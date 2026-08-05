import { parseDashboardBody } from '~~/server/utils/dashboards.js'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const body = await readBody(event)
  const organizationId = String(body?.organizationId || '')
  if (!id || !organizationId) {
    throw createError({ statusCode: 400, statusMessage: 'id and organizationId are required' })
  }

  await requireOrgAdmin(event, organizationId)
  const parsed = parseDashboardBody(body)
  if (!parsed.name) {
    throw createError({ statusCode: 400, statusMessage: 'Name is required' })
  }

  const admin = useSupabaseAdmin()
  const { data: dash, error } = await admin
    .from('dashboards')
    .update({
      name: parsed.name,
      description: parsed.description,
      visibility: parsed.visibility,
      layout: parsed.layout,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select('*')
    .maybeSingle()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }
  if (!dash) {
    throw createError({ statusCode: 404, statusMessage: 'Dashboard not found' })
  }

  await admin.from('dashboard_roles').delete().eq('dashboard_id', id)
  if (parsed.visibility === 'role' && parsed.roleIds.length) {
    await admin.from('dashboard_roles').insert(
      parsed.roleIds.map((role_id) => ({ dashboard_id: id, role_id })),
    )
  }

  return { item: dash }
})
