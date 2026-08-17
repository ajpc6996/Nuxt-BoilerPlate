import { isOutbound, getMaxRows } from '~~/shared/runnerDirection.js'
import { quoteIdent } from '../runnerSql.js'

/**
 * Oracle Database — inbound SELECT and outbound INSERT.
 * @param {{
 *   config: Record<string, unknown>,
 *   secrets?: Record<string, unknown>,
 *   mode?: string,
 *   direction?: string,
 *   rows?: Record<string, unknown>[],
 * }} ctx
 */
export async function runOracle(ctx) {
  if (isOutbound(ctx)) return exportOracle(ctx)
  return importOracle(ctx)
}

/**
 * @param {import('./oracle.js').runOracle extends (ctx: infer C) => unknown ? C : never} ctx
 */
async function importOracle(ctx) {
  const config = ctx.config || {}
  const secrets = ctx.secrets || {}
  const connectString = String(config.connectString || config.host || '').trim()
  const table = String(config.table || '').trim()
  const customQuery = String(config.query || '').trim()
  const maxRows = getMaxRows(ctx)

  if (!connectString) {
    throw createError({ statusCode: 400, statusMessage: 'connectString (or host) is required' })
  }
  if (!customQuery && !table) {
    throw createError({ statusCode: 400, statusMessage: 'table or query is required' })
  }
  if (customQuery && !/^select\s/i.test(customQuery)) {
    throw createError({ statusCode: 400, statusMessage: 'Custom query must be a SELECT statement' })
  }

  let oracledb
  try {
    oracledb = await import('oracledb')
  }
  catch {
    throw createError({
      statusCode: 503,
      statusMessage: 'Oracle driver (oracledb) is not installed. Requires Oracle Instant Client on the server host.',
    })
  }

  const connection = await oracledb.getConnection({
    user: String(secrets.username || config.username || '').trim(),
    password: secrets.password != null ? String(secrets.password) : '',
    connectString,
  })

  try {
    const sql = customQuery || `SELECT * FROM ${quoteIdent(table, 'oracle')} FETCH FIRST ${maxRows} ROWS ONLY`
    const result = await connection.execute(sql, [], { outFormat: oracledb.OUT_FORMAT_OBJECT })
    const list = Array.isArray(result.rows) ? result.rows : []
    return {
      rows: list.map((row) => ({ ...(row || {}) })),
      meta: { connectString, table: table || null, rowCount: list.length },
    }
  }
  finally {
    await connection.close()
  }
}

/**
 * @param {import('./oracle.js').runOracle extends (ctx: infer C) => unknown ? C : never} ctx
 */
async function exportOracle(ctx) {
  const config = ctx.config || {}
  const secrets = ctx.secrets || {}
  const rows = Array.isArray(ctx.rows) ? ctx.rows : []
  const table = String(config.table || '').trim()
  const connectString = String(config.connectString || config.host || '').trim()

  if (!connectString || !table) {
    throw createError({ statusCode: 400, statusMessage: 'connectString and table are required' })
  }
  if (!rows.length) {
    return { rows: [], rowsWritten: 0, meta: { table, rowCount: 0 } }
  }

  let oracledb
  try {
    oracledb = await import('oracledb')
  }
  catch {
    throw createError({ statusCode: 503, statusMessage: 'Oracle driver (oracledb) is not installed.' })
  }

  const connection = await oracledb.getConnection({
    user: String(secrets.username || config.username || '').trim(),
    password: secrets.password != null ? String(secrets.password) : '',
    connectString,
  })

  try {
    let count = 0
    const quotedTable = quoteIdent(table, 'oracle')
    for (const row of rows) {
      const cols = Object.keys(row)
      const colList = cols.map((c) => quoteIdent(c, 'oracle')).join(', ')
      const binds = cols.map((_, i) => `:b${i}`).join(', ')
      const bindParams = {}
      cols.forEach((c, i) => {
        bindParams[`b${i}`] = row[c]
      })
      await connection.execute(
        `INSERT INTO ${quotedTable} (${colList}) VALUES (${binds})`,
        bindParams,
        { autoCommit: false },
      )
      count += 1
    }
    await connection.commit()
    return { rows: [], rowsWritten: count, meta: { table, rowCount: count } }
  }
  finally {
    await connection.close()
  }
}
