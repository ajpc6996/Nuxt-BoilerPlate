import { createClient } from '@supabase/supabase-js'
import {
  getSupabasePublishableKey,
  getSupabaseUrl,
} from '~~/shared/supabaseKeys.js'

/**
 * Create a Supabase client with the publishable (or legacy anon) key.
 * @param {{ detectSessionInUrl?: boolean }} [options]
 */
export function createBrowserSupabaseClient(options = {}) {
  const config = useRuntimeConfig()
  const url = getSupabaseUrl(config)
  const key = getSupabasePublishableKey(config)

  if (!url || !key) {
    throw new Error(
      'Missing NUXT_PUBLIC_SUPABASE_URL or NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or legacy NUXT_PUBLIC_SUPABASE_ANON_KEY)',
    )
  }

  const detectSessionInUrl = options.detectSessionInUrl ?? false

  return createClient(url, key, {
    auth: {
      persistSession: import.meta.client,
      autoRefreshToken: import.meta.client,
      detectSessionInUrl: import.meta.client ? detectSessionInUrl : false,
      flowType: 'pkce',
    },
  })
}

/**
 * Shared Supabase client. Prefers the plugin singleton on the client.
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
export function useSupabase() {
  const nuxtApp = useNuxtApp()

  if (nuxtApp.$supabase) {
    return nuxtApp.$supabase
  }

  const config = useRuntimeConfig()
  const url = getSupabaseUrl(config)
  const key = getSupabasePublishableKey(config)

  if (!url || !key) {
    throw new Error(
      'Supabase is not configured. Set NUXT_PUBLIC_SUPABASE_URL to https://YOUR_REF.supabase.co (no /rest/v1) and NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env, then restart `npm run dev`.',
    )
  }

  const client = createBrowserSupabaseClient({ detectSessionInUrl: false })

  // Cache on the client so we keep one browser singleton.
  // On SSR, return a per-request client (no persisted session).
  if (import.meta.client) {
    nuxtApp.$supabase = client
    nuxtApp.provide('supabase', client)
  }

  return client
}
