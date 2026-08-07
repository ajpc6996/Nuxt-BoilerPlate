/**
 * Dashboard grid collision helpers (insert / push-down behaviour).
 */

/**
 * @param {{ grid_x: number, grid_y: number, grid_w: number, grid_h: number }} a
 * @param {{ grid_x: number, grid_y: number, grid_w: number, grid_h: number }} b
 */
export function widgetsOverlap(a, b) {
  return !(
    a.grid_x + a.grid_w <= b.grid_x
    || b.grid_x + b.grid_w <= a.grid_x
    || a.grid_y + a.grid_h <= b.grid_y
    || b.grid_y + b.grid_h <= a.grid_y
  )
}

/**
 * Push overlapping widgets downward so `activeId` keeps its place (insert-style).
 * Cascades until stable. Mutates items in place and returns them.
 *
 * @param {Array<{ id: string, grid_x: number, grid_y: number, grid_w: number, grid_h: number }>} items
 * @param {string} [activeId] Widget that must not be moved (the one being dragged).
 */
export function resolveLayoutCollisions(items, activeId = null) {
  const list = items
  let changed = true
  let guard = 0

  while (changed && guard < 80) {
    changed = false
    guard += 1

    // Prefer resolving against the active item first so others yield.
    if (activeId) {
      const active = list.find((w) => w.id === activeId)
      if (active) {
        for (const other of list) {
          if (other.id === activeId) continue
          if (widgetsOverlap(active, other)) {
            const nextY = active.grid_y + active.grid_h
            if (other.grid_y !== nextY) {
              other.grid_y = nextY
              changed = true
            }
          }
        }
      }
    }

    // Then resolve remaining pairwise overlaps top-to-bottom.
    const ordered = [...list].sort((a, b) =>
      (a.grid_y - b.grid_y) || (a.grid_x - b.grid_x) || String(a.id).localeCompare(String(b.id)),
    )

    for (let i = 0; i < ordered.length; i += 1) {
      for (let j = i + 1; j < ordered.length; j += 1) {
        const a = ordered[i]
        const b = ordered[j]
        if (!widgetsOverlap(a, b)) continue
        // Keep active fixed; otherwise keep the higher (smaller y) fixed.
        let keep = a
        let move = b
        if (activeId && b.id === activeId) {
          keep = b
          move = a
        }
        else if (activeId && a.id === activeId) {
          keep = a
          move = b
        }
        else if (b.grid_y < a.grid_y) {
          keep = b
          move = a
        }
        const nextY = keep.grid_y + keep.grid_h
        if (move.grid_y !== nextY) {
          move.grid_y = nextY
          changed = true
        }
      }
    }
  }

  return list
}

/**
 * Normalize display_config for widgets.
 * @param {unknown} raw
 */
export function normalizeDisplayConfig(raw) {
  const cfg = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  return {
    showLegend: cfg.showLegend !== false,
    showSeriesIndicators: cfg.showSeriesIndicators !== false,
    showWidgetType: Boolean(cfg.showWidgetType),
    /** Per-widget chart toolbar (vue-data-ui user options). Opt-in. */
    showTools: cfg.showTools === true
      || cfg.showTools === 'true'
      || cfg.showTools === 1
      || cfg.showTools === '1',
    useArea: Boolean(cfg.useArea),
  }
}

/**
 * Normalize dashboard layout JSON (grid + view tools).
 * @param {unknown} raw
 */
export function normalizeDashboardLayout(raw) {
  const layout = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const toolsRaw = layout.tools && typeof layout.tools === 'object' && !Array.isArray(layout.tools)
    ? layout.tools
    : {}
  const enabledFlag = toolsRaw.enabled ?? layout.showToolsMenu ?? layout.toolsMenuEnabled
  const enabled = enabledFlag === true
    || enabledFlag === 'true'
    || enabledFlag === 1
    || enabledFlag === '1'
  return {
    version: Number(layout.version) || 1,
    cols: Math.max(1, Number(layout.cols) || 12),
    tools: {
      enabled,
    },
    showToolsMenu: enabled,
  }
}
