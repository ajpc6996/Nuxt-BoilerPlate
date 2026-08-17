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
        ok: true,
        rowsWritten: result.rowsWritten ?? 0,
        stagedWritten: result.stagedWritten ?? 0,
        sample: result.sample ?? [],
        summary: result.summary ?? {},
      })
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
