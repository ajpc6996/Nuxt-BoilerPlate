/**
 * PostgreSQL inbound runner — SELECT only.
 * @param {{
 *   config: Record<string, unknown>,
 *   secrets?: Record<string, unknown>,
 *   mode?: string,
 * }} ctx
 */
export async function runPostgres(ctx) {
  const config = ctx.config || {}
  const secrets = ctx.secrets || {}
  const host = String(config.host || '127.0.0.1').trim()
  const port = Number(config.port) || 5432
  const database = String(config.database || '').trim()
  const table = String(config.table || '').trim()
  const customQuery = String(config.query || '').trim()
  const maxRows = ctx.mode === 'test'
    ? Math.min(Number(config.maxRows) || 25, 50)
    : Math.min(Number(config.maxRows) || 5000, 100_000)

  if (!database) {
    throw createError({ statusCode: 400, statusMessage: 'database is required' })
  }
  if (!customQuery && !table) {
    throw createError({ statusCode: 400, statusMessage: 'table or query is required' })
  }
  if (customQuery && !/^select\s/i.test(customQuery)) {
    throw createError({ statusCode: 400, statusMessage: 'Custom query must be a SELECT statement' })
  }

  let pg
  try {
    pg = await import('pg')
  }
  catch {
    throw createError({
      statusCode: 503,
      statusMessage: 'PostgreSQL driver (pg) is not installed. Install it from Administration → Connector drivers.',
    })
  }

  const client = new pg.Client({
    host,
    port,
    database,
    user: String(secrets.username || config.username || '').trim(),
    password: secrets.password != null ? String(secrets.password) : '',
    ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
  })

  await client.connect()
  try {
    const sql = customQuery || `SELECT * FROM ${sanitizePgIdent(table)} LIMIT ${maxRows}`
    const result = await client.query(sql)
    const list = Array.isArray(result.rows) ? result.rows : []
    return {
      rows: list.map((row) => ({ ...(row || {}) })),
      meta: { host, database, table: table || null, rowCount: list.length },
    }
  }
  finally {
    await client.end()
  }
}

/**
 * @param {string} ident
 */
function sanitizePgIdent(ident) {
  const parts = String(ident || '').split('.').map((p) => p.trim()).filter(Boolean)
  if (!parts.length) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid table name' })
  }
  return parts.map((p) => {
    if (!/^[a-zA-Z0-9_]+$/.test(p)) {
      throw createError({ statusCode: 400, statusMessage: `Invalid table identifier: ${p}` })
    }
    return `"${p}"`
  }).join('.')
}
