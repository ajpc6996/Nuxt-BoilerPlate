import { isOutbound, getMaxRows } from '~~/shared/runnerDirection.js'
import { insertRowsBatch, quoteIdent } from '../runnerSql.js'

/**
 * PostgreSQL — inbound SELECT and outbound batch INSERT.
 * @param {{
 *   config: Record<string, unknown>,
 *   secrets?: Record<string, unknown>,
 *   mode?: string,
 *   direction?: string,
 *   rows?: Record<string, unknown>[],
 * }} ctx
 */
export async function runPostgres(ctx) {
  if (isOutbound(ctx)) return exportPostgres(ctx)
  return importPostgres(ctx)
}

/**
 * @param {import('./postgres.js').runPostgres extends (ctx: infer C) => unknown ? C : never} ctx
 */
async function importPostgres(ctx) {
  const config = ctx.config || {}
  const secrets = ctx.secrets || {}
  const host = String(config.host || '127.0.0.1').trim()
  const port = Number(config.port) || 5432
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
    const sql = customQuery || `SELECT * FROM ${quoteIdent(table, 'postgres')} LIMIT ${maxRows}`
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
 * @param {import('./postgres.js').runPostgres extends (ctx: infer C) => unknown ? C : never} ctx
 */
async function exportPostgres(ctx) {
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

  let pg
  try {
    pg = await import('pg')
  }
  catch {
    throw createError({ statusCode: 503, statusMessage: 'PostgreSQL driver (pg) is not installed.' })
  }

  const client = new pg.Client({
    host: String(config.host || '127.0.0.1').trim(),
    port: Number(config.port) || 5432,
    database: String(config.database || '').trim(),
    user: String(secrets.username || config.username || '').trim(),
    password: secrets.password != null ? String(secrets.password) : '',
    ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
  })

  await client.connect()
  try {
    const onConflict = String(config.onConflict || '').toLowerCase() === 'skip' ? 'skip' : 'error'
    const written = await insertRowsBatch(
      table,
      rows,
      'postgres',
      (sql, params) => client.query(sql, params),
      { onConflict },
    )
    return {
      rows: [],
      rowsWritten: written,
      meta: { table, rowCount: written, onConflict },
    }
  }
  finally {
    await client.end()
  }
}
