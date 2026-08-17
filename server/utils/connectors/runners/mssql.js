import { isOutbound, getMaxRows } from '~~/shared/runnerDirection.js'
import { quoteIdent } from '../runnerSql.js'

/**
 * Microsoft SQL Server — inbound SELECT and outbound batch INSERT.
 * @param {{
 *   config: Record<string, unknown>,
 *   secrets?: Record<string, unknown>,
 *   mode?: string,
 *   direction?: string,
 *   rows?: Record<string, unknown>[],
 * }} ctx
 */
export async function runMssql(ctx) {
  if (isOutbound(ctx)) return exportMssql(ctx)
  return importMssql(ctx)
}

/**
 * @param {import('./mssql.js').runMssql extends (ctx: infer C) => unknown ? C : never} ctx
 */
async function importMssql(ctx) {
  const config = ctx.config || {}
  const secrets = ctx.secrets || {}
  const host = String(config.host || '127.0.0.1').trim()
  const port = Number(config.port) || 1433
  const database = String(config.database || '').trim()
  const table = String(config.table || '').trim()
  const customQuery = String(config.query || '').trim()
  const maxRows = getMaxRows(ctx)

  if (!database) {
    throw createError({ statusCode: 400, statusMessage: 'database is required' })
  }
  if (!customQuery && !table) {
    throw createError({ statusCode: 400, statusMessage: 'table or query is required' })
  }
  if (customQuery && !/^select\s/i.test(customQuery)) {
    throw createError({ statusCode: 400, statusMessage: 'Custom query must be a SELECT statement' })
  }

  let sqlPkg
  try {
    sqlPkg = await import('mssql')
  }
  catch {
    throw createError({
      statusCode: 503,
      statusMessage: 'SQL Server driver (mssql) is not installed. Install it from Administration → Connector drivers.',
    })
  }

  const pool = await sqlPkg.default.connect({
    server: host,
    port,
    database,
    user: String(secrets.username || config.username || '').trim(),
    password: secrets.password != null ? String(secrets.password) : '',
    options: {
      encrypt: Boolean(config.encrypt ?? true),
      trustServerCertificate: Boolean(config.trustServerCertificate ?? false),
    },
  })

  try {
    const sql = customQuery || `SELECT TOP (${maxRows}) * FROM ${quoteIdent(table, 'mssql')}`
    const result = await pool.request().query(sql)
    const list = Array.isArray(result.recordset) ? result.recordset : []
    return {
      rows: list.map((row) => ({ ...(row || {}) })),
      meta: { host, database, table: table || null, rowCount: list.length },
    }
  }
  finally {
    await pool.close()
  }
}

/**
 * @param {import('./mssql.js').runMssql extends (ctx: infer C) => unknown ? C : never} ctx
 */
async function exportMssql(ctx) {
  const config = ctx.config || {}
  const secrets = ctx.secrets || {}
  const rows = Array.isArray(ctx.rows) ? ctx.rows : []
  const table = String(config.table || '').trim()
  if (!table) {
    throw createError({ statusCode: 400, statusMessage: 'table is required for outbound export' })
  }
  if (!rows.length) {
    return { rows: [], rowsWritten: 0, meta: { table, rowCount: 0 } }
  }

  let sqlPkg
  try {
    sqlPkg = await import('mssql')
  }
  catch {
    throw createError({ statusCode: 503, statusMessage: 'SQL Server driver (mssql) is not installed.' })
  }

  const pool = await sqlPkg.default.connect({
    server: String(config.host || '127.0.0.1').trim(),
    port: Number(config.port) || 1433,
    database: String(config.database || '').trim(),
    user: String(secrets.username || config.username || '').trim(),
    password: secrets.password != null ? String(secrets.password) : '',
    options: {
      encrypt: Boolean(config.encrypt ?? true),
      trustServerCertificate: Boolean(config.trustServerCertificate ?? false),
    },
  })

  try {
    let count = 0
    const quotedTable = quoteIdent(table, 'mssql')
    for (const row of rows) {
      const cols = Object.keys(row)
      const colList = cols.map((c) => quoteIdent(c, 'mssql')).join(', ')
      const placeholders = cols.map((_, i) => `@p${i}`).join(', ')
      const request = pool.request()
      cols.forEach((c, i) => request.input(`p${i}`, row[c]))
      await request.query(`INSERT INTO ${quotedTable} (${colList}) VALUES (${placeholders})`)
      count += 1
    }
    return { rows: [], rowsWritten: count, meta: { table, rowCount: count } }
  }
  finally {
    await pool.close()
  }
}
