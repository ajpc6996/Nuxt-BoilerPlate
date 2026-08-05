export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const query = getQuery(event)
  const organizationId = String(query.organizationId || '')

  if (!id || !organizationId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'id and organizationId are required',
    })
  }

  await requireOrgAdmin(event, organizationId)
  const admin = useSupabaseAdmin()

  const { data, error } = await admin
    .from('data_sources')
    .select('id, name, status, destination_table, config, pipeline, sync_state, last_run_at, last_error, created_at, updated_at, connection_id, connections(id, name, connector_type_id, connector_types(*))')
    .eq('id', id)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (error || !data) {
    throw createError({ statusCode: 404, statusMessage: 'Data source not found' })
  }

  return { item: data }
})
