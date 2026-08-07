/**
 * Dashboard widget registry + helpers (shared client/server).
 */

export const DASHBOARD_VISIBILITIES = ['private', 'role', 'public']

export const DASHBOARD_WIDGET_TYPES = [
  'kpi',
  'bar',
  'line',
  'pie',
  'donut',
  'gauge',
  'table',
]

export const DASHBOARD_AGGS = ['sum', 'count', 'min', 'max']

export const DASHBOARD_ORDER_MODES = ['none', 'metric', 'diff']

/**
 * Default grid size when dropping a widget type on the canvas.
 * @param {string} type
 */
export function defaultWidgetGrid(type) {
  const map = {
    kpi: { grid_w: 3, grid_h: 3 },
    gauge: { grid_w: 4, grid_h: 4 },
    pie: { grid_w: 4, grid_h: 4 },
    donut: { grid_w: 4, grid_h: 4 },
    bar: { grid_w: 6, grid_h: 4 },
    line: { grid_w: 6, grid_h: 4 },
    table: { grid_w: 6, grid_h: 4 },
  }
  return map[type] || { grid_w: 6, grid_h: 4 }
}

/**
 * @param {string} type
 */
export function widgetMeta(type) {
  const map = {
    kpi: { label: 'KPI', needs: { dimensions: 0, metrics: 1, series: false } },
    bar: { label: 'Bar chart', needs: { dimensions: 1, metrics: 1, series: true } },
    line: { label: 'Line chart', needs: { dimensions: 1, metrics: 1, series: true } },
    pie: { label: 'Pie chart', needs: { dimensions: 1, metrics: 1, series: false } },
    donut: { label: 'Donut chart', needs: { dimensions: 1, metrics: 1, series: false } },
    gauge: { label: 'Gauge', needs: { dimensions: 0, metrics: 1, series: false } },
    table: { label: 'Table', needs: { dimensions: 0, metrics: 1, series: true } },
  }
  return map[type] || { label: type, needs: { dimensions: 0, metrics: 1, series: false } }
}

/**
 * Which display types make sense for a given query shape.
 * @param {{ dimensionCount: number, metricCount: number, hasSeries: boolean }} shape
 */
export function suggestedDisplayTypes(shape) {
  const dims = Number(shape?.dimensionCount) || 0
  const metrics = Number(shape?.metricCount) || 0
  const series = Boolean(shape?.hasSeries)
  /** @type {string[]} */
  const out = []
  if (metrics >= 1 && dims === 0 && !series) {
    out.push('kpi', 'gauge')
  }
  if (metrics === 1 && dims >= 1 && !series) {
    out.push('bar', 'pie', 'donut', 'line')
  }
  // Multi-metric or series split → charts that support multiple series
  if (metrics > 1 || series) {
    out.push('line', 'bar')
  }
  else if (metrics >= 1 && dims >= 1) {
    out.push('line', 'bar')
  }
  out.push('table')
  return [...new Set(out)].filter((t) => DASHBOARD_WIDGET_TYPES.includes(t))
}

/**
 * @param {ReturnType<typeof normalizeDataConfig>} dataConfig
 */
export function displayTypesForConfig(dataConfig) {
  return suggestedDisplayTypes({
    dimensionCount: (dataConfig?.dimensions || []).filter(Boolean).length,
    metricCount: (dataConfig?.metrics || []).length,
    hasSeries: Boolean(dataConfig?.seriesField) || (dataConfig?.metrics || []).length > 1,
  })
}

/**
 * Multi-series XY payload for line or bar.
 * @param {Record<string, unknown>[]} list
 * @param {ReturnType<typeof normalizeDataConfig>} dataConfig
 * @param {Record<string, unknown>} [displayConfig]
 * @param {'line'|'bar'} seriesType
 */
export function mapRowsToXySeries(list, dataConfig, displayConfig = {}, seriesType = 'line') {
  const dim0 = dataConfig.dimensions[0]
    ? String(dataConfig.dimensions[0]).replace('.', '_')
    : null
  const metricAs = dataConfig.metrics[0]?.as || 'value'
  const useArea = Boolean(displayConfig?.useArea) && seriesType === 'line'

  if (dataConfig.metrics.length > 1 && !dataConfig.seriesField) {
    const categories = list.map((r) => String(dim0 ? r[dim0] : ''))
    return {
      categories,
      dataset: dataConfig.metrics.map((m) => ({
        name: m.as,
        type: seriesType,
        useArea,
        series: list.map((r) => Number(r[m.as]) || 0),
      })),
    }
  }

  if (dataConfig.seriesField) {
    const categories = [...new Set(list.map((r) => String(dim0 ? r[dim0] : '')))]
    const seriesNames = [...new Set(list.map((r) => String(r.series_key || 'Series')))]
    return {
      categories,
      dataset: seriesNames.map((name) => ({
        name,
        type: seriesType,
        useArea,
        series: categories.map((cat) => {
          const hit = list.find(
            (r) => String(dim0 ? r[dim0] : '') === cat && String(r.series_key || 'Series') === name,
          )
          return Number(hit?.[metricAs]) || 0
        }),
      })),
    }
  }

  const categories = list.map((r) => String(dim0 ? r[dim0] : ''))
  return {
    categories,
    dataset: [{
      name: metricAs,
      type: seriesType,
      useArea,
      series: list.map((r) => Number(r[metricAs]) || 0),
    }],
  }
}

/**
 * @param {unknown} raw
 */
export function normalizeOrderBy(raw) {
  const cfg = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const mode = DASHBOARD_ORDER_MODES.includes(cfg.mode) ? cfg.mode : 'none'
  const dir = cfg.dir === 'asc' ? 'asc' : 'desc'
  if (mode === 'metric') {
    return {
      mode,
      dir,
      metricAs: String(cfg.metricAs || '').trim() || null,
      left: null,
      right: null,
      agg: 'max',
    }
  }
  if (mode === 'diff') {
    const agg = ['sum', 'min', 'max'].includes(cfg.agg) ? cfg.agg : 'max'
    return {
      mode,
      dir,
      metricAs: null,
      left: String(cfg.left || '').trim() || null,
      right: String(cfg.right || '').trim() || null,
      agg,
    }
  }
  return {
    mode: 'none',
    dir,
    metricAs: null,
    left: null,
    right: null,
    agg: 'max',
  }
}

/**
 * @param {unknown} raw
 */
export function normalizeDataConfig(raw) {
  const cfg = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const sources = Array.isArray(cfg.sources)
    ? cfg.sources.map((s, i) => ({
        kind: 'ingest',
        table: String(s?.table || '').trim(),
        alias: String(s?.alias || `t${i}`).trim() || `t${i}`,
      })).filter((s) => s.table)
    : []
  const joins = Array.isArray(cfg.joins)
    ? cfg.joins.map((j) => ({
        left: String(j?.left || '').trim(),
        right: String(j?.right || '').trim(),
      })).filter((j) => j.left && j.right)
    : []
  const dimensions = Array.isArray(cfg.dimensions)
    ? cfg.dimensions.map((d) => String(d || '').trim()).filter(Boolean)
    : []
  const metrics = Array.isArray(cfg.metrics)
    ? cfg.metrics.map((m, i) => ({
        field: String(m?.field || '*').trim() || '*',
        agg: DASHBOARD_AGGS.includes(m?.agg) ? m.agg : 'count',
        as: String(m?.as || `metric_${i}`).trim() || `metric_${i}`,
      }))
    : []
  const seriesField = cfg.seriesField ? String(cfg.seriesField).trim() : ''
  const limitRaw = Number(cfg.limit)
  const limit = Number.isFinite(limitRaw) && limitRaw > 0
    ? Math.min(Math.floor(limitRaw), 5000)
    : null
  return {
    sources,
    joins,
    dimensions,
    metrics,
    seriesField: seriesField || null,
    limit,
    orderBy: normalizeOrderBy(cfg.orderBy),
  }
}

/**
 * Default empty widget data config.
 */
export function createEmptyDataConfig() {
  return {
    sources: [{ kind: 'ingest', table: '', alias: 't0' }],
    joins: [],
    dimensions: [],
    metrics: [{ field: '*', agg: 'count', as: 'value' }],
    seriesField: null,
    limit: null,
    orderBy: normalizeOrderBy({ mode: 'none', dir: 'desc' }),
  }
}

/**
 * Map query rows to vue-data-ui friendly payloads by widget type.
 * @param {string} widgetType
 * @param {Record<string, unknown>[]} rows
 * @param {ReturnType<typeof normalizeDataConfig>} dataConfig
 * @param {Record<string, unknown>} [displayConfig]
 */
export function mapRowsToWidgetDataset(widgetType, rows, dataConfig, displayConfig = {}) {
  const list = Array.isArray(rows) ? rows : []
  const metricAs = dataConfig.metrics[0]?.as || 'value'
  const dim0 = dataConfig.dimensions[0]
    ? String(dataConfig.dimensions[0]).replace('.', '_')
    : null

  if (widgetType === 'kpi' || widgetType === 'gauge') {
    const value = Number(list[0]?.[metricAs]) || 0
    if (widgetType === 'gauge') {
      return {
        value,
        series: [
          { from: 0, to: 40, color: '#ef4444' },
          { from: 40, to: 70, color: '#eab308' },
          { from: 70, to: 100, color: '#22c55e' },
        ],
      }
    }
    return { value }
  }

  if (widgetType === 'pie' || widgetType === 'donut') {
    // Pie/donut use the first metric only (multi-series not applicable).
    return list.map((row) => ({
      name: String(dim0 ? row[dim0] : row.series_key || 'Item'),
      values: [Number(row[metricAs]) || 0],
    }))
  }

  if (widgetType === 'bar') {
    if (dataConfig.metrics.length > 1 || dataConfig.seriesField) {
      return mapRowsToXySeries(list, dataConfig, displayConfig, 'bar')
    }
    return list.map((row) => ({
      name: String(dim0 ? row[dim0] : row.series_key || 'Item'),
      value: Number(row[metricAs]) || 0,
    }))
  }

  if (widgetType === 'line') {
    return mapRowsToXySeries(list, dataConfig, displayConfig, 'line')
  }

  // table / fallback
  return { rows: list }
}
