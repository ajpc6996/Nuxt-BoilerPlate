import { createClient } from '@supabase/supabase-js'
import {
  getSupabasePublishableKey,
  getSupabaseUrl,
} from '~~/shared/supabaseKeys.js'

/**
 * Authenticated user from Bearer token (no MFA requirement).
 * @param {import('h3').H3Event} event
 */
export async function requireUser(event) {
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

  return { user, token }
}
