import { executeDataSource } from '~~/server/utils/connectors/executeConnection.js'
import { loadMigrationProject, loadMigrationStages } from '~~/server/utils/migrations.js'

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
 * }} opts
 */
export async function runMigrationProject(admin, opts) {
  await loadMigrationProject(admin, opts.projectId, opts.organizationId)
  const stages = await loadMigrationStages(admin, opts.projectId)
  const runMode = opts.runMode === 'full' || opts.runMode === 'pilot' ? opts.runMode : 'sample'
  const execMode = runMode === 'sample' ? 'test' : 'run'

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

  const { data: runRow, error: runError } = await admin
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

  if (runError || !runRow) {
    throw createError({ statusCode: 500, statusMessage: runError?.message || 'Failed to create run' })
  }

  await admin
    .from('migration_projects')
    .update({ status: 'running' })
    .eq('id', opts.projectId)

  /** @type {Array<Record<string, unknown>>} */
  const stageResults = []

  try {
    for (const stage of runnable) {
      try {
        const result = await executeDataSource({
          dataSourceId: stage.data_source_id,
          mode: execMode,
          userId: opts.userId,
          isPlatformAdmin: opts.isPlatformAdmin,
        })

        stageResults.push({
          stageId: stage.id,
          stageName: stage.name,
          stageType: stage.stage_type,
          entityKey: stage.entity_key,
          dataSourceId: stage.data_source_id,
          dataSourceName: `[Mig] stage · ${stage.name}`,
          ok: true,
          rowsWritten: result.rowsWritten ?? 0,
          outboundWritten: result.pipelineSummary?.outboundWritten ?? 0,
          stagedWritten: result.stagedWritten ?? 0,
          rowsFetched: result.rowsFetched ?? 0,
          rowsAfterPipeline: result.rowsAfterPipeline ?? 0,
          sample: result.sample ?? [],
          summary: result.summary ?? result.pipelineSummary ?? {},
        })
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
          hint: buildStageFailureHint(stage, message),
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

    return {
      runId: runRow.id,
      runTag: runRow.run_tag,
      runMode,
      stageResults,
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
 * @param {{ stage_type?: string, name?: string }} stage
 * @param {string} message
 */
function buildStageFailureHint(stage, message) {
  const msg = String(message || '').toLowerCase()
  if (msg.includes('does not exist') && msg.includes('column')) {
    return 'A destination column is missing or an unmapped source field was exported. Open Mapping, keep only real destination columns, rematerialize, then retry.'
  }
  if (msg.includes('violates not-null') || msg.includes('not-null constraint')) {
    return 'A required destination column is null. Add a constant mapping (e.g. updated_by_id=1 or created_at=__NOW__), rematerialize, then retry.'
  }
  if (msg.includes('econnrefused') || msg.includes('timeout') || msg.includes('enotfound')) {
    return 'Connection/network failure. Use Connections → Test on the related inbound/outbound connection, then retry.'
  }
  if (msg.includes('table or query is required')) {
    return 'Extract data flow has no table/query. Set sourceEntity on the stage (real table name), rematerialize, then retry.'
  }
  if (msg.includes('invalid input syntax for type boolean')) {
    return 'A Zammad boolean column (active, shared_drafts, follow_up_assignment) received a non-boolean like “2” (often RT SortOrder). Click Materialize flows to force boolean constants, then retry Pilot.'
  }
  if (msg.includes('invalid input syntax for type integer')) {
    return 'An integer FK (often state_id/priority_id) received a label like “approved”. Click Materialize flows so status/priority names map to Zammad ids, then retry Pilot. Adjust the state map in Mapping if your Zammad state ids differ.'
  }
  if (stage.stage_type === 'transform' || stage.stage_type === 'export') {
    return 'Transform/export failed. Review Mapping for this entity, rematerialize flows, and Test the outbound connection.'
  }
  return 'Open the linked data flow, run Test there for details, adjust mappings/config, rematerialize, then retry.'
}
