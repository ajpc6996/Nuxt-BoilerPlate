/**
 * Inner-join merge for pipeline Merge operator (v1: exactly two inputs).
 */

/**
 * @param {Record<string, unknown>} row
 * @param {string} field
 */
function fieldValue(row, field) {
  if (!field || !row || typeof row !== 'object') return undefined
  return row[field]
}

/**
 * Stable string key for join matching.
 * @param {unknown} value
 */
export function joinKeyString(value) {
  if (value === null || value === undefined) return null
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    }
    catch {
      return String(value)
    }
  }
  return String(value)
}

/**
 * Prefix all keys on a row (skip empty prefix).
 * @param {Record<string, unknown>} row
 * @param {string} prefix
 */
export function prefixRow(row, prefix) {
  if (!prefix) return { ...(row || {}) }
  /** @type {Record<string, unknown>} */
  const out = {}
  Object.entries(row || {}).forEach(([k, v]) => {
    out[`${prefix}${k}`] = v
  })
  return out
}

/**
 * Build composite join key from one or more field names.
 * @param {Record<string, unknown>} row
 * @param {string[]} fields
 */
function compositeKey(row, fields) {
  if (!fields.length) return null
  const parts = fields.map((f) => joinKeyString(fieldValue(row, f)))
  if (parts.some((p) => p === null)) return null
  return parts.join('\u0001')
}

/**
 * Inner join two row arrays on key pairs.
 *
 * @param {Record<string, unknown>[]} leftRows
 * @param {Record<string, unknown>[]} rightRows
 * @param {{
 *   keys?: Array<{ left?: string, right?: string }>,
 *   leftPrefix?: string,
 *   rightPrefix?: string,
 * }} [config]
 */
export function runMergeOperator(leftRows, rightRows, config = {}) {
  const left = Array.isArray(leftRows) ? leftRows : []
  const right = Array.isArray(rightRows) ? rightRows : []
  const leftPrefix = typeof config.leftPrefix === 'string' ? config.leftPrefix : 'a_'
  const rightPrefix = typeof config.rightPrefix === 'string' ? config.rightPrefix : 'b_'

  const keyPairs = (Array.isArray(config.keys) ? config.keys : [])
    .map((k) => ({
      left: String(k?.left || '').trim(),
      right: String(k?.right || '').trim(),
    }))
    .filter((k) => k.left && k.right)

  if (!keyPairs.length) {
    return {
      rows: [],
      meta: {
        inLeft: left.length,
        inRight: right.length,
        out: 0,
        matched: 0,
        error: 'Merge needs at least one join key pair (left + right field)',
      },
    }
  }

  const leftFields = keyPairs.map((k) => k.left)
  const rightFields = keyPairs.map((k) => k.right)

  /** @type {Map<string, Record<string, unknown>[]>} */
  const rightIndex = new Map()
  for (const row of right) {
    const key = compositeKey(row, rightFields)
    if (key === null) continue
    if (!rightIndex.has(key)) rightIndex.set(key, [])
    rightIndex.get(key).push(row)
  }

  /** @type {Record<string, unknown>[]} */
  const out = []
  let matchedLeft = 0

  for (const lrow of left) {
    const key = compositeKey(lrow, leftFields)
    if (key === null) continue
    const matches = rightIndex.get(key)
    if (!matches?.length) continue
    matchedLeft += 1
    const leftPart = prefixRow(lrow, leftPrefix)
    for (const rrow of matches) {
      out.push({
        ...leftPart,
        ...prefixRow(rrow, rightPrefix),
      })
    }
  }

  return {
    rows: out,
    meta: {
      inLeft: left.length,
      inRight: right.length,
      out: out.length,
      matched: matchedLeft,
      keys: keyPairs,
      leftPrefix,
      rightPrefix,
    },
  }
}

/**
 * @param {Record<string, unknown>} data
 * @param {string} nodeId
 * @returns {string | null}
 */
export function validateMergeConfig(data, nodeId) {
  const keys = Array.isArray(data?.keys) ? data.keys : []
  const valid = keys.some((k) => String(k?.left || '').trim() && String(k?.right || '').trim())
  if (!valid) {
    return `Merge “${nodeId}” needs at least one join key (left + right fields)`
  }
  return null
}
