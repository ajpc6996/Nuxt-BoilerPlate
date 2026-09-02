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

/**
 * @param {string} table
 */
function isTicketArticlesTable(table) {
  const base = String(table || '').trim().split('.').pop()?.toLowerCase() || ''
  return base === 'ticket_articles'
}

/**
 * @param {unknown} value
 */
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
 */
async function resolveFallbackZammadUserId(client) {
  const result = await client.query(
    'SELECT id FROM users WHERE active = true ORDER BY id ASC LIMIT 1',
  )
  return normalizePgId(result.rows?.[0]?.id)
}

/**
 * @param {Record<string, unknown>[]} rows
 * @param {string | null} fallbackUserId
 */
function patchMissingUserReferences(rows, fallbackUserId) {
  if (!fallbackUserId) return rows
  return rows.map((row) => {
    const next = { ...row }
    for (const field of ['created_by_id', 'updated_by_id']) {
      const current = normalizePgId(next[field])
      if (!current) next[field] = Number(fallbackUserId)
    }
    return next
  })
}

/**
 * @param {import('pg').Client} client
 * @param {Record<string, unknown>[]} rows
 * @param {{ patchMissingUserRefs?: boolean }} [opts]
 */
async function partitionTicketArticleRows(client, rows, opts = {}) {
  let working = Array.isArray(rows) ? [...rows] : []
  if (!working.length) {
    return {
      valid: [],
      rejected: [],
      missingTicketIds: [],
      missingTypeIds: [],
      missingSenderIds: [],
      missingUserIds: [],
      fallbackUserId: null,
    }
  }

  let fallbackUserId = null
  if (opts.patchMissingUserRefs) {
    fallbackUserId = await resolveFallbackZammadUserId(client)
    working = patchMissingUserReferences(working, fallbackUserId)
  }

  const ticketIds = collectRowIds(working, 'ticket_id')
  const typeIds = collectRowIds(working, 'type_id')
  const senderIds = collectRowIds(working, 'sender_id')
  const userIds = [
    ...collectRowIds(working, 'created_by_id'),
    ...collectRowIds(working, 'updated_by_id'),
    ...collectRowIds(working, 'origin_by_id'),
  ]

  const [tickets, types, senders, users] = await Promise.all([
    loadExistingPgIds(client, 'tickets', ticketIds),
    loadExistingPgIds(client, 'ticket_article_types', typeIds),
    loadExistingPgIds(client, 'ticket_article_senders', senderIds),
    loadExistingPgIds(client, 'users', userIds),
  ])

  /** @type {Record<string, unknown>[]} */
  const valid = []
  /** @type {Array<{ reasons: string[], row: Record<string, unknown> }>} */
  const rejected = []
  /** @type {Set<string>} */
  const missingTicketIds = new Set()
  /** @type {Set<string>} */
  const missingTypeIds = new Set()
  /** @type {Set<string>} */
  const missingSenderIds = new Set()
  /** @type {Set<string>} */
  const missingUserIds = new Set()

  for (const row of working) {
    /** @type {string[]} */
    const reasons = []
    const ticketId = normalizePgId(row.ticket_id)
    const typeId = normalizePgId(row.type_id)
    const senderId = normalizePgId(row.sender_id)
    const createdById = normalizePgId(row.created_by_id)
    const updatedById = normalizePgId(row.updated_by_id)
    const originById = normalizePgId(row.origin_by_id)

    if (!ticketId || !tickets.has(ticketId)) {
      reasons.push('ticket_id')
      if (ticketId) missingTicketIds.add(ticketId)
    }
    if (!typeId || !types.has(typeId)) {
      reasons.push('type_id')
      if (typeId) missingTypeIds.add(typeId)
    }
    if (!senderId || !senders.has(senderId)) {
      reasons.push('sender_id')
      if (senderId) missingSenderIds.add(senderId)
    }
    if (!createdById || !users.has(createdById)) {
      reasons.push('created_by_id')
      if (createdById) missingUserIds.add(createdById)
    }
    if (!updatedById || !users.has(updatedById)) {
      reasons.push('updated_by_id')
      if (updatedById) missingUserIds.add(updatedById)
    }
    if (originById && !users.has(originById)) {
      reasons.push('origin_by_id')
      missingUserIds.add(originById)
    }

    if (reasons.length) rejected.push({ reasons, row })
    else valid.push(row)
  }

  return {
    valid,
    rejected,
    missingTicketIds: [...missingTicketIds],
    missingTypeIds: [...missingTypeIds],
    missingSenderIds: [...missingSenderIds],
    missingUserIds: [...missingUserIds],
    fallbackUserId,
  }
}

/**
 * @param {unknown} err
 */
function throwFriendlyPostgresForeignKeyError(err) {
  const msg = String(err?.message || err?.statusMessage || err || '')
  if (!/foreign key constraint/i.test(msg)) {
    throw err
  }

  const keyMatch = msg.match(/Key \(([^)]+)\)=\(([^)]+)\)/i)
  const column = keyMatch?.[1] || 'unknown column'
  const value = keyMatch?.[2] || '?'

  /** @type {Record<string, string>} */
  const hints = {
    ticket_id: 'Run Transform Tickets first so RT ids are preserved as tickets.id.',
    type_id: 'Map RT Transactions.Type to valid Zammad ticket_article_types ids (default note=10). Materialize flows and retry.',
    sender_id: 'Map RT Transactions.Type to valid Zammad ticket_article_senders ids (default Agent=2). Materialize flows and retry.',
    created_by_id: 'Run Transform Users first, or ensure Zammad has an active user for created_by_id.',
    updated_by_id: 'Run Transform Users first, or ensure Zammad has an active user for updated_by_id.',
    origin_by_id: 'origin_by_id must reference an existing Zammad user.',
  }

  throw createError({
    statusCode: 400,
    statusMessage: `Article FK failed on ${column}=${value}. ${hints[column] || 'Check parent rows exist in Zammad before exporting articles.'}`,
  })
}

/**
 * @param {{
 *   rejected: Array<{ reasons: string[] }>,
 *   missingTicketIds: string[],
 *   missingTypeIds: string[],
 *   missingSenderIds: string[],
 *   missingUserIds: string[],
 * }} summary
 * @param {number} total
 */
function throwTicketArticlePartitionError(summary, total) {
  const parts = []
  if (summary.missingTicketIds.length) {
    parts.push(`ticket_id (e.g. ${summary.missingTicketIds.slice(0, 6).join(', ')})`)
  }
  if (summary.missingTypeIds.length) {
    parts.push(`type_id (e.g. ${summary.missingTypeIds.slice(0, 6).join(', ')})`)
  }
  if (summary.missingSenderIds.length) {
    parts.push(`sender_id (e.g. ${summary.missingSenderIds.slice(0, 6).join(', ')})`)
  }
  if (summary.missingUserIds.length) {
    parts.push(`user refs (e.g. ${summary.missingUserIds.slice(0, 6).join(', ')})`)
  }
  const detail = parts.length ? parts.join('; ') : 'foreign keys'
  throw createError({
    statusCode: 400,
    statusMessage: `Article FK: none of ${total} row(s) are exportable (${detail}). Run Users → Tickets before Articles.`,
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
    const parentMode = String(config.missingTicketParents || config.validateArticleForeignKeys || '').trim().toLowerCase()
    const isArticles = isTicketArticlesTable(table)
    const filterInvalid = parentMode === 'filter'
      || (isArticles && parentMode !== 'error' && config.validateTicketParents !== true)
    const checkArticleFks = isArticles && (filterInvalid || parentMode === 'error' || config.validateTicketParents === true)

    if (checkArticleFks) {
      const summary = await partitionTicketArticleRows(client, rows, {
        patchMissingUserRefs: config.patchMissingUserRefs !== false,
      })
      articleFkMeta = {
        fallbackUserId: summary.fallbackUserId,
        missingTicketIds: summary.missingTicketIds.slice(0, 20),
        missingTypeIds: summary.missingTypeIds.slice(0, 20),
        missingSenderIds: summary.missingSenderIds.slice(0, 20),
        missingUserIds: summary.missingUserIds.slice(0, 20),
      }

      if (filterInvalid) {
        skippedInvalidArticleRows = summary.rejected.length
        rowsToInsert = summary.valid
        if (!rowsToInsert.length && rows.length) {
          throwTicketArticlePartitionError(summary, rows.length)
        }
      }
      else if (summary.rejected.length) {
        const sample = summary.rejected.slice(0, 3).map((item, idx) => `#${idx + 1} ${item.reasons.join(', ')}`).join('; ')
        throw createError({
          statusCode: 400,
          statusMessage: `Article FK preflight failed for ${summary.rejected.length}/${rows.length} row(s) (${sample}). Run Users → Tickets → Articles.`,
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
      throwFriendlyPostgresForeignKeyError(err)
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
