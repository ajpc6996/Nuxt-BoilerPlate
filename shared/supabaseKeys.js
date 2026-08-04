/**
 * Resolve Supabase API keys with preference for the new key formats.
 * Publishable: sb_publishable_... (replaces legacy anon JWT)
 * Secret:      sb_secret_...      (replaces legacy service_role JWT)
 *
 * Legacy env vars remain as fallbacks until end of 2026.
 */

/**
 * Project URL only — not the /rest/v1 Data API path.
 * @param {string} value
 * @returns {string}
 */
export function normalizeSupabaseUrl(value) {
  if (!value) return ''
  let url = String(value).trim().replace(/\/+$/, '')
  // Common mistake: paste REST endpoint from API docs
  url = url.replace(/\/rest\/v1$/i, '')
  url = url.replace(/\/auth\/v1$/i, '')
  url = url.replace(/\/functions\/v1$/i, '')
  return url.replace(/\/+$/, '')
}

/**
 * @param {{ public?: { supabaseUrl?: string } }} config
 * @returns {string}
 */
export function getSupabaseUrl(config) {
  return normalizeSupabaseUrl(config.public?.supabaseUrl || '')
}

/**
 * Low-privilege key for browsers / public clients.
 * @param {{ public?: { supabasePublishableKey?: string, supabaseAnonKey?: string } }} config
 * @returns {string}
 */
export function getSupabasePublishableKey(config) {
  return (
    config.public?.supabasePublishableKey
    || config.public?.supabaseAnonKey
    || ''
  )
}

/**
 * Elevated key for server-only admin clients (bypasses RLS).
 * @param {{ supabaseSecretKey?: string, supabaseServiceRoleKey?: string }} config
 * @returns {string}
 */
export function getSupabaseSecretKey(config) {
  return (
    config.supabaseSecretKey
    || config.supabaseServiceRoleKey
    || ''
  )
}

/**
 * @param {string} key
 * @returns {'publishable'|'secret'|'legacy-jwt'|'unknown'|'missing'}
 */
export function classifySupabaseKey(key) {
  if (!key) return 'missing'
  if (key.startsWith('sb_publishable_')) return 'publishable'
  if (key.startsWith('sb_secret_')) return 'secret'
  if (key.startsWith('eyJ') && key.split('.').length === 3) return 'legacy-jwt'
  return 'unknown'
}
