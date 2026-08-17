import { runMigrationProject } from '~~/server/utils/migrations/runMigration.js'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const body = await readBody(event)
  const organizationId = String(body?.organizationId || '')
  const runMode = body?.runMode === 'full' || body?.runMode === 'pilot' ? body.runMode : 'sample'

  if (!id || !organizationId) {
    throw createError({ statusCode: 400, statusMessage: 'id and organizationId are required' })
  }

  const { user, isPlatformAdmin } = await requireOrgAdmin(event, organizationId)
  const admin = useSupabaseAdmin()

  return runMigrationProject(admin, {
    projectId: id,
    organizationId,
    userId: user.id,
    isPlatformAdmin,
    runMode,
    stageIds: Array.isArray(body?.stageIds) ? body.stageIds : undefined,
  })
})
