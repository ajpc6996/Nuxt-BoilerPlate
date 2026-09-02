export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const organizationId = String(query.organizationId || '')
  if (!organizationId) {
    throw createError({ statusCode: 400, statusMessage: 'organizationId is required' })
  }

  await requireOrgAdmin(event, organizationId)
  const admin = useSupabaseAdmin()

  const { data, error } = await admin
    .from('migration_projects')
    .select('id, name, description, status, source_connection_id, destination_connection_id, default_run_mode, sample_limit, reset_ingest_before_run, created_at, updated_at')
    .eq('organization_id', organizationId)
    .order('name')

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { items: data || [] }
})
