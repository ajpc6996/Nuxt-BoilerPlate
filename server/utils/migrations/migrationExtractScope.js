import { cleanEntityKey } from '~~/shared/migration.js'
import { resolveRowField } from '~~/shared/pipelineTransform.js'

/** @type {string[]} */
const RT_TRANSACTION_TICKET_FIELDS = ['ObjectId', 'objectid', 'ObjectID', 'object_id', 'ticket_id']

/** @type {string[]} */
const RT_TICKET_ID_FIELDS = ['id', 'ID', 'Id']

/**
 * @param {Record<string, unknown>} row
 */
export function resolveTransactionTicketRef(row) {
  for (const field of RT_TRANSACTION_TICKET_FIELDS) {
    const resolved = resolveRowField(row, field)
    if (resolved && resolved.value !== undefined && resolved.value !== null && String(resolved.value).trim() !== '') {
      return Number(resolved.value)
    }
  }
  return null
}

/**
 * @param {Record<string, unknown>} row
 */
export function resolveTicketId(row) {
  for (const field of RT_TICKET_ID_FIELDS) {
    const resolved = resolveRowField(row, field)
    if (resolved && resolved.value !== undefined && resolved.value !== null && String(resolved.value).trim() !== '') {
      return Number(resolved.value)
    }
  }
  return null
}

/**
 * @param {Record<string, unknown>[]} rows
 * @param {Set<number>} ticketIds
 */
export function filterTransactionsToTicketIds(rows, ticketIds) {
  const allowed = ticketIds instanceof Set ? ticketIds : new Set(ticketIds)
  if (!allowed.size) return { rows: [], dropped: rows.length }

  const kept = []
  for (const row of rows || []) {
    const ticketId = resolveTransactionTicketRef(row)
    if (ticketId != null && Number.isFinite(ticketId) && allowed.has(ticketId)) {
      kept.push(row)
    }
  }
  return { rows: kept, dropped: Math.max(0, (rows?.length || 0) - kept.length) }
}

/**
 * Load RT ticket ids from the tickets extract ingest for a migration project.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {string} organizationId
 * @param {string} projectId
 */
export async function loadMigratedTicketIdsFromIngest(admin, organizationId, projectId) {
  const { data: stages, error } = await admin
    .from('migration_stages')
    .select('id, entity_key, data_source_id, stage_type')
    .eq('migration_project_id', projectId)

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  const ticketsExtract = (stages || []).find((stage) => {
    return stage.stage_type === 'extract' && cleanEntityKey(stage.entity_key) === 'tickets' && stage.data_source_id
  })
  if (!ticketsExtract?.data_source_id) return new Set()

  const { data: ticketSource, error: sourceError } = await admin
    .from('data_sources')
    .select('id, destination_table, connection_id, organization_id')
    .eq('id', ticketsExtract.data_source_id)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (sourceError || !ticketSource) return new Set()

  const { getIngestBackend } = await import('~~/server/utils/ingestBackend.js')
  const ingestBackend = await getIngestBackend(admin, organizationId)
  const rows = await ingestBackend.ingestReadRows({
    table: ticketSource.destination_table,
    organizationId,
    connectionId: ticketSource.connection_id,
    limit: 100000,
  })

  /** @type {Set<number>} */
  const ids = new Set()
  for (const row of Array.isArray(rows) ? rows : []) {
    const id = resolveTicketId(row)
    if (id != null && Number.isFinite(id)) ids.add(id)
  }
  return ids
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {{ organization_id?: string, migration_project_id?: string | null, migration_stage_id?: string | null }} dataSource
 * @param {Record<string, unknown>[]} rows
 */
export async function scopeMigrationExtractRows(admin, dataSource, rows) {
  const projectId = String(dataSource.migration_project_id || '').trim()
  const organizationId = String(dataSource.organization_id || '').trim()
  if (!projectId || !organizationId) return { rows, meta: {} }

  const { data: stage } = await admin
    .from('migration_stages')
    .select('entity_key, stage_type')
    .eq('id', dataSource.migration_stage_id || '')
    .maybeSingle()

  const entityKey = cleanEntityKey(stage?.entity_key)
  const stageType = String(stage?.stage_type || '').trim().toLowerCase()
  if (stageType !== 'extract') return { rows, meta: {} }
  if (entityKey !== 'articles' && entityKey !== 'transactions') return { rows, meta: {} }

  const ticketIds = await loadMigratedTicketIdsFromIngest(admin, organizationId, projectId)
  if (!ticketIds.size) {
    return {
      rows: [],
      meta: {
        scopedToTickets: true,
        ticketIdsInIngest: 0,
        droppedOutsideTicketScope: rows.length,
      },
    }
  }

  const { rows: scoped, dropped } = filterTransactionsToTicketIds(rows, ticketIds)
  return {
    rows: scoped,
    meta: {
      scopedToTickets: true,
      ticketIdsInIngest: ticketIds.size,
      droppedOutsideTicketScope: dropped,
    },
  }
}
