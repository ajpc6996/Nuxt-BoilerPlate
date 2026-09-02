import {
  decodeJwtHeader,
  parseJwksJson,
  userFromJwtPayload,
  verifySupabaseAccessToken,
} from '~~/shared/verifySupabaseJwt.js'

/**
 * @param {import('h3').H3Event} event
 * @returns {string|null}
 */
export function getBearerToken(event) {
  const authHeader = getHeader(event, 'authorization') || ''
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
}

/**
 * @param {import('h3').RuntimeConfig} config
 */
function getLocalJwtVerificationOptions(config) {
  return {
    secret: config.supabaseJwtSecret || '',
    jwks: parseJwksJson(config.supabaseJwksJson),
  }
}

/**
 * Validate a Supabase Auth access token server-side.
 * Prefers local verification (JWKS for ES256/RS256, secret for HS256) so auth
 * works when Node cannot reach Supabase over HTTPS (corporate VPN / TLS MITM).
 *
 * @param {string} token
 */
export async function verifyAccessToken(token) {
  const config = useRuntimeConfig()
  const localOptions = getLocalJwtVerificationOptions(config)
  const hasLocalVerifier = Boolean(localOptions.secret || localOptions.jwks)

  if (hasLocalVerifier) {
    const payload = verifySupabaseAccessToken(token, localOptions)
    const user = payload ? userFromJwtPayload(payload) : null
    if (user) {
      return { user, error: null }
    }

    if (import.meta.dev) {
      const header = decodeJwtHeader(token)
      console.warn('[auth] local JWT verification failed', {
        alg: header?.alg || 'unknown',
        kid: header?.kid || null,
        hasJwtSecret: Boolean(localOptions.secret),
        hasJwks: Boolean(localOptions.jwks?.keys?.length),
      })
    }

    return {
      user: null,
      error: new Error('Local JWT verification failed'),
    }
  }

  const admin = useSupabaseAdmin()
  const {
    data: { user },
    error,
  } = await admin.auth.getUser(token)

  return { user: user || null, error }
}

/**
 * @param {import('h3').H3Event} event
 */
export async function requireVerifiedUser(event) {
  const token = getBearerToken(event)
  if (!token) {
    throw createError({ statusCode: 401, statusMessage: 'Missing access token' })
  }

  const { user, error } = await verifyAccessToken(token)
  if (error || !user) {
    const config = useRuntimeConfig()
    const localOptions = getLocalJwtVerificationOptions(config)
    const header = decodeJwtHeader(token)
    const alg = header?.alg || 'unknown'
    const tlsIssue = /self-signed certificate/i.test(String(error?.cause?.message || error?.message || ''))

    let statusMessage = 'Invalid session'
    if (localOptions.jwks || localOptions.secret) {
      statusMessage = alg === 'HS256'
        ? 'Invalid session — check SUPABASE_JWT_SECRET matches Dashboard → API → JWT Secret'
        : 'Invalid session — check SUPABASE_JWKS_JSON matches your project JWKS (Dashboard → JWT signing keys)'
    }
    else if (tlsIssue) {
      statusMessage = 'Invalid session — set SUPABASE_JWKS_JSON in .env for VPN / corporate TLS inspection'
    }

    throw createError({ statusCode: 401, statusMessage })
  }

  return { user, token }
}

/**
 * @param {string} token
 */
export function decodeJwtPayload(token) {
  try {
    const part = token.split('.')[1]
    const json = Buffer.from(part, 'base64url').toString('utf8')
    return JSON.parse(json)
  }
  catch {
    return null
  }
}
