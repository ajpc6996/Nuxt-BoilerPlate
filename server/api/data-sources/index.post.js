import { sanitizeDestinationTable } from '~~/server/utils/connectorCrypto.js'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const organizationId = body?.organizationId
  const connectionId = body?.connectionId
  const name = String(body?.name || '').trim()
  const destinationTable = sanitizeDestinationTable(body?.destinationTable)
  const config = body?.config && typeof body.config === 'object' ? body.config : {}

  if (!organizationId || !connectionId || !name) {
    throw createError({
      statusCode: 400,
      statusMessage: 'organizationId, connectionId, and name are required',
    })
  }

  const { user } = await requireOrgAdmin(event, organizationId)
  const admin = useSupabaseAdmin()

  const { data: connection, error: connError } = await admin
    .from('connections')
    .select('id, organization_id, connector_types(is_enabled)')
    .eq('id', connectionId)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (connError || !connection) {
    throw createError({ statusCode: 400, statusMessage: 'Unknown connection' })
  }
  if (!connection.connector_types?.is_enabled) {
    throw createError({ statusCode: 400, statusMessage: 'Connector type is disabled' })
  }

  const { data: item, error } = await admin
    .from('data_sources')
    .insert({
      organization_id: organizationId,
      connection_id: connectionId,
      name,
      destination_table: destinationTable,
      config,
      status: 'draft',
      created_by: user.id,
    })
    .select('id, name, status, destination_table, config, connection_id, created_at')
    .single()

  if (error) {
    throw createError({ statusCode: 400, statusMessage: error.message })
  }

  return { item }
})
