import { parseMigrationStageBody } from '~~/server/utils/migrations.js'

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, 'id')
  const stageId = getRouterParam(event, 'stageId')
  const body = await readBody(event)
  const organizationId = String(body?.organizationId || '')
  const parsed = parseMigrationStageBody(body)

  if (!projectId || !stageId || !organizationId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'id, stageId, and organizationId are required',
    })
  }

  await requireOrgAdmin(event, organizationId)
  const admin = useSupabaseAdmin()

  const patch = {}
  if (body?.name != null) patch.name = parsed.name
  if (body?.description != null) patch.description = parsed.description || null
  if (body?.sortOrder != null) patch.sort_order = parsed.sortOrder
  if (body?.stageType != null) patch.stage_type = parsed.stageType
  if (body?.entityKey != null) patch.entity_key = parsed.entityKey
  if (body?.status != null) patch.status = parsed.status
  if (body?.config != null) patch.config = parsed.config

  const { data: item, error } = await admin
    .from('migration_stages')
    .update(patch)
    .eq('id', stageId)
    .eq('migration_project_id', projectId)
    .eq('organization_id', organizationId)
    .select('*')
    .single()

  if (error || !item) {
    throw createError({ statusCode: 400, statusMessage: error?.message || 'Update stage failed' })
  }

  return { item }
})
