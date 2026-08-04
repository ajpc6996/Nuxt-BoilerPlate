import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

/**
 * Encrypt connection secrets for storage. Requires CONNECTOR_SECRETS_KEY.
 * @param {Record<string, unknown>} payload
 * @returns {string}
 */
export function encryptSecrets(payload) {
  const key = getSecretsKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const plaintext = Buffer.from(JSON.stringify(payload || {}), 'utf8')
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag = cipher.getAuthTag()
  return [
    'v1',
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.')
}

/**
 * @param {string} ciphertext
 * @returns {Record<string, unknown>}
 */
export function decryptSecrets(ciphertext) {
  if (!ciphertext) return {}
  const [version, ivB64, tagB64, dataB64] = String(ciphertext).split('.')
  if (version !== 'v1' || !ivB64 || !tagB64 || !dataB64) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Invalid secret ciphertext format',
    })
  }
  const key = getSecretsKey()
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(ivB64, 'base64url'),
  )
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'))
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64url')),
    decipher.final(),
  ])
  return JSON.parse(decrypted.toString('utf8'))
}

/**
 * @returns {Buffer}
 */
function getSecretsKey() {
  const config = useRuntimeConfig()
  const secret = config.connectorSecretsKey || ''
  if (!secret) {
    throw createError({
      statusCode: 500,
      statusMessage:
        'CONNECTOR_SECRETS_KEY is not configured (required to store connection secrets)',
    })
  }
  return createHash('sha256').update(String(secret)).digest()
}

/**
 * Validate destination table as a safe SQL identifier fragment.
 * @param {string} name
 * @returns {string}
 */
export function sanitizeDestinationTable(name) {
  const cleaned = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/^_+/, '')
    .slice(0, 63)

  if (!cleaned || !/^[a-z][a-z0-9_]*$/.test(cleaned)) {
    throw createError({
      statusCode: 400,
      statusMessage:
        'destination_table must start with a letter and use only a-z, 0-9, underscore',
    })
  }
  return cleaned
}
