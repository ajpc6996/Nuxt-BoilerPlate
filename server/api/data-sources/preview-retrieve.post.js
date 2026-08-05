import { decryptSecrets } from '~~/server/utils/connectorCrypto.js'
import {
  getConnectorRunner,
} from '~~/server/utils/connectors/registry.js'
import { mergeConnectorConfig } from '~~/server/utils/connectors/executeConnection.js'

/**
 * Fetch a single sample row from Retrieve (no ingest, no pipeline).
 * Accepts unsaved connectionId + config so Filter can discover fields before save.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const organizationId = body?.organizationId
  const connectionId = body?.connectionId
  const config = body?.config && typeof body.config === 'object' ? body.config : {}

  if (!organizationId || !connectionId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'organizationId and connectionId are required',
    })
  }

  await requireOrgAdmin(event, organizationId)
  const admin = useSupabaseAdmin()

  const { data: connection, error } = await admin
    .from('connections')
    .select('*, connector_types(*)')
    .eq('id', connectionId)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (error || !connection) {
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

  const mergedConfig = mergeConnectorConfig(connection.config, config)
  const runner = getConnectorRunner(type.runner_key)
  const result = await runner({
    config: mergedConfig,
    secrets,
    mode: 'test',
    organizationId,
  })

  const rows = Array.isArray(result.rows) ? result.rows : []
  const sample = rows[0] && typeof rows[0] === 'object' && !Array.isArray(rows[0])
    ? rows[0]
    : rows[0] != null
      ? { value: rows[0] }
      : null

  const fields = sample
    ? Object.keys(sample).filter((k) => !k.startsWith('_'))
    : []

  return {
    sample,
    fields,
    rowCount: rows.length,
    meta: result.meta || {},
  }
})
