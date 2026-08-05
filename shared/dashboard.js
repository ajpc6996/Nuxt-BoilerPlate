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
  if (metrics >= 1 && dims >= 1 && !series) {
    out.push('bar', 'pie', 'donut', 'line')
  }
  if (metrics >= 1 && (dims >= 1 || series)) {
    out.push('line', 'bar')
  }
  out.push('table')
  return [...new Set(out)].filter((t) => DASHBOARD_WIDGET_TYPES.includes(t))
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
  return {
    sources,
    joins,
    dimensions,
    metrics,
    seriesField: seriesField || null,
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
    return list.map((row) => ({
      name: String(dim0 ? row[dim0] : row.series_key || 'Item'),
      values: [Number(row[metricAs]) || 0],
    }))
  }

  if (widgetType === 'bar') {
    return list.map((row) => ({
      name: String(dim0 ? row[dim0] : row.series_key || 'Item'),
      value: Number(row[metricAs]) || 0,
    }))
  }

  if (widgetType === 'line') {
    if (dataConfig.seriesField) {
      const categories = [...new Set(list.map((r) => String(dim0 ? r[dim0] : '')))]
      const seriesNames = [...new Set(list.map((r) => String(r.series_key || 'Series')))]
      const dataset = seriesNames.map((name) => ({
        name,
        type: 'line',
        useArea: Boolean(displayConfig?.useArea),
        series: categories.map((cat) => {
          const hit = list.find(
            (r) => String(dim0 ? r[dim0] : '') === cat && String(r.series_key || 'Series') === name,
          )
          return Number(hit?.[metricAs]) || 0
        }),
      }))
      return { categories, dataset }
    }
    const categories = list.map((r) => String(dim0 ? r[dim0] : ''))
    return {
      categories,
      dataset: [{
        name: metricAs,
        type: 'line',
        useArea: Boolean(displayConfig?.useArea),
        series: list.map((r) => Number(r[metricAs]) || 0),
      }],
    }
  }

  // table / fallback
  return { rows: list }
}
