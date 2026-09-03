/**
 * Parse uploaded field schemas for migration Known fields.
 * Preferred shape: flat object of dotted path → type string.
 * Empty type ("") means untyped — do not assume string/any default.
 */

/**
 * @typedef {{ path: string, type: string }} UploadedField
 */

/**
 * Normalize a type token. Empty input stays empty (untyped).
 * @param {unknown} raw
 * @returns {string}
 */
export function normalizeUploadedFieldType(raw) {
  const s = String(raw ?? '').trim().toLowerCase()
  if (!s) return ''
  if (s === 'int' || s === 'integer') return 'integer'
  if (s === 'numeric' || s === 'float' || s === 'decimal' || s === 'double' || s === 'real') return 'number'
  if (s === 'number') return 'number'
  if (s === 'bool' || s === 'boolean') return 'boolean'
  if (s === 'text' || s === 'string') return 'string'
  if (s === 'date') return 'date'
  if (s === 'date-time' || s === 'datetime' || s === 'timestamp') return 'timestamp'
  if (s === 'json' || s === 'object' || s === 'array') return 'json'
  return s
}

/**
 * Example shown in the Known fields info tip.
 */
export const FIELD_SCHEMA_UPLOAD_EXAMPLE = `{
  "id": "integer",
  "email": "string",
  "active": "boolean",
  "interface.domain": "string",
  "note": ""
}`

/**
 * Parse JSON text or object into field paths (+ optional types).
 * Supports:
 * - flat map: { "id": "integer", "interface.domain": "string", "note": "" }
 * - flat map of objects: { "id": { "type": "integer" } }
 * - array of { name|field|key|column, type? }
 * - plain string array: ["id","email"]
 *
 * @param {unknown} raw
 * @returns {{ fields: UploadedField[], names: string[], types: Record<string, string> }}
 */
export function parseUploadedFieldSchema(raw) {
  let data = raw
  if (typeof raw === 'string') {
    const text = raw.trim()
    if (!text) {
      throw new Error('JSON file is empty')
    }
    try {
      data = JSON.parse(text)
    }
    catch {
      throw new Error('Invalid JSON')
    }
  }

  /** @type {UploadedField[]} */
  const fields = []

  const push = (pathRaw, typeRaw) => {
    const path = String(pathRaw || '').trim()
    if (!path) return
    const type = normalizeUploadedFieldType(typeRaw)
    fields.push({ path, type })
  }

  if (Array.isArray(data)) {
    for (const item of data) {
      if (typeof item === 'string' || typeof item === 'number') {
        push(item, '')
        continue
      }
      if (item && typeof item === 'object') {
        const path = item.name ?? item.field ?? item.key ?? item.column ?? item.path
        const type = item.type ?? item.dataType ?? item.data_type ?? ''
        push(path, type)
      }
    }
  }
  else if (data && typeof data === 'object') {
    // Prefer flat map. If classic JSON Schema with properties, also accept as convenience.
    if (data.properties && typeof data.properties === 'object' && !Array.isArray(data.properties)) {
      for (const [path, meta] of Object.entries(data.properties)) {
        if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
          push(path, meta.type ?? '')
        }
        else {
          push(path, meta)
        }
      }
    }
    else {
      for (const [path, meta] of Object.entries(data)) {
        if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
          push(path, meta.type ?? meta.dataType ?? meta.data_type ?? '')
        }
        else {
          push(path, meta)
        }
      }
    }
  }
  else {
    throw new Error('JSON must be an object or array of fields')
  }

  if (!fields.length) {
    throw new Error('No field paths found in JSON')
  }

  /** @type {Record<string, string>} */
  const types = {}
  const names = []
  const seen = new Set()
  for (const field of fields) {
    if (seen.has(field.path)) continue
    seen.add(field.path)
    names.push(field.path)
    // Empty type = untyped; do not assume a default and do not store "".
    if (field.type) types[field.path] = field.type
  }

  return { fields, names, types }
}

/**
 * Merge type maps. Only non-empty incoming types are applied; existing types are kept
 * when the upload leaves a path untyped.
 * @param {Record<string, string> | null | undefined} current
 * @param {Record<string, string> | null | undefined} extra
 * @returns {Record<string, string>}
 */
export function mergeFieldTypeMaps(current, extra) {
  /** @type {Record<string, string>} */
  const out = {}
  if (current && typeof current === 'object') {
    for (const [path, type] of Object.entries(current)) {
      const t = normalizeUploadedFieldType(type)
      if (path && t) out[path] = t
    }
  }
  if (extra && typeof extra === 'object') {
    for (const [path, type] of Object.entries(extra)) {
      const key = String(path || '').trim()
      const t = normalizeUploadedFieldType(type)
      if (!key || !t) continue
      out[key] = t
    }
  }
  return out
}
