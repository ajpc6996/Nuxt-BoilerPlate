import { parseMigrationStageBody } from '~~/server/utils/migrations.js'
import { loadMigrationProject } from '~~/server/utils/migrations.js'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const body = await readBody(event)
  const organizationId = String(body?.organizationId || '')
  const parsed = parseMigrationStageBody(body)

  if (!id || !organizationId || !parsed.name) {
    throw createError({ statusCode: 400, statusMessage: 'id, organizationId, and name are required' })
  }

  await requireOrgAdmin(event, organizationId)
  const admin = useSupabaseAdmin()

  await loadMigrationProject(admin, id, organizationId)

  const { data: item, error } = await admin
    .from('migration_stages')
    .insert({
      migration_project_id: id,
      organization_id: organizationId,
      sort_order: parsed.sortOrder,
      name: parsed.name,
      description: parsed.description || null,
      stage_type: parsed.stageType,
      entity_key: parsed.entityKey || '',
      status: parsed.status,
      config: parsed.config,
    })
    .select('*')
    .single()

  if (error || !item) {
    throw createError({ statusCode: 400, statusMessage: error?.message || 'Create stage failed' })
  }

  return { item }
})
