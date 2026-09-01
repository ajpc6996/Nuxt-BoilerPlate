import { testConnectionConnectivity } from '~~/server/utils/connectors/testConnection.js'

/**
 * Test connection settings before the connection is saved.
 * Body: { organizationId, connectorTypeId, direction, config, credentials }
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const organizationId = String(body?.organizationId || '')
  const connectorTypeId = String(body?.connectorTypeId || '')

  if (!organizationId || !connectorTypeId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'organizationId and connectorTypeId are required',
    })
  }

  await requireOrgAdmin(event, organizationId)
  const admin = useSupabaseAdmin()

  return testConnectionConnectivity(admin, {
    organizationId,
    connectorTypeId,
    direction: body?.direction,
    config: body?.config,
    credentials: body?.credentials,
  })
})
