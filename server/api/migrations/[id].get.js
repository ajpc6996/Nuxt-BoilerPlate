import { loadMigrationProject, loadMigrationStages } from '~~/server/utils/migrations.js'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const query = getQuery(event)
  const organizationId = String(query.organizationId || '')

  if (!id || !organizationId) {
    throw createError({ statusCode: 400, statusMessage: 'id and organizationId are required' })
  }

  await requireOrgAdmin(event, organizationId)
  const admin = useSupabaseAdmin()

  const project = await loadMigrationProject(admin, id, organizationId)
  const stages = await loadMigrationStages(admin, id)

  const { data: runs } = await admin
    .from('migration_runs')
    .select('id, run_mode, status, run_tag, started_at, completed_at, last_error')
    .eq('migration_project_id', id)
    .order('started_at', { ascending: false })
    .limit(10)

  return { item: project, stages, runs: runs || [] }
})
