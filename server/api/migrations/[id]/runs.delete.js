import { loadMigrationProject } from '~~/server/utils/migrations.js'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const query = getQuery(event)
  const organizationId = String(query.organizationId || '')

  if (!id || !organizationId) {
    throw createError({ statusCode: 400, statusMessage: 'id and organizationId are required' })
  }

  await requireOrgAdmin(event, organizationId)
  const admin = useSupabaseAdmin()

  await loadMigrationProject(admin, id, organizationId)

  const { error, count } = await admin
    .from('migration_runs')
    .delete({ count: 'exact' })
    .eq('migration_project_id', id)
    .eq('organization_id', organizationId)

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { ok: true, deleted: count || 0 }
})
