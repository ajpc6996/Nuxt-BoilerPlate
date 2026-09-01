import { sanitizeDestinationTable } from '~~/server/utils/connectorCrypto.js'
import { validatePipeline } from '~~/server/utils/connectors/pipeline/validate.js'
import { cleanEntityKey, resolveRunnerTableConfig } from '~~/shared/migration.js'
import { enrichMappingsWithSystemDefaults, enrichMappingsWithLookupMaps } from '~~/shared/migrationSystems.js'
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

      // Per-entity table/query for the inbound runner (connection has host/db only).
      const sourceRunner = resolveRunnerTableConfig(
        cfg.sourceEntity || cfg.entityLabel,
        entityKey,
      )
      if (!sourceRunner.table && !sourceRunner.query) {
        throw createError({
          statusCode: 400,
          statusMessage: `Extract stage “${stage.name}” needs a source table (set sourceEntity on the stage, e.g. Users).`,
        })
      }
      const extractConfig = {
        ...sourceRunner,
      }
      if (Number(cfg.maxRows) > 0) {
        extractConfig.maxRows = Number(cfg.maxRows)
      }

      const flowName = `[Mig] ${project.name} · Extract ${entityKey || stage.name}`
      const dataSourceId = await upsertMigrationDataSource(admin, {
        organizationId: opts.organizationId,
        userId: opts.userId,
        existingId: stage.data_source_id,
        name: flowName,
        connectionId: project.source_connection_id,
        destinationTable: destTable,
        pipeline,
        config: extractConfig,
      })

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

      const rawMappings = Array.isArray(cfg.fieldMappings) ? cfg.fieldMappings : []
      const planConfig = project.plan_config && typeof project.plan_config === 'object'
        ? project.plan_config
        : {}
      const destinationSystemId = String(planConfig.destinationSystemId || '').trim()
      const destEntityRef = String(cfg.destinationEntity || cfg.entityLabel || entityKey).trim()
      const withLookups = enrichMappingsWithLookupMaps(
        destinationSystemId,
        destEntityRef || entityKey,
        rawMappings,
      )
      const mappings = enrichMappingsWithSystemDefaults(
        destinationSystemId,
        destEntityRef || entityKey,
        withLookups,
      )
      // Convert migration { sources, destination } → pipeline { field, targetField }
      const actions = fieldMappingsToTransformActions(mappings, { destinationSystemId })
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

      // Outbound export table lives under config.export (merged onto destination connection).
      // Skip existing PKs so re-running pilot/full does not fail on prior inserts.
      const destRunner = resolveRunnerTableConfig(
        cfg.destinationEntity || cfg.entityLabel,
        entityKey,
      )
      const mapConfig = {
        export: {
          ...(destRunner.table || destRunner.query ? destRunner : {}),
          onConflict: 'skip',
        },
      }

      const flowName = `[Mig] ${project.name} · Map ${entityKey || stage.name}`
      const dataSourceId = await upsertMigrationDataSource(admin, {
        organizationId: opts.organizationId,
        userId: opts.userId,
        existingId: stage.data_source_id,
        name: flowName,
        connectionId: project.source_connection_id,
        destinationTable: destTable,
        pipeline,
        config: mapConfig,
      })

      await admin
        .from('migration_stages')
        .update({
          data_source_id: dataSourceId,
          status: 'ready',
          config: { ...cfg, destinationTable: destTable, fieldMappings: mappings },
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

/**
 * Update by stage-linked id, else reuse org+name (unique), else insert.
 * Prevents duplicate-key failures after regenerating an AI plan (new stages, old flows).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {{
 *   organizationId: string,
 *   userId: string,
 *   existingId?: string | null,
 *   name: string,
 *   connectionId: string,
 *   destinationTable: string,
 *   pipeline: Record<string, unknown>,
 *   config: Record<string, unknown>,
 * }} opts
 */
async function upsertMigrationDataSource(admin, opts) {
  const patch = {
    name: opts.name,
    destination_table: opts.destinationTable,
    pipeline: opts.pipeline,
    connection_id: opts.connectionId,
    config: opts.config || {},
    status: 'draft',
    updated_at: new Date().toISOString(),
  }

  let dataSourceId = opts.existingId ? String(opts.existingId) : ''

  if (dataSourceId) {
    const { data: existingById } = await admin
      .from('data_sources')
      .select('id')
      .eq('id', dataSourceId)
      .eq('organization_id', opts.organizationId)
      .maybeSingle()

    if (existingById?.id) {
      const { error } = await admin
        .from('data_sources')
        .update(patch)
        .eq('id', dataSourceId)
        .eq('organization_id', opts.organizationId)
      if (error) {
        throw createError({ statusCode: 400, statusMessage: error.message })
      }
      return dataSourceId
    }
  }

  const { data: existingByName } = await admin
    .from('data_sources')
    .select('id')
    .eq('organization_id', opts.organizationId)
    .eq('name', opts.name)
    .maybeSingle()

  if (existingByName?.id) {
    const { error } = await admin
      .from('data_sources')
      .update(patch)
      .eq('id', existingByName.id)
      .eq('organization_id', opts.organizationId)
    if (error) {
      throw createError({ statusCode: 400, statusMessage: error.message })
    }
    return existingByName.id
  }

  const { data: created, error } = await admin
    .from('data_sources')
    .insert({
      organization_id: opts.organizationId,
      created_by: opts.userId,
      ...patch,
    })
    .select('id')
    .single()

  if (error || !created) {
    throw createError({ statusCode: 400, statusMessage: error?.message || 'Create data flow failed' })
  }
  return created.id
}
