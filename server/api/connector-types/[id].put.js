export default defineEventHandler(async (event) => {
  await requirePlatformAdmin(event)
  const id = getRouterParam(event, 'id')
  const body = await readBody(event)

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'id is required' })
  }

  /** @type {Record<string, unknown>} */
  const patch = { updated_at: new Date().toISOString() }

  if (body.name != null) patch.name = String(body.name).trim()
  if (body.description != null) patch.description = String(body.description)
  if (body.is_enabled != null) patch.is_enabled = Boolean(body.is_enabled)
  if (body.config_schema != null) patch.config_schema = body.config_schema
  if (body.credential_schema != null) patch.credential_schema = body.credential_schema
  if (body.capabilities != null) patch.capabilities = body.capabilities

  const admin = useSupabaseAdmin()
  const { data, error } = await admin
    .from('connector_types')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()

  if (error) {
    throw createError({ statusCode: 400, statusMessage: error.message })
  }

  return { item: data }
})
