import { parseMigrationStageBody } from '~~/server/utils/migrations.js'
import { loadMigrationProject, loadMigrationStages } from '~~/server/utils/migrations.js'

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
  const existing = await loadMigrationStages(admin, id)

  const insertAtRaw = body?.insertAt ?? body?.insert_at
  const hasInsertAt = insertAtRaw != null && insertAtRaw !== ''
  const insertAt = hasInsertAt ? Math.max(0, Math.floor(Number(insertAtRaw))) : null

  let sortOrder = parsed.sortOrder
  if (hasInsertAt && Number.isFinite(insertAt)) {
    sortOrder = insertAt
    const toBump = existing
      .filter((s) => (Number(s.sort_order) || 0) >= sortOrder)
      .sort((a, b) => (Number(b.sort_order) || 0) - (Number(a.sort_order) || 0))
    for (const stage of toBump) {
      const next = (Number(stage.sort_order) || 0) + 1
      const { error: bumpError } = await admin
        .from('migration_stages')
        .update({ sort_order: next })
        .eq('id', stage.id)
        .eq('migration_project_id', id)
      if (bumpError) {
        throw createError({ statusCode: 500, statusMessage: bumpError.message })
      }
    }
  }
  else if (body?.sortOrder == null && body?.sort_order == null) {
    sortOrder = existing.reduce((max, s) => Math.max(max, Number(s.sort_order) || 0), -1) + 1
  }

  const { data: item, error } = await admin
    .from('migration_stages')
    .insert({
      migration_project_id: id,
      organization_id: organizationId,
      sort_order: sortOrder,
      name: parsed.name,
      description: parsed.description || null,
      stage_type: parsed.stageType,
      entity_key: parsed.entityKey || '',
      status: parsed.status || 'draft',
      config: parsed.config,
    })
    .select('*')
    .single()

  if (error || !item) {
    throw createError({ statusCode: 400, statusMessage: error?.message || 'Create stage failed' })
  }

  return { item }
})
