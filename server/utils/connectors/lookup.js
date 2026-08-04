/**
 * Sanitize ingest table/column identifiers.
 * @param {string} name
 * @param {string} label
 */
export function assertIngestIdent(name, label = 'identifier') {
  const t = String(name || '').trim().toLowerCase()
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(t)) {
    throw createError({
      statusCode: 400,
      statusMessage: `Invalid ${label}: use a-z, 0-9, underscore, starting with a letter`,
    })
  }
  return t
}

/**
 * Extract {var} names from a path template.
 * @param {string} template
 * @returns {string[]}
 */
export function extractPathVariables(template) {
  const out = []
  const re = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g
  let m
  while ((m = re.exec(String(template || ''))) !== null) {
    if (!out.includes(m[1])) out.push(m[1])
  }
  return out
}

/**
 * @param {string} template
 * @param {Record<string, string>} values
 */
export function applyPathTemplate(template, values) {
  return String(template || '').replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (_, key) => {
    const v = values[key]
    if (v == null || String(v).trim() === '') {
      throw createError({
        statusCode: 400,
        statusMessage: `Missing value for path variable {${key}}`,
      })
    }
    return encodeURIComponent(String(v))
  })
}

/**
 * Load distinct lookup tuples for URL expansion.
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {{
 *   table: string,
 *   bindings: Array<{ variable: string, column: string }>,
 *   organizationId: string,
 *   limit: number,
 * }} opts
 * @returns {Promise<Record<string, string>[]>}
 */
export async function fetchLookupTuples(admin, opts) {
  const table = assertIngestIdent(opts.table, 'lookup table')
  const bindings = Array.isArray(opts.bindings) ? opts.bindings : []
  if (!bindings.length) {
    throw createError({
      statusCode: 400,
      statusMessage: 'lookupBindings are required when lookup is enabled',
    })
  }

  const columns = bindings.map((b) => assertIngestIdent(b.column, 'lookup column'))
  const { data, error } = await admin.rpc('ingest_lookup_distinct', {
    p_table: table,
    p_columns: columns,
    p_organization_id: opts.organizationId,
    p_limit: opts.limit,
  })

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  const rows = Array.isArray(data) ? data : []
  return rows.map((row) => {
    /** @type {Record<string, string>} */
    const values = {}
    bindings.forEach((b) => {
      const col = assertIngestIdent(b.column, 'lookup column')
      const raw = row?.[col]
      values[b.variable] = raw == null ? '' : String(raw)
    })
    return values
  }).filter((v) => Object.values(v).every((x) => x !== ''))
}
