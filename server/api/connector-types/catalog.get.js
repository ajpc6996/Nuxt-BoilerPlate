/**
 * Enabled connector types for connection forms (org admin or platform).
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const organizationId = String(query.organizationId || '')
  if (!organizationId) {
    throw createError({ statusCode: 400, statusMessage: 'organizationId is required' })
  }

  await requireOrgAdmin(event, organizationId)

  const admin = useSupabaseAdmin()
  const { data, error } = await admin
    .from('connector_types')
    .select('id, key, name, description, category, auth_mode, config_schema, credential_schema, capabilities, is_enabled')
    .eq('is_enabled', true)
    .order('name')

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { items: data || [] }
})
