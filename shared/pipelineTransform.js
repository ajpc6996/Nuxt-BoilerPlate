/**
 * Transform operator — ordered field actions; never drops rows.
 *
 * Stored action ops:
 *   v1:  trim | case | join | split | join_array | regex |
 *        rename | copy | drop | cast | default
 *   v1.1: template | conditional | map | date_format
 *
 * Trim modes (stored ids, not UI labels):
 *   start | end | both | remove_spaces
 *   (collapse_whitespace reserved for later)
 */

export const TRANSFORM_OPS = [
  'trim',
  'case',
  'join',
  'split',
  'join_array',
  'regex',
  'rename',
  'copy',
  'drop',
  'keep',
  'cast',
  'default',
  'template',
  'conditional',
  'map',
  'date_format',
]

export const TRIM_MODES = ['start', 'end', 'both', 'remove_spaces']

export const CASE_STYLES = ['camel', 'snake', 'kebab', 'pascal', 'lower', 'upper']

export const CAST_TYPES = ['string', 'number', 'boolean', 'date']

export const DEFAULT_WHENS = ['null', 'empty', 'null_or_empty', 'always']

export const CONDITIONAL_OPS = ['eq', 'neq', 'contains', 'not_contains', 'empty', 'not_empty']

export const DATE_FORMATS = [
  'iso',
  'date',
  'datetime',
  'YYYY-MM-DD',
  'DD/MM/YYYY',
  'MM/DD/YYYY',
]

/**
 * Resolve a field name on a row (exact match, then case-insensitive).
 * @param {Record<string, unknown>} row
 * @param {string} fieldName
 * @returns {{ key: string, value: unknown } | null}
 */
export function resolveRowField(row, fieldName) {
  const name = String(fieldName || '').trim()
  if (!name || !row || typeof row !== 'object') return null
  if (Object.prototype.hasOwnProperty.call(row, name)) {
    return { key: name, value: row[name] }
  }
  const want = name.toLowerCase()
  for (const key of Object.keys(row)) {
    if (key.toLowerCase() === want) {
      return { key, value: row[key] }
    }
  }
  return null
}

/**
 * First matching field from a list of candidate names.
 * @param {Record<string, unknown>} row
 * @param {string[]} fieldNames
 * @returns {{ key: string, value: unknown, field: string } | null}
 */
export function resolveFirstRowField(row, fieldNames) {
  const list = Array.isArray(fieldNames)
    ? fieldNames.map((f) => String(f || '').trim()).filter(Boolean)
    : []
  for (const field of list) {
    const resolved = resolveRowField(row, field)
    if (resolved) return { ...resolved, field }
  }
  return null
}

export const MAP_FALLBACKS = ['keep', 'null', 'value']

const REGEX_PATTERN_MAX = 200
const REGEX_INPUT_MAX = 50_000
const TEMPLATE_MAX = 2000

/**
 * @param {Record<string, unknown>[]} rows
 * @param {{ actions?: Array<Record<string, unknown>> }} config
 */
export function runTransformOperator(rows, config = {}) {
  const input = Array.isArray(rows) ? rows : []
  const actions = Array.isArray(config.actions)
    ? config.actions.filter((a) => a && TRANSFORM_OPS.includes(String(a.op || '')))
    : []

  const out = input.map((row) => applyActions({ ...(row || {}) }, actions))

  return {
    rows: out,
    meta: {
      in: input.length,
      out: out.length,
      actionCount: actions.length,
      actions: actions.map((a) => a.op),
    },
  }
}

/**
 * Apply actions to a single sample object (UI preview).
 * @param {Record<string, unknown>} row
 * @param {Array<Record<string, unknown>>} actions
 */
export function previewTransformRow(row, actions) {
  const list = Array.isArray(actions) ? actions : []
  return applyActions({ ...(row || {}) }, list)
}

/**
 * @param {Record<string, unknown>} row
 * @param {Array<Record<string, unknown>>} actions
 */
function applyActions(row, actions) {
  let current = row
  for (const action of actions) {
    current = applyOne(current, action)
  }
  return current
}

/**
 * @param {Record<string, unknown>} row
 * @param {Record<string, unknown>} action
 */
function applyOne(row, action) {
  const op = String(action.op || '')
  switch (op) {
    case 'trim':
      return applyTrim(row, action)
    case 'case':
      return applyCase(row, action)
    case 'join':
      return applyJoin(row, action)
    case 'split':
      return applySplit(row, action)
    case 'join_array':
      return applyJoinArray(row, action)
    case 'regex':
      return applyRegex(row, action)
    case 'rename':
      return applyRename(row, action)
    case 'copy':
      return applyCopy(row, action)
    case 'drop':
      return applyDrop(row, action)
    case 'keep':
      return applyKeep(row, action)
    case 'cast':
      return applyCast(row, action)
    case 'default':
      return applyDefault(row, action)
    case 'template':
      return applyTemplate(row, action)
    case 'conditional':
      return applyConditional(row, action)
    case 'map':
      return applyMap(row, action)
    case 'date_format':
      return applyDateFormat(row, action)
    default:
      return row
  }
}

/**
 * @param {Record<string, unknown>} row
 * @param {Record<string, unknown>} action
 */
function applyTrim(row, action) {
  const field = String(action.field || '').trim()
  if (!field || !(field in row)) return row
  const mode = TRIM_MODES.includes(action.mode) ? action.mode : 'both'
  const target = String(action.targetField || '').trim() || field
  const next = { ...row }
  next[target] = trimValue(stringifyCell(row[field]), mode)
  return next
}

/**
 * @param {string} value
 * @param {string} mode
 */
function trimValue(value, mode) {
  if (mode === 'start') return value.replace(/^\s+/, '')
  if (mode === 'end') return value.replace(/\s+$/, '')
  if (mode === 'remove_spaces') return value.replace(/\s+/g, '')
  return value.trim()
}

/**
 * Value transform + optional rename of the written field.
 * @param {Record<string, unknown>} row
 * @param {Record<string, unknown>} action
 */
function applyCase(row, action) {
  const field = String(action.field || '').trim()
  if (!field || !(field in row)) return row
  const style = CASE_STYLES.includes(action.style) ? action.style : 'camel'
  const writeKey = String(action.targetField || '').trim() || field
  const renameTo = String(action.renameTo || '').trim()
  const next = { ...row }
  next[writeKey] = applyCaseStyle(stringifyCell(row[field]), style)
  if (renameTo && renameTo !== writeKey) {
    next[renameTo] = next[writeKey]
    delete next[writeKey]
  }
  return next
}

/**
 * @param {string} value
 * @param {string} style
 */
function applyCaseStyle(value, style) {
  if (style === 'lower') return value.toLowerCase()
  if (style === 'upper') return value.toUpperCase()
  const words = splitWords(value)
  if (style === 'snake') return words.map((w) => w.toLowerCase()).join('_')
  if (style === 'kebab') return words.map((w) => w.toLowerCase()).join('-')
  if (style === 'pascal') {
    return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('')
  }
  // camel
  return words
    .map((w, i) => {
      const lower = w.toLowerCase()
      if (i === 0) return lower
      return lower.charAt(0).toUpperCase() + lower.slice(1)
    })
    .join('')
}

/**
 * @param {string} value
 */
function splitWords(value) {
  const normalized = String(value || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!normalized) return []
  return normalized.split(' ').filter(Boolean)
}

/**
 * @param {Record<string, unknown>} row
 * @param {Record<string, unknown>} action
 */
function applyJoin(row, action) {
  const fields = Array.isArray(action.fields)
    ? action.fields.map((f) => String(f || '').trim()).filter(Boolean)
    : []
  const target = String(action.targetField || '').trim()
  if (!fields.length || !target) return row
  const sep = action.separator != null ? String(action.separator) : ' '
  const parts = fields
    .map((f) => row[f])
    .filter((v) => v != null && String(v) !== '')
    .map((v) => stringifyCell(v))
  const next = { ...row }
  next[target] = parts.join(sep)
  return next
}

/**
 * @param {Record<string, unknown>} row
 * @param {Record<string, unknown>} action
 */
function applySplit(row, action) {
  const field = String(action.field || '').trim()
  const target = String(action.targetField || '').trim()
  if (!field || !target || !(field in row)) return row
  const sep = action.separator != null && String(action.separator).length
    ? String(action.separator)
    : ','
  const trimParts = action.trimParts !== false
  const dropEmpty = action.dropEmpty !== false
  let parts = stringifyCell(row[field]).split(sep)
  if (trimParts) parts = parts.map((p) => p.trim())
  if (dropEmpty) parts = parts.filter((p) => p !== '')
  const next = { ...row }
  next[target] = parts
  return next
}

/**
 * @param {Record<string, unknown>} row
 * @param {Record<string, unknown>} action
 */
function applyJoinArray(row, action) {
  const field = String(action.field || '').trim()
  if (!field || !(field in row)) return row
  const target = String(action.targetField || '').trim() || field
  const sep = action.separator != null ? String(action.separator) : ','
  const raw = row[field]
  const list = Array.isArray(raw)
    ? raw
    : raw == null
      ? []
      : [raw]
  const next = { ...row }
  next[target] = list.map((v) => stringifyCell(v)).join(sep)
  return next
}

/**
 * @param {Record<string, unknown>} row
 * @param {Record<string, unknown>} action
 */
function applyRegex(row, action) {
  const field = String(action.field || '').trim()
  if (!field || !(field in row)) return row
  const pattern = String(action.pattern || '')
  if (!pattern || pattern.length > REGEX_PATTERN_MAX) return row
  const flags = sanitizeFlags(String(action.flags || 'g'))
  const replacement = action.replacement != null ? String(action.replacement) : ''
  const target = String(action.targetField || '').trim() || field
  const input = stringifyCell(row[field])
  if (input.length > REGEX_INPUT_MAX) return row
  try {
    const re = new RegExp(pattern, flags)
    const next = { ...row }
    next[target] = input.replace(re, replacement)
    return next
  }
  catch {
    return row
  }
}

/**
 * @param {string} flags
 */
function sanitizeFlags(flags) {
  return [...new Set(String(flags).replace(/[^gimsuy]/g, '').split(''))].join('') || 'g'
}

/**
 * @param {Record<string, unknown>} row
 * @param {Record<string, unknown>} action
 */
function applyRename(row, action) {
  const { field, target } = resolveCopyFields(action)
  if (!field || !target || field === target || !(field in row)) return row
  const next = { ...row }
  next[target] = next[field]
  delete next[field]
  return next
}

/**
 * @param {Record<string, unknown>} row
 * @param {Record<string, unknown>} action
 */
function applyCopy(row, action) {
  const fields = Array.isArray(action.fields)
    ? action.fields.map((f) => String(f || '').trim()).filter(Boolean)
    : []

  if (fields.length) {
    const target = String(action.targetField || '').trim()
    if (!target) return row
    const resolved = resolveFirstRowField(row, fields)
    if (!resolved) return row
    const next = { ...row }
    next[target] = resolved.value
    return next
  }

  const { field, target } = resolveCopyFields(action)
  if (!field || !target) return row
  const resolved = resolveRowField(row, field)
  if (!resolved) return row
  const next = { ...row }
  next[target] = resolved.value
  return next
}

/**
 * Resolve copy/rename source + target, including legacy { field, from } shape.
 * @param {Record<string, unknown>} action
 */
function resolveCopyFields(action) {
  const from = String(action.from || '').trim()
  const field = String(action.field || '').trim()
  const targetField = String(action.targetField || '').trim()
  if (targetField) {
    return { field, target: targetField }
  }
  if (from && field) {
    return { field: from, target: field }
  }
  return { field, target: targetField }
}

/**
 * @param {Record<string, unknown>} row
 * @param {Record<string, unknown>} action
 */
function applyDrop(row, action) {
  const fields = Array.isArray(action.fields)
    ? action.fields.map((f) => String(f || '').trim()).filter(Boolean)
    : String(action.field || '').trim()
      ? [String(action.field).trim()]
      : []
  if (!fields.length) return row
  const next = { ...row }
  fields.forEach((f) => {
    delete next[f]
  })
  return next
}

/**
 * Keep only listed fields (used by migration map stages so export does not
 * insert unmapped source columns like RT "Zip" into destination tables).
 * @param {Record<string, unknown>} row
 * @param {Record<string, unknown>} action
 */
function applyKeep(row, action) {
  const fields = Array.isArray(action.fields)
    ? action.fields.map((f) => String(f || '').trim()).filter(Boolean)
    : String(action.field || '').trim()
      ? [String(action.field).trim()]
      : []
  if (!fields.length) return row
  /** @type {Record<string, unknown>} */
  const next = {}
  for (const f of fields) {
    const resolved = resolveRowField(row, f)
    if (resolved) {
      next[f] = resolved.value
    }
  }
  return next
}

/**
 * @param {Record<string, unknown>} row
 * @param {Record<string, unknown>} action
 */
function applyCast(row, action) {
  const field = String(action.field || '').trim()
  if (!field) return row
  const resolved = resolveRowField(row, field)
  if (!resolved) return row
  const to = CAST_TYPES.includes(action.to) ? action.to : 'string'
  const onError = action.onError === 'keep' ? 'keep' : 'null'
  const target = String(action.targetField || '').trim() || field
  const { value, ok } = castValue(resolved.value, to)
  const next = { ...row }
  if (ok) next[target] = value
  else if (onError === 'null') next[target] = null
  else if (target !== resolved.key) next[target] = resolved.value
  return next
}

/**
 * @param {unknown} raw
 * @param {string} to
 */
function castValue(raw, to) {
  if (to === 'string') {
    if (raw == null) return { value: '', ok: true }
    if (typeof raw === 'string') return { value: raw, ok: true }
    if (typeof raw === 'object') return { value: JSON.stringify(raw), ok: true }
    return { value: String(raw), ok: true }
  }
  if (to === 'number') {
    if (typeof raw === 'number' && Number.isFinite(raw)) return { value: raw, ok: true }
    const n = Number(String(raw ?? '').trim())
    if (Number.isFinite(n) && String(raw ?? '').trim() !== '') return { value: n, ok: true }
    return { value: null, ok: false }
  }
  if (to === 'boolean') {
    if (typeof raw === 'boolean') return { value: raw, ok: true }
    const s = String(raw ?? '').trim().toLowerCase()
    if (['true', '1', 'yes', 'y'].includes(s)) return { value: true, ok: true }
    if (['false', '0', 'no', 'n'].includes(s)) return { value: false, ok: true }
    return { value: null, ok: false }
  }
  // date → ISO string
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return { value: raw.toISOString(), ok: true }
  }
  const d = new Date(String(raw ?? '').trim())
  if (!Number.isNaN(d.getTime())) return { value: d.toISOString(), ok: true }
  return { value: null, ok: false }
}

/**
 * @param {Record<string, unknown>} row
 * @param {Record<string, unknown>} action
 */
function applyDefault(row, action) {
  const field = String(action.field || '').trim()
  if (!field) return row
  const when = DEFAULT_WHENS.includes(action.when) ? action.when : 'null_or_empty'
  const current = row[field]
  const isNull = current == null
  const isEmpty = current === '' || (typeof current === 'string' && current.trim() === '')
  let replace = false
  if (when === 'always') replace = true
  else if (when === 'null') replace = isNull
  else if (when === 'empty') replace = isEmpty
  else replace = isNull || isEmpty
  if (!replace) return row
  const next = { ...row }
  next[field] = resolveDefaultValue(action.value)
  return next
}

/**
 * @param {unknown} value
 */
function resolveDefaultValue(value) {
  if (value === '__NOW__' || value === '{{now}}') {
    return new Date().toISOString()
  }
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) {
    const n = Number(value.trim())
    if (Number.isSafeInteger(n)) return n
  }
  if (value === 'true') return true
  if (value === 'false') return false
  return value ?? ''
}

/**
 * Interpolate `{field}` / `${field}` into targetField (no eval).
 * @param {Record<string, unknown>} row
 * @param {Record<string, unknown>} action
 */
function applyTemplate(row, action) {
  const target = String(action.targetField || '').trim()
  const template = String(action.template || '')
  if (!target || !template) return row
  if (template.length > TEMPLATE_MAX) return row
  const rendered = template.replace(
    /\$\{([A-Za-z_][\w]*)\}|\{([A-Za-z_][\w]*)\}/g,
    (_m, a, b) => stringifyCell(row[a || b]),
  )
  const next = { ...row }
  next[target] = rendered
  return next
}

/**
 * If field matches matchOp/value, set targetField to thenValue; else optional elseValue.
 * @param {Record<string, unknown>} row
 * @param {Record<string, unknown>} action
 */
function applyConditional(row, action) {
  const field = String(action.field || '').trim()
  const target = String(action.targetField || '').trim()
  if (!field || !target) return row
  const matchOp = CONDITIONAL_OPS.includes(action.matchOp) ? action.matchOp : 'eq'
  const matched = matchConditional(row[field], matchOp, action.value)
  const next = { ...row }
  if (matched) {
    if (action.thenFromField) {
      const src = String(action.thenFromField).trim()
      next[target] = src in row ? row[src] : action.thenValue ?? ''
    }
    else {
      next[target] = action.thenValue ?? ''
    }
  }
  else if (action.elseFromField) {
    const src = String(action.elseFromField).trim()
    next[target] = src in row ? row[src] : action.elseValue ?? next[target]
  }
  else if (Object.prototype.hasOwnProperty.call(action, 'elseValue')) {
    next[target] = action.elseValue
  }
  return next
}

/**
 * @param {unknown} raw
 * @param {string} matchOp
 * @param {unknown} expected
 */
function matchConditional(raw, matchOp, expected) {
  if (matchOp === 'empty') {
    return raw == null || String(raw).trim() === ''
  }
  if (matchOp === 'not_empty') {
    return !(raw == null || String(raw).trim() === '')
  }
  const left = stringifyCell(raw).toLowerCase()
  const right = stringifyCell(expected).toLowerCase()
  if (matchOp === 'eq') return left === right
  if (matchOp === 'neq') return left !== right
  if (matchOp === 'contains') return left.includes(right)
  if (matchOp === 'not_contains') return !left.includes(right)
  return false
}

/**
 * Map discrete values via mapping object.
 * @param {Record<string, unknown>} row
 * @param {Record<string, unknown>} action
 */
function applyMap(row, action) {
  const field = String(action.field || '').trim()
  if (!field) return row
  const resolved = resolveRowField(row, field)
  if (!resolved) return row
  const target = String(action.targetField || '').trim() || field
  const mapping = normalizeMapping(action.mapping)
  const key = stringifyCell(resolved.value)
  const next = { ...row }
  if (Object.prototype.hasOwnProperty.call(mapping, key)) {
    next[target] = mapping[key]
    return next
  }
  // case-insensitive fallback lookup
  const lowerKey = key.toLowerCase()
  const found = Object.keys(mapping).find((k) => k.toLowerCase() === lowerKey)
  if (found != null) {
    next[target] = mapping[found]
    return next
  }
  const fallback = MAP_FALLBACKS.includes(action.fallback) ? action.fallback : 'keep'
  if (fallback === 'null') next[target] = null
  else if (fallback === 'value') next[target] = action.fallbackValue ?? ''
  else if (target !== field) next[target] = row[field]
  return next
}

/**
 * @param {unknown} raw
 * @returns {Record<string, string>}
 */
function normalizeMapping(raw) {
  if (!raw) return {}
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    /** @type {Record<string, string>} */
    const out = {}
    Object.entries(raw).forEach(([k, v]) => {
      out[String(k)] = v == null ? '' : String(v)
    })
    return out
  }
  if (typeof raw === 'string') {
    /** @type {Record<string, string>} */
    const out = {}
    raw.split('\n').forEach((line) => {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) return
      const eq = trimmed.indexOf('=')
      const colon = trimmed.indexOf(':')
      let sep = -1
      if (eq >= 0 && (colon < 0 || eq < colon)) sep = eq
      else if (colon >= 0) sep = colon
      if (sep < 0) return
      const from = trimmed.slice(0, sep).trim()
      const to = trimmed.slice(sep + 1).trim()
      if (from) out[from] = to
    })
    return out
  }
  return {}
}

/**
 * Parse date-like value and format.
 * @param {Record<string, unknown>} row
 * @param {Record<string, unknown>} action
 */
function applyDateFormat(row, action) {
  const field = String(action.field || '').trim()
  if (!field || !(field in row)) return row
  const target = String(action.targetField || '').trim() || field
  const format = DATE_FORMATS.includes(action.format) ? action.format : 'iso'
  const parsed = parseDateValue(row[field])
  const next = { ...row }
  if (!parsed) {
    if (action.onError === 'keep') return row
    next[target] = null
    return next
  }
  next[target] = formatDateValue(parsed, format)
  return next
}

/**
 * @param {unknown} raw
 * @returns {Date | null}
 */
function parseDateValue(raw) {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const d = new Date(raw)
    return Number.isNaN(d.getTime()) ? null : d
  }
  const s = String(raw ?? '').trim()
  if (!s) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * @param {Date} date
 * @param {string} format
 */
function formatDateValue(date, format) {
  const yyyy = String(date.getUTCFullYear())
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(date.getUTCDate()).padStart(2, '0')
  const hh = String(date.getUTCHours()).padStart(2, '0')
  const mi = String(date.getUTCMinutes()).padStart(2, '0')
  const ss = String(date.getUTCSeconds()).padStart(2, '0')
  if (format === 'iso') return date.toISOString()
  if (format === 'date' || format === 'YYYY-MM-DD') return `${yyyy}-${mm}-${dd}`
  if (format === 'datetime') return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}Z`
  if (format === 'DD/MM/YYYY') return `${dd}/${mm}/${yyyy}`
  if (format === 'MM/DD/YYYY') return `${mm}/${dd}/${yyyy}`
  return date.toISOString()
}

/**
 * @param {unknown} value
 */
function stringifyCell(value) {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value)
  }
  catch {
    return String(value)
  }
}

/**
 * Validate transform node data for pipeline save/run.
 * @param {Record<string, unknown>} data
 * @param {string} nodeId
 * @returns {string | null} error message
 */
export function validateTransformConfig(data, nodeId) {
  const actions = Array.isArray(data?.actions) ? data.actions : []
  for (let i = 0; i < actions.length; i++) {
    const a = actions[i]
    const op = String(a?.op || '')
    if (!TRANSFORM_OPS.includes(op)) {
      return `Transform “${nodeId}” step ${i + 1} has unsupported op “${op}”`
    }
    if (op === 'trim') {
      if (!String(a.field || '').trim()) {
        return `Transform “${nodeId}” trim step ${i + 1} needs a field`
      }
      if (a.mode && !TRIM_MODES.includes(a.mode)) {
        return `Transform “${nodeId}” trim step ${i + 1} has invalid mode`
      }
    }
    if (op === 'case') {
      if (!String(a.field || '').trim()) {
        return `Transform “${nodeId}” case step ${i + 1} needs a field`
      }
      if (a.style && !CASE_STYLES.includes(a.style)) {
        return `Transform “${nodeId}” case step ${i + 1} has invalid style`
      }
    }
    if (op === 'join') {
      if (!Array.isArray(a.fields) || !a.fields.filter(Boolean).length) {
        return `Transform “${nodeId}” join step ${i + 1} needs fields`
      }
      if (!String(a.targetField || '').trim()) {
        return `Transform “${nodeId}” join step ${i + 1} needs a target field`
      }
    }
    if (op === 'split' || op === 'join_array') {
      if (!String(a.field || '').trim()) {
        return `Transform “${nodeId}” ${op} step ${i + 1} needs a field`
      }
      if (op === 'split' && !String(a.targetField || '').trim()) {
        return `Transform “${nodeId}” split step ${i + 1} needs a target field`
      }
    }
    if (op === 'regex') {
      if (!String(a.field || '').trim()) {
        return `Transform “${nodeId}” regex step ${i + 1} needs a field`
      }
      if (!String(a.pattern || '')) {
        return `Transform “${nodeId}” regex step ${i + 1} needs a pattern`
      }
      if (String(a.pattern).length > REGEX_PATTERN_MAX) {
        return `Transform “${nodeId}” regex pattern too long (max ${REGEX_PATTERN_MAX})`
      }
    }
    if (op === 'rename' || op === 'copy') {
      // Canonical: { field: source, targetField: dest }
      // Legacy migration shape: { field: dest, from: source }
      const hasCanonical = String(a.field || '').trim() && String(a.targetField || '').trim()
      const hasLegacyFrom = String(a.from || '').trim() && String(a.field || '').trim()
      if (!hasCanonical && !hasLegacyFrom) {
        return `Transform “${nodeId}” ${op} step ${i + 1} needs field and target`
      }
    }
    if (op === 'drop') {
      const fields = Array.isArray(a.fields) ? a.fields.filter(Boolean) : []
      if (!fields.length && !String(a.field || '').trim()) {
        return `Transform “${nodeId}” drop step ${i + 1} needs fields`
      }
    }
    if (op === 'keep') {
      const fields = Array.isArray(a.fields) ? a.fields.filter(Boolean) : []
      if (!fields.length && !String(a.field || '').trim()) {
        return `Transform “${nodeId}” keep step ${i + 1} needs fields`
      }
    }
    if (op === 'cast') {
      if (!String(a.field || '').trim()) {
        return `Transform “${nodeId}” cast step ${i + 1} needs a field`
      }
      if (a.to && !CAST_TYPES.includes(a.to)) {
        return `Transform “${nodeId}” cast step ${i + 1} has invalid type`
      }
    }
    if (op === 'default') {
      if (!String(a.field || '').trim()) {
        return `Transform “${nodeId}” default step ${i + 1} needs a field`
      }
    }
    if (op === 'template') {
      if (!String(a.targetField || '').trim()) {
        return `Transform “${nodeId}” template step ${i + 1} needs a target field`
      }
      if (!String(a.template || '').trim()) {
        return `Transform “${nodeId}” template step ${i + 1} needs a template`
      }
      if (String(a.template).length > TEMPLATE_MAX) {
        return `Transform “${nodeId}” template too long (max ${TEMPLATE_MAX})`
      }
    }
    if (op === 'conditional') {
      if (!String(a.field || '').trim() || !String(a.targetField || '').trim()) {
        return `Transform “${nodeId}” conditional step ${i + 1} needs field and target`
      }
      if (a.matchOp && !CONDITIONAL_OPS.includes(a.matchOp)) {
        return `Transform “${nodeId}” conditional step ${i + 1} has invalid match op`
      }
    }
    if (op === 'map') {
      if (!String(a.field || '').trim()) {
        return `Transform “${nodeId}” map step ${i + 1} needs a field`
      }
      if (a.fallback && !MAP_FALLBACKS.includes(a.fallback)) {
        return `Transform “${nodeId}” map step ${i + 1} has invalid fallback`
      }
    }
    if (op === 'date_format') {
      if (!String(a.field || '').trim()) {
        return `Transform “${nodeId}” date_format step ${i + 1} needs a field`
      }
      if (a.format && !DATE_FORMATS.includes(a.format)) {
        return `Transform “${nodeId}” date_format step ${i + 1} has invalid format`
      }
    }
  }
  return null
}
