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
 * Delete existing destination rows (and optional dependents) before re-inserting migration ids.
 *
 * @param {import('pg').Client} client
 * @param {string} table
 * @param {Record<string, unknown>[]} rows
 * @param {Record<string, unknown>} config
 * @param {'postgres'|'mysql'|'mssql'|'oracle'} dialect
 */
async function applyPreDelete(client, table, rows, config, dialect) {
  const field = String(config.preDeleteByField || '').trim()
  if (!field || dialect !== 'postgres') return

  const values = [...new Set(
    rows
      .map((row) => row?.[field])
      .filter((value) => value !== undefined && value !== null && String(value).trim() !== ''),
  )]
  if (!values.length) return

  const cascades = Array.isArray(config.preDeleteCascade) ? config.preDeleteCascade : []
  for (const cascade of cascades) {
    const cascadeTable = String(cascade?.table || '').trim()
    const matchField = String(cascade?.matchField || field).trim()
    if (!cascadeTable || !matchField) continue
    await client.query(
      `DELETE FROM ${quoteIdent(cascadeTable, dialect)} WHERE ${quoteIdent(matchField, dialect)} = ANY($1)`,
      [values],
    )
  }

  await client.query(
    `DELETE FROM ${quoteIdent(table, dialect)} WHERE ${quoteIdent(field, dialect)} = ANY($1)`,
    [values],
  )
}

/**
 * @param {Record<string, unknown>[]} rows
 * @param {string[]} required
 * @param {string} table
 */
function assertRequiredExportFields(rows, required, table) {
  const fields = Array.isArray(required) ? required.filter(Boolean) : []
  if (!fields.length || !rows.length) return

  const missingRows = rows.filter((row) => fields.some((field) => {
    const value = row?.[field]
    return value === undefined || value === null || String(value).trim() === ''
  }))

  if (!missingRows.length) return

  const sample = missingRows.slice(0, 3).map((row, idx) => {
    const gaps = fields.filter((field) => {
      const value = row?.[field]
      return value === undefined || value === null || String(value).trim() === ''
    })
    return `#${idx + 1} missing ${gaps.join(', ')}`
  }).join('; ')

  throw createError({
    statusCode: 400,
    statusMessage: `Export to ${table} is missing required column(s): ${fields.join(', ')} (${sample}). Rematerialize flows and re-run the upstream stage.`,
  })
}

function normalizePgId(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null
  const num = Number(value)
  if (Number.isFinite(num)) return String(num)
  return String(value).trim()
}

/**
 * @param {Record<string, unknown>[]} rows
 * @param {string} field
 */
function collectRowIds(rows, field) {
  return [...new Set(
    rows
      .map((row) => normalizePgId(row?.[field]))
      .filter(Boolean),
  )]
}

/**
 * @param {import('pg').Client} client
 * @param {string} table
 * @param {string[]} ids
 */
async function loadExistingPgIds(client, table, ids) {
  const list = ids.filter(Boolean)
  if (!list.length) return new Set()

  const numericIds = list.map((id) => Number(id)).filter((id) => Number.isFinite(id))
  const result = await client.query(
    `SELECT id FROM ${quoteIdent(table, 'postgres')} WHERE id = ANY($1::bigint[])`,
    [numericIds],
  )
  return new Set((result.rows || []).map((row) => normalizePgId(row.id)).filter(Boolean))
}

/**
 * @param {import('pg').Client} client
 * @param {string} sql
 */
async function resolveFallbackUserId(client, sql) {
  const query = String(sql || '').trim()
  if (!query) return null
  const result = await client.query(query)
  return normalizePgId(result.rows?.[0]?.id)
}

/**
 * @param {Record<string, unknown>[]} rows
 * @param {string[]} userFields
 * @param {string | null} fallbackUserId
 */
function patchMissingUserReferences(rows, userFields, fallbackUserId) {
  if (!fallbackUserId) return rows
  const fields = Array.isArray(userFields) && userFields.length
    ? userFields
    : ['created_by_id', 'updated_by_id']
  return rows.map((row) => {
    const next = { ...row }
    for (const field of fields) {
      if (field === 'origin_by_id') continue
      const current = normalizePgId(next[field])
      if (!current) next[field] = Number(fallbackUserId)
    }
    return next
  })
}

/**
 * Generic pack-driven FK partition for outbound Postgres exports.
 * @param {import('pg').Client} client
 * @param {Record<string, unknown>[]} rows
 * @param {Record<string, unknown>} fkValidation
 * @param {{ patchMissingUserRefs?: boolean }} [opts]
 */
async function partitionRowsByForeignKeys(client, rows, fkValidation, opts = {}) {
  let working = Array.isArray(rows) ? [...rows] : []
  const parentLookups = Array.isArray(fkValidation?.parentLookups) ? fkValidation.parentLookups : []
  const userRefFields = Array.isArray(fkValidation?.userRefFields) ? fkValidation.userRefFields : []

  if (!working.length || !parentLookups.length) {
    return {
      valid: working,
      rejected: [],
      missingByReason: {},
      fallbackUserId: null,
    }
  }

  let fallbackUserId = null
  if (opts.patchMissingUserRefs && fkValidation.fallbackUserSql) {
    fallbackUserId = await resolveFallbackUserId(client, fkValidation.fallbackUserSql)
    working = patchMissingUserReferences(working, userRefFields, fallbackUserId)
  }

  /** @type {Record<string, Set<string>>} */
  const existingByTable = {}
  for (const lookup of parentLookups) {
    const table = String(lookup.parentTable || '').trim()
    if (!table || existingByTable[table]) continue
    const ids = collectRowIds(working, lookup.rowField)
    existingByTable[table] = await loadExistingPgIds(client, table, ids)
  }

  if (userRefFields.length) {
    const userIds = userRefFields.flatMap((field) => collectRowIds(working, field))
    existingByTable.users = await loadExistingPgIds(client, 'users', userIds)
  }

  /** @type {Record<string, unknown>[]} */
  const valid = []
  /** @type {Array<{ reasons: string[], row: Record<string, unknown> }>} */
  const rejected = []
  /** @type {Record<string, Set<string>>} */
  const missingByReason = {}

  for (const row of working) {
    /** @type {string[]} */
    const reasons = []

    for (const lookup of parentLookups) {
      const reason = String(lookup.reason || lookup.rowField || 'fk')
      const value = normalizePgId(row[lookup.rowField])
      const parentSet = existingByTable[lookup.parentTable] || new Set()
      if (!value || !parentSet.has(value)) {
        reasons.push(reason)
        if (value) {
          if (!missingByReason[reason]) missingByReason[reason] = new Set()
          missingByReason[reason].add(value)
        }
      }
    }

    for (const field of userRefFields) {
      const value = normalizePgId(row[field])
      const optional = field === 'origin_by_id'
      if (optional) {
        if (value && !(existingByTable.users || new Set()).has(value)) {
          reasons.push(field)
          if (!missingByReason[field]) missingByReason[field] = new Set()
          missingByReason[field].add(value)
        }
        continue
      }
      if (!value || !(existingByTable.users || new Set()).has(value)) {
        reasons.push(field)
        if (value) {
          if (!missingByReason[field]) missingByReason[field] = new Set()
          missingByReason[field].add(value)
        }
      }
    }

    if (reasons.length) rejected.push({ reasons, row })
    else valid.push(row)
  }

  /** @type {Record<string, string[]>} */
  const missingLists = {}
  for (const [reason, set] of Object.entries(missingByReason)) {
    missingLists[reason] = [...set]
  }

  return {
    valid,
    rejected,
    missingByReason: missingLists,
    fallbackUserId,
  }
}

/**
 * @param {unknown} err
 * @param {Record<string, string>} [hints]
 */
function throwFriendlyPostgresForeignKeyError(err, hints = {}) {
  const msg = String(err?.message || err?.statusMessage || err || '')
  if (!/foreign key constraint/i.test(msg)) {
    throw err
  }

  const keyMatch = msg.match(/Key \(([^)]+)\)=\(([^)]+)\)/i)
  const column = keyMatch?.[1] || 'unknown column'
  const value = keyMatch?.[2] || '?'

  throw createError({
    statusCode: 400,
    statusMessage: `Foreign key failed on ${column}=${value}. ${hints[column] || 'Check parent rows exist before exporting.'}`,
  })
}

/**
 * @param {{
 *   rejected: Array<{ reasons: string[] }>,
 *   missingByReason: Record<string, string[]>,
 * }} summary
 * @param {number} total
 * @param {string} [template]
 */
function throwFkPartitionError(summary, total, template) {
  const parts = []
  for (const [reason, ids] of Object.entries(summary.missingByReason || {})) {
    if (!ids?.length) continue
    parts.push(`${reason} (e.g. ${ids.slice(0, 6).join(', ')})`)
  }
  const detail = parts.length ? parts.join('; ') : 'foreign keys'
  const message = String(template || 'FK: none of {total} row(s) are exportable ({detail}).')
    .replace('{total}', String(total))
    .replace('{detail}', detail)
  throw createError({
    statusCode: 400,
    statusMessage: message,
  })
}

/**
 * @param {import('pg').Client} client
 * @param {string} table
 * @param {string} column
 */
async function syncPostgresSerialSequence(client, table, column) {
  const col = String(column || 'id').trim()
  if (!col) return
  const quotedTable = quoteIdent(table, 'postgres')
  const quotedCol = quoteIdent(col, 'postgres')
  await client.query(
    `SELECT setval(
      pg_get_serial_sequence($1, $2),
      COALESCE((SELECT MAX(${quotedCol}) FROM ${quotedTable}), 1),
      true
    )`,
    [table.includes('.') ? table : `public.${table}`, col],
  )
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
    assertRequiredExportFields(rows, Array.isArray(config.requireFields) ? config.requireFields : [], table)

    let rowsToInsert = rows
    let skippedInvalidArticleRows = 0
    /** @type {Record<string, unknown>} */
    let articleFkMeta = {}
    const fkValidation = config.exportFkValidation && typeof config.exportFkValidation === 'object'
      ? config.exportFkValidation
      : null
    const parentMode = String(
      config.missingTicketParents
      || config.validateArticleForeignKeys
      || (fkValidation ? 'filter' : ''),
    ).trim().toLowerCase()
    const filterInvalid = parentMode === 'filter'
    const checkFks = Boolean(fkValidation)
      && (filterInvalid || parentMode === 'error' || config.validateTicketParents === true)

    if (checkFks && fkValidation) {
      const summary = await partitionRowsByForeignKeys(client, rows, fkValidation, {
        patchMissingUserRefs: config.patchMissingUserRefs !== false,
      })
      articleFkMeta = {
        fallbackUserId: summary.fallbackUserId,
        missingByReason: Object.fromEntries(
          Object.entries(summary.missingByReason || {}).map(([k, v]) => [k, (v || []).slice(0, 20)]),
        ),
      }

      if (filterInvalid) {
        skippedInvalidArticleRows = summary.rejected.length
        rowsToInsert = summary.valid
        if (!rowsToInsert.length && rows.length) {
          throwFkPartitionError(summary, rows.length, fkValidation.emptyResultMessage)
        }
      }
      else if (summary.rejected.length) {
        const sample = summary.rejected.slice(0, 3).map((item, idx) => `#${idx + 1} ${item.reasons.join(', ')}`).join('; ')
        throw createError({
          statusCode: 400,
          statusMessage: `FK preflight failed for ${summary.rejected.length}/${rows.length} row(s) (${sample}). Migrate parent entities first.`,
        })
      }
    }

    if (!rowsToInsert.length) {
      return {
        rows: [],
        rowsWritten: 0,
        meta: {
          table,
          rowCount: 0,
          skippedInvalidArticleRows,
          ...articleFkMeta,
        },
      }
    }

    await applyPreDelete(client, table, rowsToInsert, config, 'postgres')

    const onConflict = String(config.onConflict || '').toLowerCase() === 'skip' ? 'skip' : 'error'
    let written = 0
    try {
      written = await insertRowsBatch(
        table,
        rowsToInsert,
        'postgres',
        (sql, params) => client.query(sql, params),
        { onConflict },
      )
    }
    catch (err) {
      throwFriendlyPostgresForeignKeyError(err, fkValidation?.fkErrorHints || {})
    }

    const syncCol = String(config.syncSerialSequence || '').trim()
    if (syncCol && written > 0) {
      await syncPostgresSerialSequence(client, table, syncCol)
    }

    return {
      rows: [],
      rowsWritten: written,
      meta: {
        table,
        rowCount: written,
        onConflict,
        skippedInvalidArticleRows,
        ...articleFkMeta,
      },
    }
  }
  finally {
    await client.end()
  }
}
