import { materializeMigrationStages } from '~~/server/utils/migrations/materialize.js'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const body = await readBody(event)
  const organizationId = String(body?.organizationId || '')

  if (!id || !organizationId) {
    throw createError({ statusCode: 400, statusMessage: 'id and organizationId are required' })
  }

  const { user, isPlatformAdmin } = await requireOrgAdmin(event, organizationId)
  const admin = useSupabaseAdmin()

  await assertLicenceAllows(admin, {
    organizationId,
    isPlatformAdmin,
    feature: 'dataSources',
  })

  const result = await materializeMigrationStages(admin, {
    projectId: id,
    organizationId,
    userId: user.id,
    isPlatformAdmin,
  })

  return result
})
