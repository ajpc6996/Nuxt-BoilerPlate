import { executeDataSource } from '~~/server/utils/connectors/executeConnection.js'

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

  const { user, isPlatformAdmin } = await requireOrgAdmin(event, organizationId)

  const admin = useSupabaseAdmin()
  await assertLicenceAllows(admin, {
    organizationId,
    isPlatformAdmin,
    feature: 'dataSources',
  })

  const { data: dataSource } = await admin
    .from('data_sources')
    .select('id')
    .eq('id', id)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (!dataSource) {
    throw createError({ statusCode: 404, statusMessage: 'Data source not found' })
  }

  return executeDataSource({
    dataSourceId: id,
    mode,
    userId: user.id,
    isPlatformAdmin,
  })
})
