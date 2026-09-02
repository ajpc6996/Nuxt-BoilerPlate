import { introspectMigrationSchemas } from '~~/server/utils/migrations/introspectMigrationSchema.js'
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

  const project = await loadMigrationProject(admin, id, organizationId)
  const planConfig = project.plan_config && typeof project.plan_config === 'object'
    ? project.plan_config
    : {}

  const entities = Array.isArray(body?.entities)
    ? body.entities
    : (Array.isArray(planConfig.entities) ? planConfig.entities : [])

  const schemas = await introspectMigrationSchemas(admin, {
    organizationId,
    sourceConnectionId: body?.sourceConnectionId || project.source_connection_id,
    destinationConnectionId: body?.destinationConnectionId || project.destination_connection_id,
    entities: entities.map((e) => ({
      key: e?.key,
      sourceEntity: e?.sourceEntity || e?.source_entity,
      destinationEntity: e?.destinationEntity || e?.destination_entity,
    })),
  })

  const nextPlanConfig = {
    ...planConfig,
    planVersion: Math.max(Number(planConfig.planVersion) || 1, 2),
    schemas,
  }

  const { data: updated, error } = await admin
    .from('migration_projects')
    .update({ plan_config: nextPlanConfig })
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select('*')
    .single()

  if (error) {
    throw createError({ statusCode: 400, statusMessage: error.message })
  }

  return { schemas, item: updated }
})
