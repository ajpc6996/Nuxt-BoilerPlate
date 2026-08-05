export default defineEventHandler(async (event) => {
  const dashboardId = getRouterParam(event, 'id')
  const widgetId = getRouterParam(event, 'widgetId')
  const query = getQuery(event)
  const organizationId = String(query.organizationId || '')
  if (!dashboardId || !widgetId || !organizationId) {
    throw createError({ statusCode: 400, statusMessage: 'ids and organizationId are required' })
  }

  await requireOrgAdmin(event, organizationId)
  const admin = useSupabaseAdmin()

  const { data: dash } = await admin
    .from('dashboards')
    .select('id')
    .eq('id', dashboardId)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (!dash) {
    throw createError({ statusCode: 404, statusMessage: 'Dashboard not found' })
  }

  const { error } = await admin
    .from('dashboard_widgets')
    .delete()
    .eq('id', widgetId)
    .eq('dashboard_id', dashboardId)

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { ok: true }
})
