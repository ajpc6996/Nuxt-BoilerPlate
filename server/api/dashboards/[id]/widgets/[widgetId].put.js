import { parseWidgetBody } from '~~/server/utils/dashboards.js'
import { DASHBOARD_WIDGET_TYPES } from '~~/shared/dashboard.js'

export default defineEventHandler(async (event) => {
  const dashboardId = getRouterParam(event, 'id')
  const widgetId = getRouterParam(event, 'widgetId')
  const body = await readBody(event)
  const organizationId = String(body?.organizationId || '')
  if (!dashboardId || !widgetId || !organizationId) {
    throw createError({ statusCode: 400, statusMessage: 'ids and organizationId are required' })
  }

  await requireOrgAdmin(event, organizationId)
  const parsed = parseWidgetBody(body)
  if (!DASHBOARD_WIDGET_TYPES.includes(parsed.widget_type)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid widget type' })
  }

  const admin = useSupabaseAdmin()
  const { data: widget, error } = await admin
    .from('dashboard_widgets')
    .update({
      ...parsed,
      updated_at: new Date().toISOString(),
    })
    .eq('id', widgetId)
    .eq('dashboard_id', dashboardId)
    .select('*')
    .maybeSingle()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }
  if (!widget) {
    throw createError({ statusCode: 404, statusMessage: 'Widget not found' })
  }

  return { item: widget }
})
