import { decryptSecrets } from '../connectorCrypto.js'
import { getConnectorRunner } from './registry.js'

/**
 * Execute a connection in test or run mode.
 * Run lands rows into physical table ingest.<destination_table>.
 *
 * @param {{
 *   connectionId: string,
 *   mode?: 'test' | 'run',
 *   userId?: string,
 * }} opts
 */
export async function executeConnection(opts) {
  const mode = opts.mode === 'test' ? 'test' : 'run'
  const admin = useSupabaseAdmin()

  const { data: connection, error: connError } = await admin
    .from('connections')
    .select('*, connector_types(*)')
    .eq('id', opts.connectionId)
    .maybeSingle()

  if (connError || !connection) {
    throw createError({ statusCode: 404, statusMessage: 'Connection not found' })
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

  const { data: run, error: runError } = await admin
    .from('connection_runs')
    .insert({
      connection_id: connection.id,
      organization_id: connection.organization_id,
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

  const physicalTable = `ingest.${connection.destination_table}`

  try {
    const runner = getConnectorRunner(type.runner_key)
    const result = await runner({
      config: connection.config || {},
      secrets,
      mode,
      organizationId: connection.organization_id,
    })

    const rows = Array.isArray(result.rows) ? result.rows : []
    const sample = rows.slice(0, mode === 'test' ? 5 : rows.length)
    let rowsWritten = 0

    if (mode === 'run') {
      const { data: written, error: ingestError } = await admin.rpc(
        'ingest_replace_rows',
        {
          p_table: connection.destination_table,
          p_organization_id: connection.organization_id,
          p_connection_id: connection.id,
          p_run_id: run.id,
          p_rows: sample,
        },
      )

      if (ingestError) {
        throw createError({
          statusCode: 500,
          statusMessage: ingestError.message,
        })
      }

      rowsWritten = Number(written) || 0

      // Keep audit copy in connection_ingest_rows
      await admin
        .from('connection_ingest_rows')
        .delete()
        .eq('connection_id', connection.id)
        .eq('destination_table', connection.destination_table)

      if (sample.length) {
        const chunkSize = 200
        for (let i = 0; i < sample.length; i += chunkSize) {
          const chunk = sample.slice(i, i + chunkSize).map((data, idx) => ({
            organization_id: connection.organization_id,
            connection_id: connection.id,
            run_id: run.id,
            destination_table: connection.destination_table,
            row_index: i + idx,
            data,
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

    await admin
      .from('connection_runs')
      .update({
        status: 'success',
        rows_written: rowsWritten,
        finished_at: new Date().toISOString(),
      })
      .eq('id', run.id)

    await admin
      .from('connections')
      .update({
        status: 'ready',
        last_run_at: new Date().toISOString(),
        last_error: null,
        sync_state: {
          ...(connection.sync_state || {}),
          lastMeta: result.meta || {},
          lastRowCount: rows.length,
          physicalTable,
        },
      })
      .eq('id', connection.id)

    return {
      runId: run.id,
      mode,
      rowsFetched: rows.length,
      rowsWritten,
      sample: mode === 'test' ? sample : sample.slice(0, 3),
      meta: result.meta || {},
      destinationTable: connection.destination_table,
      physicalTable,
    }
  }
  catch (err) {
    const message = err?.statusMessage || err?.message || 'Connection run failed'
    await admin
      .from('connection_runs')
      .update({
        status: 'error',
        error_message: message,
        finished_at: new Date().toISOString(),
      })
      .eq('id', run.id)

    await admin
      .from('connections')
      .update({
        status: 'error',
        last_error: message,
      })
      .eq('id', connection.id)

    throw createError({
      statusCode: err?.statusCode || 500,
      statusMessage: message,
    })
  }
}
