import { testConnectionConnectivity } from '~~/server/utils/connectors/testConnection.js'

/**
 * Test a saved connection (host + credentials) without running a data flow.
 * Optional body.config / body.credentials override the saved values for a draft test.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const body = await readBody(event)
  const organizationId = String(body?.organizationId || '')

  if (!id || !organizationId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'id and organizationId are required',
    })
  }

  await requireOrgAdmin(event, organizationId)
  const admin = useSupabaseAdmin()

  return testConnectionConnectivity(admin, {
    organizationId,
    connectionId: id,
    direction: body?.direction,
    config: body?.config,
    credentials: body?.credentials,
  })
})
