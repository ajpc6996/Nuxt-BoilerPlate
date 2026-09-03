import { loadMigrationProject, loadMigrationStages } from '~~/server/utils/migrations.js'

/**
 * Reorder migration stages. Body: { organizationId, stageIds: string[] }
 * Sets sort_order to each id's index and mirrors onto linked data_sources.
 */
export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, 'id')
  const body = await readBody(event)
  const organizationId = String(body?.organizationId || '')
  const stageIds = Array.isArray(body?.stageIds)
    ? body.stageIds.map((id) => String(id || '').trim()).filter(Boolean)
    : []

  if (!projectId || !organizationId || !stageIds.length) {
    throw createError({
      statusCode: 400,
      statusMessage: 'id, organizationId, and stageIds are required',
    })
  }

  await requireOrgAdmin(event, organizationId)
  const admin = useSupabaseAdmin()

  await loadMigrationProject(admin, projectId, organizationId)
  const existing = await loadMigrationStages(admin, projectId)
  const existingIds = new Set(existing.map((s) => String(s.id)))

  if (stageIds.length !== existing.length || stageIds.some((id) => !existingIds.has(id))) {
    throw createError({
      statusCode: 400,
      statusMessage: 'stageIds must list every stage for this migration exactly once',
    })
  }

  for (let i = 0; i < stageIds.length; i += 1) {
    const stageId = stageIds[i]
    const { error: stageError } = await admin
      .from('migration_stages')
      .update({ sort_order: i })
      .eq('id', stageId)
      .eq('migration_project_id', projectId)
      .eq('organization_id', organizationId)

    if (stageError) {
      throw createError({ statusCode: 500, statusMessage: stageError.message })
    }

    const { error: flowError } = await admin
      .from('data_sources')
      .update({ migration_sort_order: i })
      .eq('migration_stage_id', stageId)
      .eq('migration_project_id', projectId)
      .eq('organization_id', organizationId)

    if (flowError) {
      throw createError({ statusCode: 500, statusMessage: flowError.message })
    }
  }

  const stages = await loadMigrationStages(admin, projectId)
  return { stages }
})
