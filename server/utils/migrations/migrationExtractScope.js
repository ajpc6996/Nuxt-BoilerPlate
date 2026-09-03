import { cleanEntityKey } from '~~/shared/migration.js'
import { resolveRowField } from '~~/shared/pipelineTransform.js'
import { getMigrationPackFromPlan } from '~~/shared/migrationPacks/index.js'

/**
 * @param {Record<string, unknown>} row
 * @param {string[]} fields
 */
function resolveFirstField(row, fields) {
  for (const field of fields || []) {
    const resolved = resolveRowField(row, field)
    if (resolved && resolved.value !== undefined && resolved.value !== null && String(resolved.value).trim() !== '') {
      return Number(resolved.value)
    }
  }
  return null
}

/**
 * @param {Record<string, unknown>} row
 * @param {string[]} childParentFields
 */
export function resolveTransactionTicketRef(row, childParentFields = []) {
  const fields = childParentFields.length
    ? childParentFields
    : ['ObjectId', 'objectid', 'ObjectID', 'object_id', 'ticket_id']
  return resolveFirstField(row, fields)
}

/**
 * @param {Record<string, unknown>} row
 * @param {string[]} parentIdFields
 */
export function resolveTicketId(row, parentIdFields = []) {
  const fields = parentIdFields.length ? parentIdFields : ['id', 'ID', 'Id']
  return resolveFirstField(row, fields)
}

/**
 * @param {Record<string, unknown>[]} rows
 * @param {Set<number>} ticketIds
 * @param {string[]} childParentFields
 */
export function filterTransactionsToTicketIds(rows, ticketIds, childParentFields = []) {
  const allowed = ticketIds instanceof Set ? ticketIds : new Set(ticketIds)
  if (!allowed.size) return { rows: [], dropped: rows.length }

  const kept = []
  for (const row of rows || []) {
    const ticketId = resolveTransactionTicketRef(row, childParentFields)
    if (ticketId != null && Number.isFinite(ticketId) && allowed.has(ticketId)) {
      kept.push(row)
    }
  }
  return { rows: kept, dropped: Math.max(0, (rows?.length || 0) - kept.length) }
}

/**
 * Load parent entity ids from extract ingest for pack-scoped child extracts.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {string} organizationId
 * @param {string} projectId
 * @param {{ parentEntityKey: string, parentIdFields: string[] }} scope
 */
export async function loadMigratedTicketIdsFromIngest(admin, organizationId, projectId, scope) {
  const parentEntityKey = cleanEntityKey(scope?.parentEntityKey || 'tickets')
  const parentIdFields = Array.isArray(scope?.parentIdFields) ? scope.parentIdFields : ['id', 'ID', 'Id']

  const { data: stages, error } = await admin
    .from('migration_stages')
    .select('id, entity_key, data_source_id, stage_type')
    .eq('migration_project_id', projectId)

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  const parentExtract = (stages || []).find((stage) => {
    return stage.stage_type === 'extract'
      && cleanEntityKey(stage.entity_key) === parentEntityKey
      && stage.data_source_id
  })
  if (!parentExtract?.data_source_id) return new Set()

  const { data: ticketSource, error: sourceError } = await admin
    .from('data_sources')
    .select('id, destination_table, connection_id, organization_id')
    .eq('id', parentExtract.data_source_id)
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
    const id = resolveTicketId(row, parentIdFields)
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

  const { data: project } = await admin
    .from('migration_projects')
    .select('plan_config')
    .eq('id', projectId)
    .maybeSingle()

  const pack = getMigrationPackFromPlan(project?.plan_config)
  const scope = pack?.extractScope
  if (!scope?.childEntityKeys?.length || !scope.parentEntityKey) {
    return { rows, meta: {} }
  }

  const { data: stage } = await admin
    .from('migration_stages')
    .select('entity_key, stage_type')
    .eq('id', dataSource.migration_stage_id || '')
    .maybeSingle()

  const entityKey = cleanEntityKey(stage?.entity_key)
  const stageType = String(stage?.stage_type || '').trim().toLowerCase()
  if (stageType !== 'extract') return { rows, meta: {} }
  if (!scope.childEntityKeys.map(cleanEntityKey).includes(entityKey)) {
    return { rows, meta: {} }
  }

  const ticketIds = await loadMigratedTicketIdsFromIngest(admin, organizationId, projectId, scope)
  if (!ticketIds.size) {
    return {
      rows: [],
      meta: {
        scopedToTickets: true,
        ticketIdsInIngest: 0,
        droppedOutsideTicketScope: rows.length,
        packId: pack.id,
      },
    }
  }

  const { rows: scoped, dropped } = filterTransactionsToTicketIds(
    rows,
    ticketIds,
    scope.childParentFields || [],
  )
  return {
    rows: scoped,
    meta: {
      scopedToTickets: true,
      ticketIdsInIngest: ticketIds.size,
      droppedOutsideTicketScope: dropped,
      packId: pack.id,
    },
  }
}
