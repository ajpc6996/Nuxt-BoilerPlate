export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const organizationId = String(query.organizationId || '')
  if (!organizationId) {
    throw createError({ statusCode: 400, statusMessage: 'organizationId is required' })
  }

  await requireOrgAdmin(event, organizationId)

  const admin = useSupabaseAdmin()
  const { data, error } = await admin
    .from('data_sources')
    .select('id, name, status, destination_table, config, last_run_at, last_error, created_at, updated_at, connection_id, connections(id, name, connector_types(id, key, name, runner_key, capabilities, config_schema))')
    .eq('organization_id', organizationId)
    .order('name')

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { items: data || [] }
})
