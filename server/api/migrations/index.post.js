import { parseMigrationProjectBody } from '~~/server/utils/migrations.js'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const organizationId = String(body?.organizationId || '')
  const parsed = parseMigrationProjectBody(body)

  if (!organizationId || !parsed.name) {
    throw createError({ statusCode: 400, statusMessage: 'organizationId and name are required' })
  }

  const { user } = await requireOrgAdmin(event, organizationId)
  const admin = useSupabaseAdmin()

  const { data: item, error } = await admin
    .from('migration_projects')
    .insert({
      organization_id: organizationId,
      name: parsed.name,
      description: parsed.description || null,
      status: parsed.status || 'draft',
      source_connection_id: parsed.sourceConnectionId || null,
      destination_connection_id: parsed.destinationConnectionId || null,
      plan_config: parsed.planConfig,
      default_run_mode: parsed.defaultRunMode,
      sample_limit: parsed.sampleLimit,
      reset_ingest_before_run: parsed.resetIngestBeforeRun,
      created_by: user.id,
    })
    .select('*')
    .single()

  if (error || !item) {
    throw createError({ statusCode: 400, statusMessage: error?.message || 'Create failed' })
  }

  return { item }
})
