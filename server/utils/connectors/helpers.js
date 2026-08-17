/**
 * @param {unknown} value
 * @param {string} path dotted path; empty = root
 */
export function getByPath(value, path) {
  const p = String(path || '').trim()
  if (!p) return value
  return p.split('.').reduce((acc, key) => {
    if (acc == null) return undefined
    return acc[key]
  }, value)
}

/**
 * Normalize various JSON shapes into an array of row objects.
 * @param {unknown} payload
 * @param {string} [itemsPath]
 * @returns {Record<string, unknown>[]}
 */
export function toRowArray(payload, itemsPath = '') {
  const target = itemsPath ? getByPath(payload, itemsPath) : payload

  if (Array.isArray(target)) {
    return target.map((item, index) => {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        return /** @type {Record<string, unknown>} */ (item)
      }
      return { value: item, _index: index }
    })
  }

  if (target && typeof target === 'object') {
    return [/** @type {Record<string, unknown>} */ (target)]
  }

  throw createError({
    statusCode: 400,
    statusMessage: 'Expected a JSON array or object for ingestion',
  })
}

/**
 * Minimal CSV parser (handles quotes and custom delimiter).
 * @param {string} text
 * @param {string} [delimiter]
 * @returns {Record<string, unknown>[]}
 */
export function parseCsv(text, delimiter = ',') {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  const input = String(text || '').replace(/^\uFEFF/, '')

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i]
    const next = input[i + 1]

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"'
        i += 1
      }
      else if (ch === '"') {
        inQuotes = false
      }
      else {
        field += ch
      }
      continue
    }

    if (ch === '"') {
      inQuotes = true
    }
    else if (ch === delimiter) {
      row.push(field)
      field = ''
    }
    else if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    }
    else if (ch === '\r') {
      // ignore; handle \r\n via \n
    }
    else {
      field += ch
    }
  }

  if (field.length || row.length) {
    row.push(field)
    rows.push(row)
  }

  if (!rows.length) return []

  const headers = rows[0].map((h, idx) => {
    const name = String(h || '').trim()
    return name || `col_${idx + 1}`
  })

  return rows.slice(1).filter((r) => r.some((cell) => String(cell).trim() !== '')).map((r) => {
    /** @type {Record<string, unknown>} */
    const obj = {}
    headers.forEach((header, idx) => {
      obj[header] = r[idx] ?? ''
    })
    return obj
  })
}

/**
 * @param {unknown} value
 */
function serializeCsvValue(value) {
  if (value == null) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

/**
 * Convert row objects to CSV text (header row from union of keys).
 * @param {Record<string, unknown>[]} rows
 * @param {string} [delimiter]
 */
export function rowsToCsv(rows, delimiter = ',') {
  const list = Array.isArray(rows) ? rows.filter((r) => r && typeof r === 'object') : []
  if (!list.length) return ''

  const headers = [...new Set(list.flatMap((r) => Object.keys(r)))]
  const escape = (val) => {
    const s = serializeCsvValue(val)
    if (s.includes('"') || s.includes('\n') || s.includes(delimiter)) {
      return `"${s.replace(/"/g, '""')}"`
    }
    return s
  }

  const lines = [
    headers.map(escape).join(delimiter),
    ...list.map((row) => headers.map((h) => escape(row[h])).join(delimiter)),
  ]
  return lines.join('\n')
}
