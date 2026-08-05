/**
 * Apply field projection + AND row predicates (flat keys only).
 *
 * @param {Record<string, unknown>[]} rows
 * @param {{
 *   select?: string[],
 *   where?: Array<{ field: string, op: string, value?: unknown, caseSensitive?: boolean }>,
 * }} config
 */
export function runFilterOperator(rows, config = {}) {
  const input = Array.isArray(rows) ? rows : []
  const where = Array.isArray(config.where)
    ? config.where.filter((r) => r && String(r.field || '').trim())
    : []
  const select = Array.isArray(config.select)
    ? config.select.map((s) => String(s).trim()).filter(Boolean)
    : []

  let kept = input.filter((row) => where.every((rule) => matchRule(row, rule)))
  const afterWhere = kept.length
  const droppedByWhere = input.length - afterWhere

  if (select.length) {
    kept = kept.map((row) => projectRow(row, select))
  }

  return {
    rows: kept,
    meta: {
      in: input.length,
      out: kept.length,
      dropped: input.length - kept.length,
      droppedByWhere,
      projected: select.length > 0,
      select,
      whereCount: where.length,
    },
  }
}

/**
 * @param {Record<string, unknown>} row
 * @param {{ field: string, op: string, value?: unknown, caseSensitive?: boolean }} rule
 */
function matchRule(row, rule) {
  const field = String(rule.field)
  const op = String(rule.op || 'eq')
  const raw = row?.[field]
  const caseSensitive = Boolean(rule.caseSensitive)
  const left = stringify(raw, caseSensitive)
  const right = stringify(rule.value, caseSensitive)

  switch (op) {
    case 'eq':
      return left === right
    case 'neq':
      return left !== right
    case 'contains':
      return left.includes(right)
    case 'not_contains':
      return !left.includes(right)
    default:
      return true
  }
}

/**
 * @param {unknown} value
 * @param {boolean} caseSensitive
 */
function stringify(value, caseSensitive) {
  if (value == null) return ''
  const s = typeof value === 'string' ? value : JSON.stringify(value)
  return caseSensitive ? s : s.toLowerCase()
}

/**
 * @param {Record<string, unknown>} row
 * @param {string[]} keys
 */
function projectRow(row, keys) {
  /** @type {Record<string, unknown>} */
  const out = {}
  keys.forEach((k) => {
    if (Object.prototype.hasOwnProperty.call(row, k)) {
      out[k] = row[k]
    }
  })
  return out
}
