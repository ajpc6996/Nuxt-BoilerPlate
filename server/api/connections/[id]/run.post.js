import { executeConnection } from '~~/server/utils/connectors/executeConnection.js'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const body = await readBody(event)
  const organizationId = body?.organizationId
  const mode = body?.mode === 'test' ? 'test' : 'run'

  if (!id || !organizationId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'id and organizationId are required',
    })
  }

  const { user } = await requireOrgAdmin(event, organizationId)

  const admin = useSupabaseAdmin()
  const { data: connection } = await admin
    .from('connections')
    .select('id')
    .eq('id', id)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (!connection) {
    throw createError({ statusCode: 404, statusMessage: 'Connection not found' })
  }

  const result = await executeConnection({
    connectionId: id,
    mode,
    userId: user.id,
  })

  return result
})
