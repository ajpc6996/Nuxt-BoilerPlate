import { sanitizeDestinationTable } from '~~/server/utils/connectorCrypto.js'
import { validatePipeline } from '~~/server/utils/connectors/pipeline/validate.js'
import { cleanEntityKey } from '~~/shared/migration.js'
import {
  createExtractPipeline,
  createTransformDualSinkPipeline,
  defaultMigrationTables,
  fieldMappingsToTransformActions,
} from '~~/shared/migrationPipeline.js'
import { loadMigrationProject, loadMigrationStages } from '~~/server/utils/migrations.js'

/**
 * Create or update Data Flows for migration stages (hybrid ingest model).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {{
 *   projectId: string,
 *   organizationId: string,
 *   userId: string,
 *   isPlatformAdmin?: boolean,
 * }} opts
 */
export async function materializeMigrationStages(admin, opts) {
  const project = await loadMigrationProject(admin, opts.projectId, opts.organizationId)
  const stages = await loadMigrationStages(admin, opts.projectId)

  if (!project.source_connection_id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Set a source (inbound) connection before materializing',
    })
  }

  const projectKey = cleanEntityKey(project.name) || 'migration'
  /** @type {Record<string, string>} entityKey → extract data_source id */
  const extractByEntity = {}

  for (const stage of stages) {
    if (stage.stage_type !== 'extract' || !stage.entity_key) continue
    if (stage.data_source_id) {
      extractByEntity[stage.entity_key] = stage.data_source_id
    }
  }

  const results = []

  for (const stage of stages) {
    if (stage.stage_type === 'validate' || stage.stage_type === 'manual') {
      results.push({ stageId: stage.id, skipped: true, reason: stage.stage_type })
      continue
    }

    const entityKey = stage.entity_key || cleanEntityKey(stage.name)
    const tables = defaultMigrationTables(projectKey, entityKey)
    const cfg = stage.config && typeof stage.config === 'object' ? stage.config : {}
    const destTable = sanitizeDestinationTable(
      cfg.destinationTable
      || (stage.stage_type === 'transform' ? tables.mapped : tables.raw),
    )

    if (stage.stage_type === 'extract') {
      const pipeline = createExtractPipeline({ destinationTable: destTable })
      const validation = validatePipeline(pipeline)
      if (!validation.ok) {
        throw createError({ statusCode: 400, statusMessage: validation.error })
      }

      const flowName = `[Mig] ${project.name} · Extract ${entityKey || stage.name}`
      let dataSourceId = stage.data_source_id

      if (dataSourceId) {
        await admin
          .from('data_sources')
          .update({
            name: flowName,
            destination_table: destTable,
            pipeline,
            connection_id: project.source_connection_id,
            status: 'draft',
          })
          .eq('id', dataSourceId)
          .eq('organization_id', opts.organizationId)
      }
      else {
        const { data: created, error } = await admin
          .from('data_sources')
          .insert({
            organization_id: opts.organizationId,
            connection_id: project.source_connection_id,
            name: flowName,
            destination_table: destTable,
            pipeline,
            config: {},
            status: 'draft',
            created_by: opts.userId,
          })
          .select('id')
          .single()

        if (error || !created) {
          throw createError({ statusCode: 400, statusMessage: error?.message || 'Create data flow failed' })
        }
        dataSourceId = created.id
      }

      extractByEntity[entityKey] = dataSourceId

      await admin
        .from('migration_stages')
        .update({
          data_source_id: dataSourceId,
          status: 'ready',
          config: { ...cfg, destinationTable: destTable },
        })
        .eq('id', stage.id)

      results.push({ stageId: stage.id, dataSourceId, stageType: 'extract' })
      continue
    }

    if (stage.stage_type === 'transform' || stage.stage_type === 'export') {
      if (!project.destination_connection_id) {
        await admin
          .from('migration_stages')
          .update({ status: 'blocked' })
          .eq('id', stage.id)
        results.push({
          stageId: stage.id,
          blocked: true,
          reason: 'Destination connection required for transform/export',
        })
        continue
      }

      const extractSourceId = extractByEntity[entityKey]
      if (!extractSourceId) {
        await admin
          .from('migration_stages')
          .update({ status: 'blocked' })
          .eq('id', stage.id)
        results.push({
          stageId: stage.id,
          blocked: true,
          reason: `No extract stage for entity "${entityKey}"`,
        })
        continue
      }

      const mappings = Array.isArray(cfg.fieldMappings) ? cfg.fieldMappings : []
      const actions = fieldMappingsToTransformActions(mappings)
      const pipeline = createTransformDualSinkPipeline({
        extractSourceId,
        destinationTable: destTable,
        exportConnectionId: project.destination_connection_id,
        transformActions: actions,
      })

      const validation = validatePipeline(pipeline)
      if (!validation.ok) {
        throw createError({ statusCode: 400, statusMessage: validation.error })
      }

      const flowName = `[Mig] ${project.name} · Map ${entityKey || stage.name}`
      let dataSourceId = stage.data_source_id

      if (dataSourceId) {
        await admin
          .from('data_sources')
          .update({
            name: flowName,
            destination_table: destTable,
            pipeline,
            connection_id: project.source_connection_id,
            status: 'draft',
          })
          .eq('id', dataSourceId)
          .eq('organization_id', opts.organizationId)
      }
      else {
        const { data: created, error } = await admin
          .from('data_sources')
          .insert({
            organization_id: opts.organizationId,
            connection_id: project.source_connection_id,
            name: flowName,
            destination_table: destTable,
            pipeline,
            config: {},
            status: 'draft',
            created_by: opts.userId,
          })
          .select('id')
          .single()

        if (error || !created) {
          throw createError({ statusCode: 400, statusMessage: error?.message || 'Create data flow failed' })
        }
        dataSourceId = created.id
      }

      await admin
        .from('migration_stages')
        .update({
          data_source_id: dataSourceId,
          status: 'ready',
          config: { ...cfg, destinationTable: destTable },
        })
        .eq('id', stage.id)

      results.push({ stageId: stage.id, dataSourceId, stageType: stage.stage_type })
    }
  }

  await admin
    .from('migration_projects')
    .update({ status: 'ready' })
    .eq('id', opts.projectId)

  return { results, projectKey }
}
