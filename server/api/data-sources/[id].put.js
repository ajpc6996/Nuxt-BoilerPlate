import { sanitizeDestinationTable } from '~~/server/utils/connectorCrypto.js'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const body = await readBody(event)
  const organizationId = body?.organizationId

  if (!id || !organizationId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'id and organizationId are required',
    })
  }

  await requireOrgAdmin(event, organizationId)
  const admin = useSupabaseAdmin()

  const { data: existing, error: existingError } = await admin
    .from('data_sources')
    .select('id')
    .eq('id', id)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (existingError || !existing) {
    throw createError({ statusCode: 404, statusMessage: 'Data source not found' })
  }

  /** @type {Record<string, unknown>} */
  const patch = { updated_at: new Date().toISOString() }

  if (body.name != null) patch.name = String(body.name).trim()
  if (body.config && typeof body.config === 'object') patch.config = body.config
  if (body.destinationTable != null) {
    patch.destination_table = sanitizeDestinationTable(body.destinationTable)
  }
  if (body.connectionId != null) {
    const connectionId = String(body.connectionId)
    const { data: connection } = await admin
      .from('connections')
      .select('id')
      .eq('id', connectionId)
      .eq('organization_id', organizationId)
      .maybeSingle()
    if (!connection) {
      throw createError({ statusCode: 400, statusMessage: 'Unknown connection' })
    }
    patch.connection_id = connectionId
  }
  if (body.status != null) patch.status = body.status

  const { data, error } = await admin
    .from('data_sources')
    .update(patch)
    .eq('id', id)
    .select('id, name, status, destination_table, config, last_run_at, last_error, updated_at, connection_id')
    .single()

  if (error) {
    throw createError({ statusCode: 400, statusMessage: error.message })
  }

  return { item: data }
})
