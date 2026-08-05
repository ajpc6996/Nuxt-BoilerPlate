import { normalizeProposedType } from '~~/server/utils/connectors/proposeConnectorType.js'

export default defineEventHandler(async (event) => {
  await requirePlatformAdmin(event)
  const body = await readBody(event)

  const proposed = normalizeProposedType(body || {})
  if (!proposed.name || !proposed.key) {
    throw createError({ statusCode: 400, statusMessage: 'name and key are required' })
  }

  const admin = useSupabaseAdmin()
  const { data, error } = await admin
    .from('connector_types')
    .insert({
      key: proposed.key,
      name: proposed.name,
      description: proposed.description,
      category: proposed.category,
      auth_mode: proposed.auth_mode,
      runner_key: proposed.runner_key,
      connection_schema: proposed.connection_schema,
      config_schema: proposed.config_schema,
      credential_schema: proposed.credential_schema,
      capabilities: proposed.capabilities,
      generation_notes: proposed.generation_notes || null,
      is_system: false,
      is_enabled: body?.is_enabled !== false,
    })
    .select('*')
    .single()

  if (error) {
    throw createError({ statusCode: 400, statusMessage: error.message })
  }

  return { item: data }
})
