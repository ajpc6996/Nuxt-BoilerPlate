import { isOutbound, getMaxRows } from '~~/shared/runnerDirection.js'
import { insertRowsBatch, quoteIdent } from '../runnerSql.js'

/**
 * MySQL / MariaDB — inbound SELECT and outbound batch INSERT.
 * @param {{
 *   config: Record<string, unknown>,
 *   secrets?: Record<string, unknown>,
 *   mode?: string,
 *   direction?: string,
 *   rows?: Record<string, unknown>[],
 * }} ctx
 */
export async function runMysql(ctx) {
  if (isOutbound(ctx)) return exportMysql(ctx)
  return importMysql(ctx)
}

/**
 * @param {import('./mysql.js').runMysql extends (ctx: infer C) => unknown ? C : never} ctx
 */
async function importMysql(ctx) {
  const config = ctx.config || {}
  const secrets = ctx.secrets || {}
  const host = String(config.host || '127.0.0.1').trim()
  const port = Number(config.port) || 3306
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
    const sql = customQuery || `SELECT * FROM ${quoteIdent(table, 'mysql')} LIMIT ${maxRows}`
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
 * @param {import('./mysql.js').runMysql extends (ctx: infer C) => unknown ? C : never} ctx
 */
async function exportMysql(ctx) {
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

  let mysql
  try {
    mysql = await import('mysql2/promise')
  }
  catch {
    throw createError({
      statusCode: 503,
      statusMessage: 'MySQL driver (mysql2) is not installed.',
    })
  }

  const connection = await mysql.createConnection({
    host: String(config.host || '127.0.0.1').trim(),
    port: Number(config.port) || 3306,
    database: String(config.database || '').trim(),
    user: String(secrets.username || config.username || '').trim(),
    password: secrets.password != null ? String(secrets.password) : '',
    ssl: config.ssl ? {} : undefined,
  })

  try {
    const written = await insertRowsBatch(table, rows, 'mysql', (sql, params) => connection.query(sql, params))
    return { rows: [], rowsWritten: written, meta: { table, rowCount: written } }
  }
  finally {
    await connection.end()
  }
}
