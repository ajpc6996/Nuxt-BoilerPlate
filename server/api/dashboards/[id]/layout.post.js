/**
 * Batch-update widget grid positions on a dashboard.
 * Body: { organizationId, widgets: [{ id, gridX, gridY, gridW, gridH }] }
 */
export default defineEventHandler(async (event) => {
  const dashboardId = getRouterParam(event, 'id')
  const body = await readBody(event)
  const organizationId = String(body?.organizationId || '')
  if (!dashboardId || !organizationId) {
    throw createError({ statusCode: 400, statusMessage: 'id and organizationId are required' })
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

  const items = Array.isArray(body?.widgets) ? body.widgets : []
  if (!items.length) {
    throw createError({ statusCode: 400, statusMessage: 'widgets array is required' })
  }

  const updated = []
  for (const item of items) {
    const id = String(item?.id || '')
    if (!id) continue
    const patch = {
      grid_x: Math.max(0, Number(item.grid_x ?? item.gridX ?? 0) || 0),
      grid_y: Math.max(0, Number(item.grid_y ?? item.gridY ?? 0) || 0),
      grid_w: Math.max(1, Math.min(12, Number(item.grid_w ?? item.gridW ?? 6) || 6)),
      grid_h: Math.max(1, Number(item.grid_h ?? item.gridH ?? 4) || 4),
      updated_at: new Date().toISOString(),
    }
    const { data, error } = await admin
      .from('dashboard_widgets')
      .update(patch)
      .eq('id', id)
      .eq('dashboard_id', dashboardId)
      .select('id, grid_x, grid_y, grid_w, grid_h')
      .maybeSingle()
    if (error) {
      throw createError({ statusCode: 500, statusMessage: error.message })
    }
    if (data) updated.push(data)
  }

  return { items: updated }
})
