/**
 * Report query + display config helpers (Reports MVP).
 */

/**
 * @param {string} value
 */
function cleanId(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/^[^a-z]+/, '')
    .slice(0, 63)
}

/**
 * @param {string} field alias.field
 */
export function defaultFieldAs(field) {
  const [alias, name] = String(field || '').split('.')
  return cleanId(`${alias || 't'}_${name || 'col'}`) || 'col'
}

/**
 * Normalize report query_config.
 * @param {unknown} raw
 */
export function normalizeReportQueryConfig(raw) {
  const cfg = raw && typeof raw === 'object' ? raw : {}
  const sources = Array.isArray(cfg.sources)
    ? cfg.sources
      .map((s, i) => ({
        table: String(s?.table || '').trim().toLowerCase(),
        alias: cleanId(s?.alias) || `t${i}`,
      }))
      .filter((s) => s.table)
    : []

  const joins = Array.isArray(cfg.joins)
    ? cfg.joins
      .map((j) => {
        const type = String(j?.type || 'inner').toLowerCase() === 'left' ? 'left' : 'inner'
        return {
          left: String(j?.left || '').trim(),
          right: String(j?.right || '').trim(),
          type,
        }
      })
      .filter((j) => j.left && j.right)
    : []

  const fields = Array.isArray(cfg.fields)
    ? cfg.fields
      .map((f) => {
        const field = String(f?.field || '').trim()
        if (!field || !field.includes('.')) return null
        const as = cleanId(f?.as) || defaultFieldAs(field)
        const header = f?.header != null ? String(f.header).trim() : ''
        return {
          field,
          as,
          header: header || null,
        }
      })
      .filter(Boolean)
    : []

  const limit = Math.max(1, Math.min(Number(cfg.limit) || 500, 10000))

  return {
    sources,
    joins,
    fields,
    limit,
  }
}

/**
 * Normalize report display_config.
 * @param {unknown} raw
 */
export function normalizeReportDisplayConfig(raw) {
  const cfg = raw && typeof raw === 'object' ? raw : {}
  return {
    pageSize: Math.max(5, Math.min(Number(cfg.pageSize) || 25, 200)),
  }
}

/**
 * Empty starter config.
 */
export function emptyReportQueryConfig() {
  return {
    sources: [],
    joins: [],
    fields: [],
    limit: 500,
  }
}

/**
 * Build AG Grid column defs from query fields.
 * @param {ReturnType<typeof normalizeReportQueryConfig>['fields']} fields
 */
export function reportColumnDefs(fields) {
  return (fields || []).map((f) => ({
    field: f.as,
    headerName: f.header || f.as,
    colId: f.as,
    // Keep separators readable on dark theme.
    cellStyle: {
      borderRight: '1px solid var(--border-soft, #2f3742)',
    },
    headerStyle: {
      borderRight: '1px solid var(--border-soft, #2f3742)',
    },
  }))
}

/**
 * Validate a report query is runnable.
 * @param {ReturnType<typeof normalizeReportQueryConfig>} queryConfig
 * @returns {string|null} error message or null
 */
export function validateReportQuery(queryConfig) {
  if (!queryConfig.sources.length) return 'Select at least one source table'
  if (!queryConfig.fields.length) return 'Select at least one field to display'
  if (queryConfig.sources.length > 1 && queryConfig.joins.length < queryConfig.sources.length - 1) {
    return 'Define a join for each additional table'
  }
  return null
}
