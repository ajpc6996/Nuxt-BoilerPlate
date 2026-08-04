import { createClient } from '@supabase/supabase-js'
import {
  getSupabaseSecretKey,
  getSupabaseUrl,
} from '~~/shared/supabaseKeys.js'

/**
 * Server-only Supabase client with secret key (bypasses RLS).
 * Used for invite / create-user / reset-password admin APIs.
 * Prefer SUPABASE_SECRET_KEY (sb_secret_...); legacy SERVICE_ROLE is fallback only.
 */
export function useSupabaseAdmin() {
  const config = useRuntimeConfig()
  const url = getSupabaseUrl(config)
  const key = getSupabaseSecretKey(config)

  if (!url || !key) {
    throw createError({
      statusCode: 500,
      statusMessage:
        'Supabase admin is not configured (NUXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY)',
    })
  }

  if (import.meta.dev && key.startsWith('eyJ')) {
    console.warn(
      '[supabase] Using legacy service_role JWT. Migrate to SUPABASE_SECRET_KEY (sb_secret_...) before end of 2026.',
    )
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
