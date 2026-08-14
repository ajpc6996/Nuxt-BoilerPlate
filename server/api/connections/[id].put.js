import { normalizeConnectionDirection } from '~~/shared/connectionDirection.js'
import {
  decryptSecrets,
  encryptSecrets,
} from '~~/server/utils/connectorCrypto.js'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const body = await readBody(event)
  const organizationId = body?.organizationId

  if (!id || !organizationId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'id and organizationId are required',
    })
  }

  await requireOrgAdmin(event, organizationId)
  const admin = useSupabaseAdmin()

  const { data: existing, error: existingError } = await admin
    .from('connections')
    .select('id')
    .eq('id', id)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (existingError || !existing) {
    throw createError({ statusCode: 404, statusMessage: 'Connection not found' })
  }

  /** @type {Record<string, unknown>} */
  const patch = {
    updated_at: new Date().toISOString(),
  }

  if (body.name != null) patch.name = String(body.name).trim()
  if (body.direction != null) patch.direction = normalizeConnectionDirection(body.direction)
  if (body.config && typeof body.config === 'object') patch.config = body.config
  if (body.status != null) patch.status = body.status

  const { data, error } = await admin
    .from('connections')
    .update(patch)
    .eq('id', id)
    .select('id, name, status, config, direction, last_error, updated_at, connector_type_id')
    .single()

  if (error) {
    throw createError({ statusCode: 400, statusMessage: error.message })
  }

  if (body.credentials && typeof body.credentials === 'object') {
    const incoming = body.credentials
    const hasNew = Object.values(incoming).some(
      (v) => v != null && String(v).trim() !== '',
    )
    if (hasNew) {
      const { data: secretRow } = await admin
        .from('connection_secrets')
        .select('ciphertext')
        .eq('connection_id', id)
        .maybeSingle()

      const previous = secretRow?.ciphertext
        ? decryptSecrets(secretRow.ciphertext)
        : {}

      const merged = { ...previous }
      Object.entries(incoming).forEach(([key, value]) => {
        if (value != null && String(value).trim() !== '') {
          merged[key] = value
        }
      })

      const ciphertext = encryptSecrets(merged)
      const { error: secretError } = await admin.from('connection_secrets').upsert({
        connection_id: id,
        ciphertext,
        updated_at: new Date().toISOString(),
      })
      if (secretError) {
        throw createError({ statusCode: 500, statusMessage: secretError.message })
      }
    }
  }

  return { item: data }
})
