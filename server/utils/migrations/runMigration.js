import { executeDataSource } from '~~/server/utils/connectors/executeConnection.js'
import { cleanEntityKey } from '~~/shared/migration.js'
import { clearMigrationIngestTables } from '~~/server/utils/migrations/clearMigrationIngest.js'
import { loadMigrationProject, loadMigrationStages } from '~~/server/utils/migrations.js'
import { getMigrationPackFromPlan } from '~~/shared/migrationPacks/index.js'

/**
 * @param {{ entity_key?: string, stage_type?: string }} stage
 * @param {{ childEntityKeys?: string[] } | null | undefined} gate
 */
function isChildExportStage(stage, gate) {
  const entity = cleanEntityKey(stage.entity_key)
  const keys = (gate?.childEntityKeys || []).map(cleanEntityKey)
  if (!keys.includes(entity)) return false
  const type = String(stage.stage_type || '').trim().toLowerCase()
  return type === 'transform' || type === 'export'
}

/**
 * @param {Array<Record<string, unknown>>} stages
 * @param {string} parentEntityKey
 */
function findParentTransformStage(stages, parentEntityKey) {
  const parent = cleanEntityKey(parentEntityKey)
  return stages.find((s) => {
    if (cleanEntityKey(s.entity_key) !== parent) return false
    const type = String(s.stage_type || '').trim().toLowerCase()
    return (type === 'transform' || type === 'export') && s.data_source_id
  }) || null
}

/**
 * @param {Array<Record<string, unknown>>} stageResults
 * @param {Array<Record<string, unknown>>} stages
 * @param {string} parentEntityKey
 */
function findParentTransformResult(stageResults, stages, parentEntityKey) {
  const parentTransform = findParentTransformStage(stages, parentEntityKey)
  if (parentTransform) {
    const byStageId = stageResults.find((sr) => sr.ok && sr.stageId === parentTransform.id)
    if (byStageId) return byStageId
  }
  const parent = cleanEntityKey(parentEntityKey)
  return stageResults.find((sr) => {
    if (!sr.ok || cleanEntityKey(sr.entityKey) !== parent) return false
    const type = String(sr.stageType || '').trim().toLowerCase()
    return type === 'transform' || type === 'export'
  }) || null
}

/**
 * Run migration stages in order (sample = test mode, pilot/full = run mode).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {{
 *   projectId: string,
 *   organizationId: string,
 *   userId: string,
 *   isPlatformAdmin?: boolean,
 *   runMode?: 'sample' | 'pilot' | 'full',
 *   stageIds?: string[],
 *   continueRunId?: string,
 *   finalizeRun?: boolean,
 * }} opts
 */
export async function runMigrationProject(admin, opts) {
  const project = await loadMigrationProject(admin, opts.projectId, opts.organizationId)
  const stages = await loadMigrationStages(admin, opts.projectId)
  const runMode = opts.runMode === 'full' || opts.runMode === 'pilot' ? opts.runMode : 'sample'
  const execMode = runMode === 'sample' ? 'test' : 'run'
  const finalizeRun = opts.finalizeRun !== false

  const runnable = stages.filter((s) => {
    if (!s.data_source_id) return false
    if (s.stage_type === 'validate' || s.stage_type === 'manual') return false
    if (Array.isArray(opts.stageIds) && opts.stageIds.length) {
      return opts.stageIds.includes(s.id)
    }
    return true
  })

  if (!runnable.length) {
    throw createError({
      statusCode: 400,
      statusMessage: 'No materialized stages to run. Materialize the plan first.',
    })
  }

  /** @type {{ tables: Array<{ table: string, rowsDeleted: number }>, tableCount: number, rowsDeleted: number } | null} */
  let ingestCleared = null
  const shouldResetIngest = Boolean(project.reset_ingest_before_run)
    && runMode !== 'sample'
    && !opts.continueRunId

  if (shouldResetIngest) {
    ingestCleared = await clearMigrationIngestTables(admin, opts.projectId, opts.organizationId)
  }

  /** @type {Record<string, unknown>} */
  let runRow
  /** @type {Array<Record<string, unknown>>} */
  let stageResults = []

  if (opts.continueRunId) {
    const { data: existing, error: existingError } = await admin
      .from('migration_runs')
      .select('*')
      .eq('id', opts.continueRunId)
      .eq('migration_project_id', opts.projectId)
      .eq('organization_id', opts.organizationId)
      .maybeSingle()

    if (existingError || !existing) {
      throw createError({ statusCode: 404, statusMessage: 'Migration run not found' })
    }
    if (existing.status !== 'running') {
      throw createError({ statusCode: 400, statusMessage: 'Migration run is not in progress' })
    }
    if (existing.run_mode !== runMode) {
      throw createError({ statusCode: 400, statusMessage: 'Run mode does not match the in-progress migration run' })
    }
    runRow = existing
    stageResults = Array.isArray(existing.stage_results) ? [...existing.stage_results] : []
  }
  else {
    const { data: created, error: runError } = await admin
      .from('migration_runs')
      .insert({
        migration_project_id: opts.projectId,
        organization_id: opts.organizationId,
        run_mode: runMode,
        status: 'running',
        started_by: opts.userId,
      })
      .select('*')
      .single()

    if (runError || !created) {
      throw createError({ statusCode: 500, statusMessage: runError?.message || 'Failed to create run' })
    }
    runRow = created

    await admin
      .from('migration_projects')
      .update({ status: 'running' })
      .eq('id', opts.projectId)
  }

  const pack = getMigrationPackFromPlan(project.plan_config)
  const childGate = pack?.childExportGate || null

  try {
    for (const stage of runnable) {
      try {
        if (childGate && isChildExportStage(stage, childGate)) {
          const parentTransformStage = findParentTransformStage(stages, childGate.parentEntityKey)
          const parentResult = findParentTransformResult(stageResults, stages, childGate.parentEntityKey)
          if (parentTransformStage && !parentResult) {
            throw createError({
              statusCode: 400,
              statusMessage: childGate.missingParentMessage,
              data: { hint: childGate.missingParentHint },
            })
          }
          if (parentResult && Number(parentResult.outboundWritten ?? 0) <= 0) {
            throw createError({
              statusCode: 400,
              statusMessage: childGate.zeroOutboundMessage,
              data: { hint: childGate.zeroOutboundHint },
            })
          }
        }

        const result = await executeDataSource({
          dataSourceId: stage.data_source_id,
          mode: execMode,
          userId: opts.userId,
          isPlatformAdmin: opts.isPlatformAdmin,
          migrationRun: {
            runMode,
            projectId: opts.projectId,
            sampleLimit: Number(project.sample_limit) || 0,
            stageId: stage.id,
            entityKey: stage.entity_key,
            stageType: stage.stage_type,
          },
        })

        stageResults.push({
          stageId: stage.id,
          stageName: stage.name,
          stageType: stage.stage_type,
          entityKey: stage.entity_key,
          dataSourceId: stage.data_source_id,
          dataSourceName: stage.name,
          ok: true,
          rowsWritten: result.rowsWritten ?? 0,
          outboundWritten: result.pipelineSummary?.outboundWritten ?? 0,
          stagedWritten: result.stagedWritten ?? 0,
          rowsFetched: result.rowsFetched ?? 0,
          rowsAfterPipeline: result.rowsAfterPipeline ?? 0,
          sample: result.sample ?? [],
          summary: result.summary ?? result.pipelineSummary ?? {},
        })

        if (!finalizeRun) {
          await admin
            .from('migration_runs')
            .update({
              status: 'running',
              stage_results: stageResults,
            })
            .eq('id', runRow.id)
        }
      }
      catch (stageErr) {
        const message = stageErr?.statusMessage || stageErr?.message || 'Stage failed'
        const failed = {
          stageId: stage.id,
          stageName: stage.name,
          stageType: stage.stage_type,
          entityKey: stage.entity_key,
          dataSourceId: stage.data_source_id,
          ok: false,
          error: message,
          hint: buildStageFailureHint(stage, message, pack),
        }
        stageResults.push(failed)

        const lastError = formatStageFailure(failed)

        await admin
          .from('migration_runs')
          .update({
            status: 'failed',
            stage_results: stageResults,
            last_error: lastError,
            completed_at: new Date().toISOString(),
          })
          .eq('id', runRow.id)

        await admin
          .from('migration_projects')
          .update({ status: 'ready' })
          .eq('id', opts.projectId)

        throw createError({
          statusCode: stageErr?.statusCode || 500,
          statusMessage: lastError,
          data: {
            runId: runRow.id,
            failedStage: failed,
            stageResults,
          },
        })
      }
    }

    if (finalizeRun) {
      await admin
        .from('migration_runs')
        .update({
          status: 'completed',
          stage_results: stageResults,
          completed_at: new Date().toISOString(),
        })
        .eq('id', runRow.id)

      await admin
        .from('migration_projects')
        .update({ status: runMode === 'full' ? 'completed' : 'ready' })
        .eq('id', opts.projectId)
    }

    return {
      runId: runRow.id,
      runTag: runRow.run_tag,
      runMode,
      stageResults,
      finalized: finalizeRun,
      ingestCleared,
    }
  }
  catch (err) {
    // Stage failures already persist run state above; rethrow as-is.
    if (err?.data?.failedStage) throw err

    const lastError = err?.statusMessage || err?.message || 'Migration run failed'
    stageResults.push({ ok: false, error: lastError })

    await admin
      .from('migration_runs')
      .update({
        status: 'failed',
        stage_results: stageResults,
        last_error: lastError,
        completed_at: new Date().toISOString(),
      })
      .eq('id', runRow.id)

    await admin
      .from('migration_projects')
      .update({ status: 'ready' })
      .eq('id', opts.projectId)

    throw createError({ statusCode: err?.statusCode || 500, statusMessage: lastError })
  }
}

/**
 * @param {Record<string, unknown>} failed
 */
function formatStageFailure(failed) {
  const name = failed.stageName || 'Unknown stage'
  const entity = failed.entityKey ? ` · entity ${failed.entityKey}` : ''
  const flow = failed.dataSourceId ? ` · data flow ${failed.dataSourceId}` : ''
  return `Stage “${name}”${entity} failed${flow}: ${failed.error}`
}

/**
 * @param {{ stage_type?: string, name?: string, entity_key?: string }} stage
 * @param {string} message
 * @param {import('~~/shared/migrationPacks/types.js').MigrationPack | null} [pack]
 */
function buildStageFailureHint(stage, message, pack = null) {
  const msg = String(message || '').toLowerCase()
  for (const rule of pack?.failureHints || []) {
    try {
      if (rule.test(msg, stage)) return rule.hint
    }
    catch {
      // ignore bad pack tests
    }
  }
  if (msg.includes('does not exist') && msg.includes('column')) {
    return 'A destination column is missing or an unmapped source field was exported. Open Mapping, keep only real destination columns, rematerialize, then retry.'
  }
  if (msg.includes('violates not-null') || msg.includes('not-null constraint')) {
    return 'A required destination column is null. Add a constant mapping (e.g. updated_by_id=1 or created_at=__NOW__), rematerialize, then retry.'
  }
  if (msg.includes('foreign key') || msg.includes('violates foreign key') || msg.includes('article fk') || msg.includes('fk preflight') || msg.includes('fk:')) {
    return 'Foreign key failed — migrate parent entities first and ensure IDs align.'
  }
  if (msg.includes('econnrefused') || msg.includes('timeout') || msg.includes('enotfound')) {
    return 'Connection/network failure. Use Connections → Test on the related inbound/outbound connection, then retry.'
  }
  if (msg.includes('table or query is required')) {
    return 'Extract data flow has no table/query. Set sourceEntity on the stage (real table name), rematerialize, then retry.'
  }
  if (msg.includes('invalid input syntax for type boolean')) {
    return 'A boolean destination column received a non-boolean value. Materialize with pack defaults / boolean constants, then retry.'
  }
  if (msg.includes('invalid input syntax for type integer')) {
    return 'An integer destination column received a non-integer label. Use a map transform to ids, rematerialize, then retry.'
  }
  if (stage.stage_type === 'transform' || stage.stage_type === 'export') {
    return 'Transform/export failed. Review Mapping for this entity, rematerialize flows, and Test the outbound connection.'
  }
  return 'Open the linked data flow, run Test there for details, adjust mappings/config, rematerialize, then retry.'
}
