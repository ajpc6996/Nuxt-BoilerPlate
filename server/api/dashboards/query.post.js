import { assertCanViewDashboard } from '~~/server/utils/dashboards.js'
import {
  mapRowsToWidgetDataset,
  normalizeDataConfig,
  suggestedDisplayTypes,
} from '~~/shared/dashboard.js'

/**
 * Run a dashboard widget query (or ad-hoc preview config).
 * Body: { organizationId, dashboardId?, widgetId?, dataConfig?, filters?, limit? }
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const organizationId = String(body?.organizationId || '')
  if (!organizationId) {
    throw createError({ statusCode: 400, statusMessage: 'organizationId is required' })
  }

  const member = await requireOrgMember(event, organizationId)
  const admin = useSupabaseAdmin()

  let widgetType = String(body?.widgetType || 'table')
  let displayConfig = body?.displayConfig && typeof body.displayConfig === 'object'
    ? body.displayConfig
    : {}
  let dataConfig = normalizeDataConfig(body?.dataConfig)

  if (body?.dashboardId && body?.widgetId) {
    const dash = await assertCanViewDashboard(
      admin,
      String(body.dashboardId),
      organizationId,
      member.user.id,
      member,
    )
    const widget = (dash.dashboard_widgets || []).find((w) => w.id === body.widgetId)
    if (!widget) {
      throw createError({ statusCode: 404, statusMessage: 'Widget not found' })
    }
    widgetType = widget.widget_type
    displayConfig = widget.display_config || {}
    dataConfig = normalizeDataConfig(widget.data_config)
  }
  else if (body?.dashboardId) {
    // Preview while configuring — require admin
    await requireOrgAdmin(event, organizationId)
  }
  else {
    // Ad-hoc preview from configure UI
    await requireOrgAdmin(event, organizationId)
  }

  if (!dataConfig.sources.length || !dataConfig.metrics.length) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Configure at least one source table and one metric',
    })
  }

  const filters = Array.isArray(body?.filters) ? body.filters : []

  const { data, error } = await admin.rpc('dashboard_run_query', {
    p_organization_id: organizationId,
    p_sources: dataConfig.sources,
    p_joins: dataConfig.joins,
    p_dimensions: dataConfig.dimensions,
    p_metrics: dataConfig.metrics,
    p_filters: filters,
    p_series_field: dataConfig.seriesField,
    p_limit: Number(body?.limit) || 500,
  })

  if (error) {
    throw createError({ statusCode: 400, statusMessage: error.message })
  }

  const rows = Array.isArray(data) ? data : []
  const shape = {
    dimensionCount: dataConfig.dimensions.length,
    metricCount: dataConfig.metrics.length,
    hasSeries: Boolean(dataConfig.seriesField),
  }

  const displayType = String(body?.displayType || widgetType)
  const dataset = mapRowsToWidgetDataset(displayType, rows, dataConfig, displayConfig)

  return {
    rows,
    dataset,
    shape,
    suggestedTypes: suggestedDisplayTypes(shape),
    widgetType,
    displayType,
    dataConfig,
  }
})
