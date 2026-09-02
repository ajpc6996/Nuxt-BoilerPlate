import { parseMigrationProjectBody } from '~~/server/utils/migrations.js'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const body = await readBody(event)
  const organizationId = String(body?.organizationId || '')
  const parsed = parseMigrationProjectBody(body)

  if (!id || !organizationId) {
    throw createError({ statusCode: 400, statusMessage: 'id and organizationId are required' })
  }

  await requireOrgAdmin(event, organizationId)
  const admin = useSupabaseAdmin()

  const patch = {}
  if (body?.name != null) patch.name = parsed.name
  if (body?.description != null) patch.description = parsed.description || null
  if (body?.status != null) patch.status = parsed.status
  if (body?.sourceConnectionId != null) patch.source_connection_id = parsed.sourceConnectionId || null
  if (body?.destinationConnectionId != null) patch.destination_connection_id = parsed.destinationConnectionId || null
  if (body?.planConfig != null) patch.plan_config = parsed.planConfig
  if (body?.defaultRunMode != null) patch.default_run_mode = parsed.defaultRunMode
  if (body?.sampleLimit != null) patch.sample_limit = parsed.sampleLimit
  if (body?.resetIngestBeforeRun != null) patch.reset_ingest_before_run = parsed.resetIngestBeforeRun

  const { data: item, error } = await admin
    .from('migration_projects')
    .update(patch)
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select('*')
    .single()

  if (error || !item) {
    throw createError({ statusCode: 400, statusMessage: error?.message || 'Update failed' })
  }

  return { item }
})
