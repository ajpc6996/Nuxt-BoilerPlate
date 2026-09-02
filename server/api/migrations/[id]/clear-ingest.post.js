import { clearMigrationIngestTables } from '~~/server/utils/migrations/clearMigrationIngest.js'
import { loadMigrationProject } from '~~/server/utils/migrations.js'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const body = await readBody(event)
  const organizationId = String(body?.organizationId || '')

  if (!id || !organizationId) {
    throw createError({ statusCode: 400, statusMessage: 'id and organizationId are required' })
  }

  await requireOrgAdmin(event, organizationId)
  const admin = useSupabaseAdmin()

  await loadMigrationProject(admin, id, organizationId)

  const result = await clearMigrationIngestTables(admin, id, organizationId)

  return {
    ok: true,
    ...result,
  }
})
