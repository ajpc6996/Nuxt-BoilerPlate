import { decryptSecrets } from '../connectorCrypto.js'
import { mergeConnectorConfig } from './connectorConfig.js'
import { getConnectorRunner } from './registry.js'
import { normalizeConnectionDirection } from '~~/shared/connectionDirection.js'

/**
 * Deliver export rows to an outbound connection using the connector runner.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {{
 *   exportConnectionId: string,
 *   organizationId: string,
 *   rows: Record<string, unknown>[],
 *   dataSourceConfig?: Record<string, unknown>,
 *   mode?: string,
 * }} opts
 */
export async function deliverOutboundBatch(admin, opts) {
  const rows = Array.isArray(opts.rows) ? opts.rows : []
  if (!rows.length) return { rowsWritten: 0, meta: {} }

  const { data: connection, error } = await admin
    .from('connections')
    .select('*, connector_types(*)')
    .eq('id', opts.exportConnectionId)
    .eq('organization_id', opts.organizationId)
    .maybeSingle()

  if (error || !connection) {
    throw createError({ statusCode: 404, statusMessage: 'Outbound connection not found' })
  }
  if (normalizeConnectionDirection(connection.direction) !== 'outbound') {
    throw createError({ statusCode: 400, statusMessage: 'Connection is not outbound' })
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

  const exportCfg = opts.dataSourceConfig?.export && typeof opts.dataSourceConfig.export === 'object'
    ? opts.dataSourceConfig.export
    : {}
  const mergedConfig = mergeConnectorConfig(connection.config, exportCfg)
  const runner = await getConnectorRunner(type.runner_key, admin)

  const result = await runner({
    config: mergedConfig,
    secrets,
    rows,
    direction: 'outbound',
    mode: opts.mode === 'test' ? 'test' : 'run',
    organizationId: opts.organizationId,
  })

  return {
    rowsWritten: Number(result.rowsWritten ?? result.meta?.rowsWritten ?? rows.length),
    meta: result.meta || {},
  }
}
