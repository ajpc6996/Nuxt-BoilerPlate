import { cleanEntityKey } from '~~/shared/migration.js'
import { defaultMigrationTables } from '~~/shared/migrationPipeline.js'
import { loadMigrationProject, loadMigrationStages } from '~~/server/utils/migrations.js'
import { getIngestBackend } from '~~/server/utils/ingestBackend.js'

/**
 * @param {string} table
 */
export function isMigrationIngestTableName(table) {
  const name = String(table || '').trim().toLowerCase()
  return name.startsWith('mig_raw_') || name.startsWith('mig_mapped_')
}

/**
 * Collect ingest table names for a migration project (materialized flows + planned stage names).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {string} projectId
 * @param {string} organizationId
 */
export async function listMigrationIngestTables(admin, projectId, organizationId) {
  const project = await loadMigrationProject(admin, projectId, organizationId)
  const stages = await loadMigrationStages(admin, projectId)
  const projectKey = cleanEntityKey(project.name) || 'migration'
  /** @type {Set<string>} */
  const tables = new Set()

  const { data: sources, error } = await admin
    .from('data_sources')
    .select('destination_table')
    .eq('organization_id', organizationId)
    .eq('migration_project_id', projectId)

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  for (const row of sources || []) {
    const table = String(row?.destination_table || '').trim()
    if (table && isMigrationIngestTableName(table)) {
      tables.add(table)
    }
  }

  for (const stage of stages) {
    const entityKey = stage.entity_key || cleanEntityKey(stage.name)
    if (!entityKey) continue
    const names = defaultMigrationTables(projectKey, entityKey)
    tables.add(names.raw)
    if (stage.stage_type === 'transform' || stage.stage_type === 'export') {
      tables.add(names.mapped)
    }
  }

  return [...tables].sort()
}

/**
 * Delete all ingest rows for this migration project in the active org.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {string} projectId
 * @param {string} organizationId
 */
export async function clearMigrationIngestTables(admin, projectId, organizationId) {
  const tables = await listMigrationIngestTables(admin, projectId, organizationId)
  const ingestBackend = await getIngestBackend(admin, organizationId)

  /** @type {Array<{ table: string, rowsDeleted: number }>} */
  const cleared = []
  let totalDeleted = 0

  for (const table of tables) {
    const rowsDeleted = await ingestBackend.ingestClearOrgTable({
      table,
      organizationId,
    })
    cleared.push({ table, rowsDeleted })
    totalDeleted += rowsDeleted
  }

  return {
    tables: cleared,
    tableCount: tables.length,
    rowsDeleted: totalDeleted,
  }
}
