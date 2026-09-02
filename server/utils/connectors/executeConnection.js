import { decryptSecrets, encryptSecrets } from '../connectorCrypto.js'
import { getConnectorRunner } from './registry.js'
import { normalizePipeline, isMergePipeline } from './pipeline/defaults.js'
import { executePipeline } from './pipeline/runPipeline.js'
import { loadFetchInputs } from './pipeline/loadFetchInputs.js'
import { loadSystemSettings, chunkRowsForStage } from '../systemSettings.js'
import {
  DEFAULT_INGEST_RETENTION_DAYS,
  normalizeRetentionDays,
} from '~~/shared/systemSettings.js'
import { normalizeConnectionDirection } from '~~/shared/connectionDirection.js'
import { mergeConnectorConfig } from './connectorConfig.js'
import { deliverOutboundBatch } from './deliverOutbound.js'
import { getIngestBackend } from '~~/server/utils/ingestBackend.js'

export { mergeConnectorConfig } from './connectorConfig.js'

/**
 * Execute a data source in test or run mode.
 * Retrieve → pipeline (Filter…) → Ingest (run mode only),
 * or Fetch (last_ingest | refresh) → Merge → … → Ingest.
 *
 * @param {{
 *   dataSourceId: string,
 *   mode?: 'test' | 'run',
 *   userId?: string,
 *   fetchStack?: string[],
 *   returnRows?: boolean,
 *   isPlatformAdmin?: boolean,
 *   migrationRun?: {
 *     runMode?: string,
 *     projectId?: string,
 *     sampleLimit?: number,
 *     stageId?: string,
 *     entityKey?: string,
 *     stageType?: string,
 *   },
 * }} opts
 */
export async function executeDataSource(opts) {
  const mode = opts.mode === 'test' ? 'test' : 'run'
  const admin = useSupabaseAdmin()
  const fetchStack = Array.isArray(opts.fetchStack) ? opts.fetchStack : []

  const { data: dataSource, error: dsError } = await admin
    .from('data_sources')
    .select('*, connections(*, connector_types(*))')
    .eq('id', opts.dataSourceId)
    .maybeSingle()

  if (dsError || !dataSource) {
    throw createError({ statusCode: 404, statusMessage: 'Data source not found' })
  }

  if (mode === 'run' && !opts.isPlatformAdmin) {
    await assertLicenceAllows(admin, {
      organizationId: dataSource.organization_id,
      isPlatformAdmin: false,
      feature: 'dataSources',
    })
  }

  if (fetchStack.includes(dataSource.id)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Circular merge Fetch dependency detected',
    })
  }

  const connection = dataSource.connections
  if (!connection) {
    throw createError({ statusCode: 400, statusMessage: 'Data source has no connection' })
  }

  const type = connection.connector_types
  if (!type?.is_enabled) {
    throw createError({ statusCode: 400, statusMessage: 'Connector type is disabled' })
  }

  const { data: secretRow } = await admin
    .from('connection_secrets')
    .select('ciphertext')
    .eq('connection_id', connection.id)
    .maybeSingle()

  let secrets = {}
  if (secretRow?.ciphertext) {
    secrets = decryptSecrets(secretRow.ciphertext)
  }

  const persistSecrets = async (nextSecrets) => {
    if (!nextSecrets || typeof nextSecrets !== 'object') return
    const ciphertext = encryptSecrets(nextSecrets)
    await admin.from('connection_secrets').upsert({
      connection_id: connection.id,
      ciphertext,
      updated_at: new Date().toISOString(),
    })
  }

  const { data: run, error: runError } = await admin
    .from('connection_runs')
    .insert({
      connection_id: connection.id,
      data_source_id: dataSource.id,
      organization_id: dataSource.organization_id,
      status: 'running',
      mode,
      started_by: opts.userId || null,
    })
    .select('*')
    .single()

  if (runError || !run) {
    throw createError({
      statusCode: 500,
      statusMessage: runError?.message || 'Failed to create run',
    })
  }

  const physicalTable = `ingest.${dataSource.destination_table}`
  const mergedConfig = mergeConnectorConfig(connection.config, dataSource.config)
  const pipeline = normalizePipeline(dataSource.pipeline)
  const merge = isMergePipeline(pipeline)

  try {
    /** @type {Record<string, unknown>[]} */
    let retrievedRows = []
    /** @type {Record<string, unknown>} */
    let resultMeta = {}
    /** @type {ReturnType<typeof executePipeline>} */
    let pipelineResult

    // Always collect step samples on Test so the editor output panel can show debug.
    const pipelineDebug = Boolean(pipeline.debug) || mode === 'test'

    if (merge) {
      const seedOutputs = await loadFetchInputs({
        pipeline,
        organizationId: dataSource.organization_id,
        parentMode: mode,
        userId: opts.userId,
        excludeSourceId: dataSource.id,
        fetchStack: [...fetchStack, dataSource.id],
      })

      if (dataSource.is_migration && dataSource.migration_project_id) {
        const { scopeMigrationExtractRows } = await import('~~/server/utils/migrations/migrationExtractScope.js')
        for (const node of pipeline.nodes.filter((n) => n.type === 'fetch')) {
          const sourceId = String(node.data?.sourceId || '').trim()
          if (!sourceId || !Array.isArray(seedOutputs[node.id])) continue
          const { data: childSource } = await admin
            .from('data_sources')
            .select('id, organization_id, migration_project_id, migration_stage_id')
            .eq('id', sourceId)
            .maybeSingle()
          if (!childSource) continue
          const scoped = await scopeMigrationExtractRows(admin, childSource, seedOutputs[node.id])
          seedOutputs[node.id] = scoped.rows
          if (scoped.meta?.scopedToTickets) {
            resultMeta = { ...(resultMeta || {}), ...scoped.meta }
          }
        }
      }

      pipelineResult = executePipeline({
        pipeline,
        seedOutputs,
        debug: pipelineDebug,
      })
      retrievedRows = Object.values(seedOutputs).flat()
      resultMeta = { kind: 'merge', fetchCount: Object.keys(seedOutputs).length, ...(resultMeta || {}) }
    }
    else {
      const runner = await getConnectorRunner(type.runner_key, admin)
      const result = await runner({
        config: mergedConfig,
        secrets,
        mode,
        organizationId: dataSource.organization_id,
        persistSecrets,
      })

      if (result?.secrets && typeof result.secrets === 'object') {
        secrets = result.secrets
        await persistSecrets(secrets)
      }

      retrievedRows = Array.isArray(result.rows) ? result.rows : []
      resultMeta = result.meta || {}

      if (opts.migrationRun?.runMode === 'pilot') {
        const sampleLimit = Number(opts.migrationRun.sampleLimit) || 0
        if (sampleLimit > 0 && retrievedRows.length > sampleLimit) {
          retrievedRows = retrievedRows.slice(0, sampleLimit)
          resultMeta = {
            ...resultMeta,
            pilotSampleLimit: sampleLimit,
            truncatedToSampleLimit: true,
          }
        }
      }

      if (dataSource.is_migration && dataSource.migration_project_id) {
        const { scopeMigrationExtractRows } = await import('~~/server/utils/migrations/migrationExtractScope.js')
        const scoped = await scopeMigrationExtractRows(admin, dataSource, retrievedRows)
        retrievedRows = scoped.rows
        if (scoped.meta && Object.keys(scoped.meta).length) {
          resultMeta = { ...resultMeta, ...scoped.meta }
        }
      }

      pipelineResult = executePipeline({
        pipeline,
        retrievedRows,
        retrieveMeta: resultMeta,
        debug: pipelineDebug,
      })
    }

    const rows = pipelineResult.rows
    const sample = rows.slice(0, mode === 'test' ? 5 : Math.min(3, rows.length))
    let rowsWritten = 0
    let stagedWritten = 0
    let stagedReleased = 0
    let outboundWritten = 0
    let expiredCleaned = 0

    if (mode === 'run') {
      const settings = await loadSystemSettings(admin)

      const ingestNodes = pipeline.nodes.filter((n) => n.type === 'ingest')
      const exportNodes = pipeline.nodes.filter((n) => n.type === 'export')
      const hasIngest = ingestNodes.length > 0
      const hasExport = exportNodes.length > 0
      const ingestBackend = await getIngestBackend(admin, dataSource.organization_id)

      if (hasExport) {
        await ingestBackend.stagedCleanupStale(settings.stageStaleTtlMinutes)
      }
      const ingestCfg = ingestNodes[0]?.data || {}
      const ingestMode = hasExport
        ? 'append'
        : (ingestCfg.writeMode === 'append' ? 'append' : 'replace')
      const retentionDays = normalizeRetentionDays(
        ingestCfg.retentionDays,
        DEFAULT_INGEST_RETENTION_DAYS,
      )
      const cycleTime = new Date().toISOString()
      const caps = {
        maxRows: settings.maxStageRowsPerBatch,
        maxBytes: settings.maxStageBytesPerBatch,
      }

      const ingestRows = hasIngest
        ? (pipelineResult.sinkOutputs?.ingest?.[0]?.rows || rows)
        : []
      const exportRows = hasExport
        ? (pipelineResult.sinkOutputs?.export?.[0]?.rows || rows)
        : []

      if (hasIngest && normalizeConnectionDirection(connection.direction) !== 'inbound') {
        throw createError({
          statusCode: 400,
          statusMessage: 'Ingest requires an inbound connection on this data flow',
        })
      }

      let exportConnectionId = connection.id
      if (hasExport) {
        const exportConnId = String(exportNodes[0]?.data?.connectionId || '').trim()
        if (!exportConnId) {
          throw createError({
            statusCode: 400,
            statusMessage: 'Export requires an outbound connection',
          })
        }
        const { data: exportConn, error: exportConnError } = await admin
          .from('connections')
          .select('id, direction, organization_id')
          .eq('id', exportConnId)
          .maybeSingle()
        if (
          exportConnError
          || !exportConn
          || exportConn.organization_id !== dataSource.organization_id
        ) {
          throw createError({
            statusCode: 400,
            statusMessage: 'Unknown outbound connection',
          })
        }
        if (normalizeConnectionDirection(exportConn.direction) !== 'outbound') {
          throw createError({
            statusCode: 400,
            statusMessage: 'Export must use an outbound connection',
          })
        }
        exportConnectionId = exportConn.id
      }

      if (hasIngest && !opts.isPlatformAdmin) {
        await assertLicenceAllows(admin, {
          organizationId: dataSource.organization_id,
          isPlatformAdmin: false,
          limitKey: 'maxIngestRowsPerMonth',
          delta: ingestRows.length,
        })
      }

      if (hasIngest) {
        let chunks = chunkRowsForStage(ingestRows, caps)
        if (!chunks.length && ingestMode === 'replace') {
          chunks = [[]]
        }
        for (let i = 0; i < chunks.length; i += 1) {
          if (ingestMode === 'append' || i > 0) {
            const written = await ingestBackend.ingestAppendRows({
              table: dataSource.destination_table,
              organizationId: dataSource.organization_id,
              connectionId: connection.id,
              runId: run.id,
              rows: chunks[i],
              cycleTime,
            })
            rowsWritten += Number(written) || 0
          }
          else {
            const written = await ingestBackend.ingestReplaceRows({
              table: dataSource.destination_table,
              organizationId: dataSource.organization_id,
              connectionId: connection.id,
              runId: run.id,
              rows: chunks[i],
              cycleTime,
            })
            rowsWritten += Number(written) || 0
          }
        }

        if (ingestMode === 'append') {
          const cleaned = await ingestBackend.ingestCleanupExpired({
            table: dataSource.destination_table,
            organizationId: dataSource.organization_id,
            connectionId: connection.id,
            retentionDays,
          })
          expiredCleaned = Number(cleaned) || 0
        }

        if (ingestMode === 'replace' && !hasExport) {
          await admin
            .from('connection_ingest_rows')
            .delete()
            .eq('data_source_id', dataSource.id)
            .eq('destination_table', dataSource.destination_table)

          if (ingestRows.length) {
            const chunkSize = 200
            for (let i = 0; i < ingestRows.length; i += chunkSize) {
              const chunk = ingestRows.slice(i, i + chunkSize).map((data, idx) => ({
                organization_id: dataSource.organization_id,
                connection_id: connection.id,
                data_source_id: dataSource.id,
                run_id: run.id,
                destination_table: dataSource.destination_table,
                row_index: i + idx,
                data: { ...(data || {}), cycleTime },
              }))
              const { error: insertError } = await admin
                .from('connection_ingest_rows')
                .insert(chunk)
              if (insertError) {
                console.warn('[ingest] audit insert failed', insertError.message)
              }
            }
          }
        }
      }

      if (hasExport) {
        const chunks = chunkRowsForStage(exportRows, caps)
        const dualSink = hasIngest
        for (let i = 0; i < chunks.length; i += 1) {
          const liveCount = Number(await ingestBackend.stagedCountOrg(dataSource.organization_id)) || 0
          if (liveCount + chunks[i].length > settings.maxConcurrentStageRowsPerOrg) {
            throw createError({
              statusCode: 429,
              statusMessage: `Temp Stage cap reached (${liveCount}/${settings.maxConcurrentStageRowsPerOrg} live rows). Wait for stale TTL or raise the platform cap.`,
            })
          }
          const stagedCount = await ingestBackend.stagedAppendRows({
            organizationId: dataSource.organization_id,
            connectionId: exportConnectionId,
            dataSourceId: dataSource.id,
            runId: run.id,
            batchNo: i,
            rows: chunks[i],
          })
          stagedWritten += Number(stagedCount) || 0
          if (dualSink) {
            await ingestBackend.stagedDeleteBatch({ runId: run.id, batchNo: i })
            stagedReleased += chunks[i].length
          }

          const delivered = await deliverOutboundBatch(admin, {
            exportConnectionId,
            organizationId: dataSource.organization_id,
            rows: chunks[i],
            dataSourceConfig: dataSource.config,
            mode,
          })
          outboundWritten += delivered.rowsWritten
        }
        if (dualSink) {
          await ingestBackend.stagedDeleteRun({ runId: run.id })
        }
      }
    }

    const summary = {
      ...pipelineResult.summary,
      written: rowsWritten,
      stagedWritten,
      stagedReleased,
      outboundWritten,
      expiredCleaned,
    }

    await admin
      .from('connection_runs')
      .update({
        status: 'success',
        rows_written: rowsWritten,
        finished_at: new Date().toISOString(),
      })
      .eq('id', run.id)

    await admin
      .from('data_sources')
      .update({
        status: 'ready',
        last_run_at: new Date().toISOString(),
        last_error: null,
        sync_state: {
          ...(dataSource.sync_state || {}),
          lastMeta: resultMeta,
          lastRowCount: rows.length,
          lastRetrievedCount: retrievedRows.length,
          lastPipelineSummary: summary,
          lastPipelineDebug: pipelineDebug
            ? { steps: pipelineResult.steps, at: new Date().toISOString() }
            : null,
          physicalTable,
        },
      })
      .eq('id', dataSource.id)

    await admin
      .from('connections')
      .update({
        status: 'ready',
        last_error: null,
      })
      .eq('id', connection.id)

    return {
      runId: run.id,
      mode,
      rowsFetched: retrievedRows.length,
      rowsAfterPipeline: rows.length,
      rowsWritten,
      sample: mode === 'test' ? sample : sample.slice(0, 3),
      ...(opts.returnRows ? { rows } : {}),
      meta: resultMeta,
      pipelineSummary: summary,
      pipelineSteps: pipelineDebug ? pipelineResult.steps : undefined,
      destinationTable: dataSource.destination_table,
      physicalTable,
      connectionId: connection.id,
      dataSourceId: dataSource.id,
    }
  }
  catch (err) {
    const message = err?.statusMessage || err?.message || 'Data source run failed'
    await admin
      .from('connection_runs')
      .update({
        status: 'error',
        error_message: message,
        finished_at: new Date().toISOString(),
      })
      .eq('id', run.id)

    await admin
      .from('data_sources')
      .update({
        status: 'error',
        last_error: message,
      })
      .eq('id', dataSource.id)

    throw createError({
      statusCode: err?.statusCode || 500,
      statusMessage: message,
    })
  }
}

/**
 * @deprecated use executeDataSource
 */
export async function executeConnection(opts) {
  if (opts.dataSourceId) {
    return executeDataSource(opts)
  }
  const admin = useSupabaseAdmin()
  const { data: ds } = await admin
    .from('data_sources')
    .select('id')
    .eq('connection_id', opts.connectionId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!ds?.id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'No data source linked to this connection. Create a data source first.',
    })
  }

  return executeDataSource({
    dataSourceId: ds.id,
    mode: opts.mode,
    userId: opts.userId,
  })
}
