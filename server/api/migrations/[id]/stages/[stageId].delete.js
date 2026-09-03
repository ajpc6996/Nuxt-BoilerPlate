import { loadMigrationProject } from '~~/server/utils/migrations.js'

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, 'id')
  const stageId = getRouterParam(event, 'stageId')
  const query = getQuery(event)
  const organizationId = String(query.organizationId || '')

  if (!projectId || !stageId || !organizationId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'id, stageId, and organizationId are required',
    })
  }

  await requireOrgAdmin(event, organizationId)
  const admin = useSupabaseAdmin()

  await loadMigrationProject(admin, projectId, organizationId)

  const { error } = await admin
    .from('migration_stages')
    .delete()
    .eq('id', stageId)
    .eq('migration_project_id', projectId)
    .eq('organization_id', organizationId)

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { ok: true }
})
