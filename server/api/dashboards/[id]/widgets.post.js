import { parseWidgetBody } from '~~/server/utils/dashboards.js'
import { DASHBOARD_WIDGET_TYPES } from '~~/shared/dashboard.js'

export default defineEventHandler(async (event) => {
  const dashboardId = getRouterParam(event, 'id')
  const body = await readBody(event)
  const organizationId = String(body?.organizationId || '')
  if (!dashboardId || !organizationId) {
    throw createError({ statusCode: 400, statusMessage: 'id and organizationId are required' })
  }

  await requireOrgAdmin(event, organizationId)
  const parsed = parseWidgetBody(body)
  if (!DASHBOARD_WIDGET_TYPES.includes(parsed.widget_type)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid widget type' })
  }

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

  const { data: widget, error } = await admin
    .from('dashboard_widgets')
    .insert({
      dashboard_id: dashboardId,
      ...parsed,
    })
    .select('*')
    .single()

  if (error || !widget) {
    throw createError({ statusCode: 500, statusMessage: error?.message || 'Create widget failed' })
  }

  return { item: widget }
})
