import { assertCanViewDashboard, decodeWidgetFromDb } from '~~/server/utils/dashboards.js'
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
    const decoded = decodeWidgetFromDb(widget)
    widgetType = decoded.widget_type
    displayConfig = decoded.display_config || {}
    dataConfig = normalizeDataConfig(decoded.data_config)
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
  const displayType = String(body?.displayType || widgetType)

  // KPI sparkline/delta: query by trend field as dimension so we get period series.
  let runConfig = dataConfig
  let runLimit = Number(body?.limit) || dataConfig.limit || 500
  const wantsKpiTrend = displayType === 'kpi'
    && (displayConfig.showSparkline || displayConfig.showDelta)
    && dataConfig.kpiTrendField
  if (wantsKpiTrend) {
    runConfig = {
      ...dataConfig,
      dimensions: [dataConfig.kpiTrendField],
      seriesField: null,
      // Keep enough points for a readable sparkline.
      limit: Math.min(Math.max(Number(dataConfig.limit) || 24, 2), 90),
    }
    runLimit = runConfig.limit
  }

  const orderBy = runConfig.orderBy || { mode: 'none' }

  let data
  let error
  ;({ data, error } = await admin.rpc('dashboard_run_query', {
    p_organization_id: organizationId,
    p_sources: runConfig.sources,
    p_joins: runConfig.joins,
    p_dimensions: runConfig.dimensions,
    p_metrics: runConfig.metrics,
    p_filters: filters,
    p_series_field: runConfig.seriesField,
    p_limit: runLimit,
    p_order_by: orderBy,
  }))

  // Older DBs without p_order_by — fall back and sort/limit in Node.
  if (error && /could not find the function/i.test(error.message || '')) {
    ;({ data, error } = await admin.rpc('dashboard_run_query', {
      p_organization_id: organizationId,
      p_sources: runConfig.sources,
      p_joins: runConfig.joins,
      p_dimensions: runConfig.dimensions,
      p_metrics: runConfig.metrics,
      p_filters: filters,
      p_series_field: runConfig.seriesField,
      p_limit: 5000,
    }))
    if (!error && Array.isArray(data)) {
      data = applyOrderAndLimitLocally(data, runConfig, runLimit)
    }
  }

  if (error) {
    throw createError({ statusCode: 400, statusMessage: error.message })
  }

  const rows = Array.isArray(data) ? data : []
  const shape = {
    dimensionCount: runConfig.dimensions.length,
    metricCount: runConfig.metrics.length,
    hasSeries: Boolean(runConfig.seriesField) || runConfig.metrics.length > 1,
  }

  const dataset = mapRowsToWidgetDataset(displayType, rows, runConfig, displayConfig)

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

/**
 * Temporary client-side top-N until dashboard_run_query supports p_order_by.
 * Diff sort uses already-aggregated metric columns when both exist; otherwise
 * falls back to unsorted limit.
 * @param {Record<string, unknown>[]} rows
 * @param {ReturnType<typeof normalizeDataConfig>} dataConfig
 * @param {number} limit
 */
function applyOrderAndLimitLocally(rows, dataConfig, limit) {
  const list = [...rows]
  const orderBy = dataConfig.orderBy || { mode: 'none' }
  const dir = orderBy.dir === 'asc' ? 1 : -1

  if (orderBy.mode === 'metric' && orderBy.metricAs) {
    const key = orderBy.metricAs
    list.sort((a, b) => (Number(a[key]) - Number(b[key])) * dir)
  }
  else if (orderBy.mode === 'diff' && orderBy.left && orderBy.right) {
    const leftAs = leafAlias(orderBy.left, dataConfig.metrics)
    const rightAs = leafAlias(orderBy.right, dataConfig.metrics)
    if (leftAs && rightAs) {
      list.sort((a, b) => {
        const da = Number(a[leftAs]) - Number(a[rightAs])
        const db = Number(b[leftAs]) - Number(b[rightAs])
        return (da - db) * dir
      })
    }
  }

  const lim = Math.max(1, Math.min(Number(limit) || 500, 5000))
  return list.slice(0, lim)
}

/**
 * Map qualified field t0.high_24h → metric alias high_24h when configured.
 * @param {string} qualified
 * @param {{ field: string, as: string }[]} metrics
 */
function leafAlias(qualified, metrics) {
  const hit = (metrics || []).find((m) => m.field === qualified)
  if (hit?.as) return hit.as
  const leaf = String(qualified || '').includes('.')
    ? String(qualified).split('.').pop()
    : String(qualified || '')
  return leaf || null
}
