import { executeDataSource } from '~~/server/utils/connectors/executeConnection.js'
import { cleanEntityKey } from '~~/shared/migration.js'
import { clearMigrationIngestTables } from '~~/server/utils/migrations/clearMigrationIngest.js'
import { loadMigrationProject, loadMigrationStages } from '~~/server/utils/migrations.js'

/**
 * @param {{ entity_key?: string, stage_type?: string }} stage
 */
function isArticlesExportStage(stage) {
  const entity = cleanEntityKey(stage.entity_key)
  if (entity !== 'articles' && entity !== 'transactions') return false
  const type = String(stage.stage_type || '').trim().toLowerCase()
  return type === 'transform' || type === 'export'
}

/**
 * @param {Array<Record<string, unknown>>} stages
 */
function findTicketsTransformStage(stages) {
  return stages.find((s) => {
    if (cleanEntityKey(s.entity_key) !== 'tickets') return false
    const type = String(s.stage_type || '').trim().toLowerCase()
    return (type === 'transform' || type === 'export') && s.data_source_id
  }) || null
}

/**
 * @param {Array<Record<string, unknown>>} stageResults
 * @param {Array<Record<string, unknown>>} stages
 */
function findTicketsTransformResult(stageResults, stages) {
  const ticketsTransform = findTicketsTransformStage(stages)
  if (ticketsTransform) {
    const byStageId = stageResults.find((sr) => sr.ok && sr.stageId === ticketsTransform.id)
    if (byStageId) return byStageId
  }
  return stageResults.find((sr) => {
    if (!sr.ok || cleanEntityKey(sr.entityKey) !== 'tickets') return false
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

  try {
    for (const stage of runnable) {
      try {
        if (isArticlesExportStage(stage)) {
          const ticketsTransformStage = findTicketsTransformStage(stages)
          const ticketsResult = findTicketsTransformResult(stageResults, stages)
          if (ticketsTransformStage && !ticketsResult) {
            throw createError({
              statusCode: 400,
              statusMessage: 'Articles export requires Transform Tickets to succeed in the same run first.',
              data: {
                hint: 'Run Transform Tickets before Transform Articles. Extract Transactions can run anytime; only the articles transform/export writes to Zammad.',
              },
            })
          }
          if (ticketsResult && Number(ticketsResult.outboundWritten ?? 0) <= 0) {
            throw createError({
              statusCode: 400,
              statusMessage: 'Transform Tickets wrote 0 rows to Zammad. Articles export needs ticket rows with preserved RT ids first.',
              data: {
                hint: 'Open the Transform Tickets data flow, run Test, and confirm outbound rows include id, number, and title. Re-run Extract Tickets if raw ingest is empty, then Transform Tickets.',
              },
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
 * @param {{ stage_type?: string, name?: string }} stage
 * @param {string} message
 */
function buildStageFailureHint(stage, message) {
  const msg = String(message || '').toLowerCase()
  if (msg.includes('does not exist') && msg.includes('column')) {
    return 'A destination column is missing or an unmapped source field was exported. Open Mapping, keep only real destination columns, rematerialize, then retry.'
  }
  if (msg.includes('violates not-null') || msg.includes('not-null constraint')) {
    if (msg.includes('column "number"')) {
      return 'Zammad tickets.number is required. Click Materialize flows to map RT Tickets.id → number, then retry Pilot.'
    }
    if (msg.includes('column "title"')) {
      return 'Zammad tickets.title is required. Click Materialize flows to map RT Subject → title, then retry Pilot.'
    }
    return 'A required destination column is null. Add a constant mapping (e.g. updated_by_id=1 or created_at=__NOW__), rematerialize, then retry.'
  }
  if (msg.includes('foreign key') || msg.includes('violates foreign key') || msg.includes('article fk failed')) {
    if (msg.includes('created_by_id') || msg.includes('updated_by_id') || msg.includes('origin_by_id')) {
      return 'Article FK failed on user reference. Run Transform Users first so Zammad has valid user ids, then retry Articles.'
    }
    if (msg.includes('type_id')) {
      return 'Article FK failed on type_id. Materialize flows so RT Transactions.Type maps to Zammad ticket_article_types, then retry.'
    }
    if (msg.includes('sender_id')) {
      return 'Article FK failed on sender_id. Materialize flows so RT Transactions.Type maps to Zammad ticket_article_senders, then retry.'
    }
    if (msg.includes('ticket_articles') || stage.entity_key === 'articles' || stage.entity_key === 'transactions') {
      return 'Article FK failed (usually ticket_id). Run Transform Tickets first with RT id preserved as tickets.id, then retry Articles.'
    }
    return 'Foreign key failed — migrate parent entities first (users → groups → tickets → articles) and ensure IDs align.'
  }
  if (msg.includes('missing required column') && msg.includes(' id')) {
    return 'Ticket export rows are missing tickets.id — RT ticket ids were not preserved. Click Materialize flows, then re-pilot Tickets before Articles.'
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
