import { createClient } from '@supabase/supabase-js'
import {
  getSupabasePublishableKey,
  getSupabaseUrl,
} from '~~/shared/supabaseKeys.js'

/**
 * Platform admin + aal2 gate for connector type management.
 * @param {import('h3').H3Event} event
 */
export async function requirePlatformAdmin(event) {
  const authHeader = getHeader(event, 'authorization') || ''
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null

  if (!token) {
    throw createError({ statusCode: 401, statusMessage: 'Missing access token' })
  }

  const config = useRuntimeConfig()
  const userClient = createClient(
    getSupabaseUrl(config),
    getSupabasePublishableKey(config),
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  )

  const {
    data: { user },
    error,
  } = await userClient.auth.getUser()

  if (error || !user) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid session' })
  }

  const payload = decodeJwtPayload(token)
  if (payload?.aal !== 'aal2') {
    throw createError({
      statusCode: 403,
      statusMessage: 'MFA (aal2) required for platform actions',
    })
  }

  const admin = useSupabaseAdmin()
  const { data: profile } = await admin
    .from('profiles')
    .select('id, is_platform_admin')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.is_platform_admin) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Platform admin required',
    })
  }

  return { user, profile, isPlatformAdmin: true }
}

/**
 * @param {string} token
 */
function decodeJwtPayload(token) {
  try {
    const part = token.split('.')[1]
    const json = Buffer.from(part, 'base64url').toString('utf8')
    return JSON.parse(json)
  } catch {
    return null
  }
}
