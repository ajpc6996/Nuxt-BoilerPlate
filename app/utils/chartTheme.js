/**
 * Shared Dark Theme (Sintrex) tokens for vue-data-ui widgets.
 * MIT library: https://vue-data-ui.graphieros.com/
 */

export const chartPalette = [
  '#00c2c7',
  '#7eeaee',
  '#3d8bfd',
  '#a78bfa',
  '#f0a060',
  '#34d399',
  '#f472b6',
  '#94a3b8',
]

export const chartInk = '#e8eef4'
export const chartMute = '#9aa7b5'
export const chartSurface = '#1e232b'
export const chartBorder = '#2f3742'
export const chartAccent = '#00c2c7'

/**
 * Hide vue-data-ui chrome buttons for a cleaner dashboard look.
 * VueUiXy reads `chart.userOptions`; some charts also accept top-level `userOptions`.
 * @returns {Record<string, unknown>}
 */
export function chartUserOptionsOff() {
  return {
    show: false,
    showOnChartHover: false,
    keepStateOnChartLeave: false,
    buttons: {
      tooltip: false,
      pdf: false,
      csv: false,
      img: false,
      svg: false,
      labels: false,
      table: false,
      stack: false,
      sort: false,
      zoom: false,
      animation: false,
      fullscreen: false,
      annotator: false,
      altCopy: false,
    },
  }
}

/**
 * Show the chart's built-in user-options menu with library defaults.
 * Do not override `buttons` — each chart type applies its own applicable set
 * (PDF, PNG, CSV, SVG, table, labels, stack, fullscreen, annotator, etc.).
 * @param {boolean} enabled
 * @returns {Record<string, unknown>}
 */
export function chartUserOptionsForTools(enabled) {
  if (!enabled) return chartUserOptionsOff()
  return {
    show: true,
    showOnChartHover: true,
    keepStateOnChartLeave: true,
    position: 'right',
  }
}

/**
 * Base style shared by most chart configs.
 * @param {Record<string, unknown>} [extra]
 */
export function chartBaseStyle(extra = {}) {
  return {
    fontFamily: 'DM Sans, system-ui, sans-serif',
    chart: {
      backgroundColor: chartSurface,
      color: chartInk,
      ...extra,
    },
  }
}

/**
 * Deep-merge plain objects (arrays replaced, not concatenated).
 * @param {Record<string, unknown>} target
 * @param {Record<string, unknown>} source
 */
export function mergeChartConfig(target, source) {
  const out = { ...target }
  for (const key of Object.keys(source || {})) {
    const sv = source[key]
    const tv = out[key]
    if (
      sv
      && typeof sv === 'object'
      && !Array.isArray(sv)
      && tv
      && typeof tv === 'object'
      && !Array.isArray(tv)
    ) {
      out[key] = mergeChartConfig(tv, sv)
    }
    else {
      out[key] = sv
    }
  }
  return out
}

/**
 * Compact XY plot padding for dashboard fill widgets.
 * @param {{ manyCategories?: boolean, showLegend?: boolean, compact?: boolean }} [opts]
 */
export function xyFillPadding(opts = {}) {
  const many = Boolean(opts.manyCategories)
  const legend = opts.showLegend !== false
  const compact = opts.compact !== false
  if (!compact) {
    return {
      top: 12,
      right: 16,
      bottom: many ? 64 : 32,
      left: 8,
    }
  }
  return {
    top: 2,
    right: 4,
    bottom: many ? 48 : (legend ? 8 : 4),
    left: 2,
  }
}

/**
 * Donut/pie radius — larger when outer labels are off so the chart fills the tile.
 * Keep within vue-data-ui's safe range (clamped to ~0.5).
 * @param {{ showSeriesIndicators?: boolean, pie?: boolean }} [opts]
 */
export function donutRadiusRatio(opts = {}) {
  if (opts.showSeriesIndicators) return opts.pie ? 0.34 : 0.3
  return opts.pie ? 0.42 : 0.4
}
