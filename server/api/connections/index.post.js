import {
  encryptSecrets,
  sanitizeDestinationTable,
} from '~~/server/utils/connectorCrypto.js'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const organizationId = body?.organizationId
  const connectorTypeId = body?.connectorTypeId
  const name = String(body?.name || '').trim()
  const destinationTable = sanitizeDestinationTable(body?.destinationTable)
  const config = body?.config && typeof body.config === 'object' ? body.config : {}
  const credentials = body?.credentials && typeof body.credentials === 'object'
    ? body.credentials
    : {}

  if (!organizationId || !connectorTypeId || !name) {
    throw createError({
      statusCode: 400,
      statusMessage: 'organizationId, connectorTypeId, and name are required',
    })
  }

  const { user } = await requireOrgAdmin(event, organizationId)
  const admin = useSupabaseAdmin()

  const { data: typeRow, error: typeError } = await admin
    .from('connector_types')
    .select('id, is_enabled')
    .eq('id', connectorTypeId)
    .maybeSingle()

  if (typeError || !typeRow) {
    throw createError({ statusCode: 400, statusMessage: 'Unknown connector type' })
  }
  if (!typeRow.is_enabled) {
    throw createError({ statusCode: 400, statusMessage: 'Connector type is disabled' })
  }

  const { data: connection, error } = await admin
    .from('connections')
    .insert({
      organization_id: organizationId,
      connector_type_id: connectorTypeId,
      name,
      destination_table: destinationTable,
      config,
      status: 'draft',
      created_by: user.id,
    })
    .select('id, name, status, destination_table, config, connector_type_id, created_at')
    .single()

  if (error) {
    throw createError({ statusCode: 400, statusMessage: error.message })
  }

  const hasSecrets = Object.values(credentials).some(
    (v) => v != null && String(v).trim() !== '',
  )
  if (hasSecrets) {
    const ciphertext = encryptSecrets(credentials)
    const { error: secretError } = await admin.from('connection_secrets').upsert({
      connection_id: connection.id,
      ciphertext,
      updated_at: new Date().toISOString(),
    })
    if (secretError) {
      await admin.from('connections').delete().eq('id', connection.id)
      throw createError({ statusCode: 500, statusMessage: secretError.message })
    }
  }

  return { item: connection }
})
