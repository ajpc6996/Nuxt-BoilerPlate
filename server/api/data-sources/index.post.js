import { sanitizeDestinationTable } from '~~/server/utils/connectorCrypto.js'
import { invalidateLocalOrgSync } from '~~/server/utils/ingestBackend.js'
import { normalizePipeline } from '~~/server/utils/connectors/pipeline/defaults.js'
import { validatePipeline } from '~~/server/utils/connectors/pipeline/validate.js'
import { normalizeConnectionDirection } from '~~/shared/connectionDirection.js'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const organizationId = body?.organizationId
  const connectionId = body?.connectionId
  const name = String(body?.name || '').trim()
  const destinationTable = sanitizeDestinationTable(body?.destinationTable)
  const config = body?.config && typeof body.config === 'object' ? body.config : {}
  const pipeline = normalizePipeline(body?.pipeline)

  if (!organizationId || !connectionId || !name) {
    throw createError({
      statusCode: 400,
      statusMessage: 'organizationId, connectionId, and name are required',
    })
  }

  const validation = validatePipeline(pipeline)
  if (!validation.ok) {
    throw createError({ statusCode: 400, statusMessage: validation.error })
  }

  const { user, isPlatformAdmin } = await requireOrgAdmin(event, organizationId)
  const admin = useSupabaseAdmin()

  await assertLicenceAllows(admin, {
    organizationId,
    isPlatformAdmin,
    feature: 'dataSources',
    limitKey: 'maxDataSources',
  })

  const { data: connection, error: connError } = await admin
    .from('connections')
    .select('id, organization_id, direction, connector_types(is_enabled)')
    .eq('id', connectionId)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (connError || !connection) {
    throw createError({ statusCode: 400, statusMessage: 'Unknown connection' })
  }
  if (!connection.connector_types?.is_enabled) {
    throw createError({ statusCode: 400, statusMessage: 'Connector type is disabled' })
  }
  if (normalizeConnectionDirection(connection.direction) !== 'inbound') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Data flows must use an inbound connection',
    })
  }

  const { data: item, error } = await admin
    .from('data_sources')
    .insert({
      organization_id: organizationId,
      connection_id: connectionId,
      name,
      destination_table: destinationTable,
      config,
      pipeline,
      status: 'draft',
      created_by: user.id,
    })
    .select('id, name, status, destination_table, config, pipeline, connection_id, created_at')
    .single()

  if (error) {
    throw createError({ statusCode: 400, statusMessage: error.message })
  }

  invalidateLocalOrgSync(organizationId)

  return { item }
})
