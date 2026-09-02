import { createPublicKey, createVerify, timingSafeEqual, createHmac } from 'node:crypto'

/**
 * @param {string} segment
 */
function decodeBase64Url(segment) {
  return Buffer.from(segment, 'base64url')
}

/**
 * @param {string} token
 */
export function decodeJwtHeader(token) {
  const parts = String(token || '').split('.')
  if (parts.length < 2) return null
  try {
    return JSON.parse(decodeBase64Url(parts[0]).toString('utf8'))
  }
  catch {
    return null
  }
}

/**
 * @param {string} token
 * @returns {Record<string, unknown>|null}
 */
export function decodeJwtPayloadUnsafe(token) {
  const parts = String(token || '').split('.')
  if (parts.length < 2) return null
  try {
    return JSON.parse(decodeBase64Url(parts[1]).toString('utf8'))
  }
  catch {
    return null
  }
}

/**
 * @param {Record<string, unknown>} payload
 */
function isPayloadFresh(payload) {
  if (!payload?.exp) return true
  return Number(payload.exp) * 1000 >= Date.now()
}

/**
 * @param {string} token
 * @param {string} secret
 * @returns {Record<string, unknown>|null}
 */
export function verifySupabaseHs256Jwt(token, secret) {
  if (!token || !secret) return null

  const parts = String(token).split('.')
  if (parts.length !== 3) return null

  const header = decodeJwtHeader(token)
  if (header?.alg !== 'HS256') return null

  const [headerB64, payloadB64, signatureB64] = parts
  const expected = createHmac('sha256', secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url')

  const sigBuf = Buffer.from(signatureB64)
  const expBuf = Buffer.from(expected)
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return null
  }

  const payload = decodeJwtPayloadUnsafe(token)
  if (!payload || !isPayloadFresh(payload)) return null
  return payload
}

/**
 * @param {string} token
 * @param {Record<string, unknown>} jwk
 * @returns {Record<string, unknown>|null}
 */
function verifyAsymmetricJwt(token, jwk) {
  if (!token || !jwk) return null

  const parts = String(token).split('.')
  if (parts.length !== 3) return null

  const header = decodeJwtHeader(token)
  const alg = String(header?.alg || jwk.alg || '')
  const signed = Buffer.from(`${parts[0]}.${parts[1]}`)
  const signature = decodeBase64Url(parts[2])

  try {
    const key = createPublicKey({ key: jwk, format: 'jwk' })
    let ok = false

    if (alg === 'ES256') {
      ok = createVerify('SHA256')
        .update(signed)
        .verify({ key, dsaEncoding: 'ieee-p1363' }, signature)
    }
    else if (alg === 'RS256') {
      ok = createVerify('RSA-SHA256')
        .update(signed)
        .verify(key, signature)
    }

    if (!ok) return null

    const payload = decodeJwtPayloadUnsafe(token)
    if (!payload || !isPayloadFresh(payload)) return null
    return payload
  }
  catch {
    return null
  }
}

/**
 * @param {unknown} value
 * @returns {{ keys: Array<Record<string, unknown>> }|null}
 */
export function parseJwksJson(value) {
  if (!value) return null
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value
    if (!parsed || !Array.isArray(parsed.keys)) return null
    return { keys: parsed.keys }
  }
  catch {
    return null
  }
}

/**
 * Verify using a cached JWKS document (for ES256 / RS256 signing keys).
 *
 * @param {string} token
 * @param {{ keys: Array<Record<string, unknown>> }} jwks
 */
export function verifySupabaseJwksJwt(token, jwks) {
  const header = decodeJwtHeader(token)
  if (!header?.alg || !header?.kid) return null

  const jwk = (jwks?.keys || []).find((key) => key.kid === header.kid)
  if (!jwk) return null

  return verifyAsymmetricJwt(token, jwk)
}

/**
 * Hybrid verifier for legacy HS256 and modern asymmetric Supabase JWTs.
 *
 * @param {string} token
 * @param {{ secret?: string, jwks?: { keys: Array<Record<string, unknown>> }|null }} options
 */
export function verifySupabaseAccessToken(token, options = {}) {
  const header = decodeJwtHeader(token)
  const alg = String(header?.alg || '')

  if (alg === 'HS256' && options.secret) {
    return verifySupabaseHs256Jwt(token, options.secret)
  }

  if ((alg === 'ES256' || alg === 'RS256') && options.jwks) {
    return verifySupabaseJwksJwt(token, options.jwks)
  }

  if (options.secret) {
    const hs = verifySupabaseHs256Jwt(token, options.secret)
    if (hs) return hs
  }

  if (options.jwks) {
    return verifySupabaseJwksJwt(token, options.jwks)
  }

  return null
}

/**
 * @param {Record<string, unknown>} payload
 */
export function userFromJwtPayload(payload) {
  const sub = payload.sub
  if (!sub || typeof sub !== 'string') return null

  return {
    id: sub,
    email: typeof payload.email === 'string' ? payload.email : undefined,
    phone: typeof payload.phone === 'string' ? payload.phone : undefined,
    role: typeof payload.role === 'string' ? payload.role : undefined,
    app_metadata:
      payload.app_metadata && typeof payload.app_metadata === 'object'
        ? payload.app_metadata
        : {},
    user_metadata:
      payload.user_metadata && typeof payload.user_metadata === 'object'
        ? payload.user_metadata
        : {},
    aud: payload.aud,
  }
}
