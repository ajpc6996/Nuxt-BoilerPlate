import { decryptSecrets } from '~~/server/utils/connectorCrypto.js'

const COMMON_CREDENTIAL_KEYS = [
  'username',
  'password',
  'apiKey',
  'clientSecret',
  'accessToken',
  'refreshToken',
]

/**
 * @param {Record<string, unknown>} properties
 * @param {string} key
 */
function credentialFieldLabel(properties, key) {
  const def = properties?.[key]
  if (def && typeof def === 'object' && def.title) return String(def.title)
  return key
}

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

  const { data: connection, error } = await admin
    .from('connections')
    .select('id, config, connector_types(credential_schema, connection_schema, auth_mode)')
    .eq('id', id)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (error || !connection) {
    throw createError({ statusCode: 404, statusMessage: 'Connection not found' })
  }

  const { data: secretRow } = await admin
    .from('connection_secrets')
    .select('ciphertext')
    .eq('connection_id', id)
    .maybeSingle()

  const credentialSchema = connection.connector_types?.credential_schema
  const properties = credentialSchema?.properties && typeof credentialSchema.properties === 'object'
    ? credentialSchema.properties
    : {}

  const decrypted = secretRow?.ciphertext ? decryptSecrets(secretRow.ciphertext) : {}
  const schemaKeys = Object.keys(properties)
  const decryptedKeys = Object.keys(decrypted).filter(
    (key) => decrypted[key] != null && String(decrypted[key]).trim() !== '',
  )

  const fieldKeys = [...new Set([
    ...schemaKeys,
    ...COMMON_CREDENTIAL_KEYS.filter((key) => decryptedKeys.includes(key)),
    ...decryptedKeys,
  ])]

  /** @type {Record<string, string>} */
  const credentials = {}
  /** @type {Record<string, string>} */
  const fieldLabels = {}

  for (const key of fieldKeys) {
    fieldLabels[key] = credentialFieldLabel(properties, key)
    const secretValue = decrypted[key]
    if (secretValue != null && String(secretValue).trim() !== '') {
      credentials[key] = String(secretValue)
    }
  }

  // Some connectors may store username in connection config (non-secret).
  if (!credentials.username) {
    const configUsername = connection.config?.username
    if (configUsername != null && String(configUsername).trim() !== '') {
      credentials.username = String(configUsername)
      if (!fieldLabels.username) fieldLabels.username = 'Username'
    }
  }

  return {
    credentials,
    fieldLabels,
    hasSecrets: Boolean(secretRow),
    credentialFields: fieldKeys,
  }
})
