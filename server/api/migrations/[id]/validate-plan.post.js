import { validateMigrationProjectPlan } from '~~/server/utils/migrations/validateMigrationPlan.js'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const body = await readBody(event)
  const organizationId = String(body?.organizationId || '')

  if (!id || !organizationId) {
    throw createError({ statusCode: 400, statusMessage: 'id and organizationId are required' })
  }

  await requireOrgAdmin(event, organizationId)
  const admin = useSupabaseAdmin()

  const persist = body?.persist !== false
  const result = await validateMigrationProjectPlan(admin, {
    projectId: id,
    organizationId,
    persist,
  })

  return result
})
