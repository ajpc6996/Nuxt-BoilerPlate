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
    .from('connections')
    .select('id, name, status, config, direction, sync_state, last_error, created_at, updated_at, connector_type_id, connector_types(*)')
    .eq('id', id)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (error || !data) {
    throw createError({ statusCode: 404, statusMessage: 'Connection not found' })
  }

  const { data: secretRow } = await admin
    .from('connection_secrets')
    .select('connection_id')
    .eq('connection_id', id)
    .maybeSingle()

  const { count } = await admin
    .from('data_sources')
    .select('id', { count: 'exact', head: true })
    .eq('connection_id', id)

  return {
    item: {
      ...data,
      hasSecrets: Boolean(secretRow),
      dataSourceCount: count || 0,
    },
  }
})
