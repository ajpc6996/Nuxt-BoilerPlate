export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const organizationId = String(query.organizationId || '')
  if (!organizationId) {
    throw createError({ statusCode: 400, statusMessage: 'organizationId is required' })
  }

  await requireOrgAdmin(event, organizationId)

  const admin = useSupabaseAdmin()
  const { data, error } = await admin
    .from('connections')
    .select('id, name, status, destination_table, config, last_run_at, last_error, created_at, updated_at, connector_type_id, connector_types(id, key, name, category, auth_mode)')
    .eq('organization_id', organizationId)
    .order('name')

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { items: data || [] }
})
