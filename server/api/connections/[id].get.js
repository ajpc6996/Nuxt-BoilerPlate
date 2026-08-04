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
    .select('id, name, status, destination_table, config, sync_state, last_run_at, last_error, created_at, updated_at, connector_type_id, connector_types(*)')
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

  return {
    item: {
      ...data,
      hasSecrets: Boolean(secretRow),
    },
  }
})
