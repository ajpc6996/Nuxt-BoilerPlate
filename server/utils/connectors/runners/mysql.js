/**
 * MySQL inbound runner — SELECT only.
 * @param {{
 *   config: Record<string, unknown>,
 *   secrets?: Record<string, unknown>,
 *   mode?: string,
 * }} ctx
 */
export async function runMysql(ctx) {
  const config = ctx.config || {}
  const secrets = ctx.secrets || {}
  const host = String(config.host || '127.0.0.1').trim()
  const port = Number(config.port) || 3306
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

  let mysql
  try {
    mysql = await import('mysql2/promise')
  }
  catch {
    throw createError({
      statusCode: 503,
      statusMessage: 'MySQL driver (mysql2) is not installed. Install it from Administration → Connector drivers.',
    })
  }

  const connection = await mysql.createConnection({
    host,
    port,
    database,
    user: String(secrets.username || config.username || '').trim(),
    password: secrets.password != null ? String(secrets.password) : '',
    ssl: config.ssl ? {} : undefined,
  })

  try {
    const sql = customQuery || `SELECT * FROM ${sanitizeSqlIdent(table)} LIMIT ${maxRows}`
    const [rows] = await connection.query(sql)
    const list = Array.isArray(rows) ? rows : []
    return {
      rows: list.map((row) => ({ ...(row || {}) })),
      meta: { host, database, table: table || null, rowCount: list.length },
    }
  }
  finally {
    await connection.end()
  }
}

/**
 * @param {string} ident
 */
function sanitizeSqlIdent(ident) {
  const parts = String(ident || '').split('.').map((p) => p.trim()).filter(Boolean)
  if (!parts.length) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid table name' })
  }
  return parts.map((p) => {
    if (!/^[a-zA-Z0-9_]+$/.test(p)) {
      throw createError({ statusCode: 400, statusMessage: `Invalid table identifier: ${p}` })
    }
    return `\`${p}\``
  }).join('.')
}
