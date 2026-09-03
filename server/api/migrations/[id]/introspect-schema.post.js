import { introspectMigrationSchemas } from '~~/server/utils/migrations/introspectMigrationSchema.js'
import { loadMigrationProject, loadMigrationStages } from '~~/server/utils/migrations.js'
import { cleanEntityKey } from '~~/shared/migration.js'

/**
 * Merge plan entities with stage table names so introspection uses Users/Tickets, not users.
 * @param {Array<Record<string, unknown>>} planEntities
 * @param {Array<Record<string, unknown>>} stages
 */
function mergeIntrospectEntities(planEntities, stages) {
  /** @type {Map<string, { key: string, sourceEntity: string, destinationEntity: string }>} */
  const byKey = new Map()

  const upsert = (raw) => {
    const key = cleanEntityKey(raw?.key ?? raw?.entity_key)
    if (!key) return
    const prev = byKey.get(key) || { key, sourceEntity: '', destinationEntity: '' }
    const sourceEntity = String(raw?.sourceEntity || raw?.source_entity || prev.sourceEntity || '').trim()
    const destinationEntity = String(
      raw?.destinationEntity || raw?.destination_entity || raw?.destinationTable || prev.destinationEntity || '',
    ).trim()
    byKey.set(key, {
      key,
      sourceEntity: sourceEntity || prev.sourceEntity,
      destinationEntity: destinationEntity || prev.destinationEntity,
    })
  }

  for (const ent of planEntities || []) upsert(ent)
  for (const stage of stages || []) {
    const cfg = stage?.config && typeof stage.config === 'object' ? stage.config : {}
    upsert({
      key: stage.entity_key || stage.entityKey,
      sourceEntity: cfg.sourceEntity,
      destinationEntity: cfg.destinationEntity || cfg.destinationTable,
    })
  }

  return [...byKey.values()]
}

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
  const stages = await loadMigrationStages(admin, id)
  const planConfig = project.plan_config && typeof project.plan_config === 'object'
    ? project.plan_config
    : {}

  const planEntities = Array.isArray(body?.entities)
    ? body.entities
    : (Array.isArray(planConfig.entities) ? planConfig.entities : [])

  const entities = mergeIntrospectEntities(planEntities, stages)

  const schemas = await introspectMigrationSchemas(admin, {
    organizationId,
    sourceConnectionId: body?.sourceConnectionId || project.source_connection_id,
    destinationConnectionId: body?.destinationConnectionId || project.destination_connection_id,
    entities,
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
