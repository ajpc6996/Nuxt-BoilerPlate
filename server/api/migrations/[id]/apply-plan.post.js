import { loadMigrationProject } from '~~/server/utils/migrations.js'
import { proposeMigrationPlan } from '~~/server/utils/migrations/proposeMigrationPlan.js'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const body = await readBody(event)
  const organizationId = String(body?.organizationId || '')

  if (!id || !organizationId) {
    throw createError({ statusCode: 400, statusMessage: 'id and organizationId are required' })
  }

  await requireOrgAdmin(event, organizationId)
  const admin = useSupabaseAdmin()

  const project = await loadMigrationProject(admin, id, organizationId)
  const planConfig = project.plan_config && typeof project.plan_config === 'object'
    ? project.plan_config
    : {}

  const proposed = await proposeMigrationPlan({
    description: body?.description || project.description || project.name,
    sourceSummary: body?.sourceSummary || planConfig.sourceSummary,
    destinationSummary: body?.destinationSummary || planConfig.destinationSummary,
    docsUrl: body?.docsUrl,
    entities: planConfig.entities,
  })

  await admin
    .from('migration_stages')
    .delete()
    .eq('migration_project_id', id)

  const stageRows = (proposed.stages || []).map((stage, i) => ({
    migration_project_id: id,
    organization_id: organizationId,
    sort_order: stage.sortOrder ?? i,
    name: stage.name,
    description: stage.description || null,
    stage_type: stage.stageType,
    entity_key: stage.entityKey || '',
    status: stage.status || 'draft',
    config: stage.config || {},
  }))

  let stages = []
  if (stageRows.length) {
    const { data, error } = await admin
      .from('migration_stages')
      .insert(stageRows)
      .select('*')

    if (error) {
      throw createError({ statusCode: 400, statusMessage: error.message })
    }
    stages = data || []
  }

  const { data: updated, error: updateError } = await admin
    .from('migration_projects')
    .update({
      status: 'planning',
      plan_config: {
        ...planConfig,
        ...proposed.planConfig,
        aiNotes: proposed.generationNotes || proposed.planConfig?.aiNotes || '',
      },
    })
    .eq('id', id)
    .select('*')
    .single()

  if (updateError) {
    throw createError({ statusCode: 400, statusMessage: updateError.message })
  }

  return { item: updated, stages, proposed }
})
