import { getSupabasePublishableKey } from '~~/shared/supabaseKeys.js'

export default defineNuxtPlugin({
  name: 'supabase',
  async setup() {
    const config = useRuntimeConfig()
    if (!config.public.supabaseUrl || !getSupabasePublishableKey(config)) {
      console.warn(
        '[supabase] Missing NUXT_PUBLIC_SUPABASE_URL / NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY — auth disabled until configured.',
      )
      return {
        provide: {
          supabase: null,
          hydrateAuthState: async () => {},
        },
      }
    }

    const publishableKey = getSupabasePublishableKey(config)
    if (import.meta.dev && publishableKey.startsWith('eyJ')) {
      console.warn(
        '[supabase] Using legacy anon JWT. Migrate to NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (sb_publishable_...) before end of 2026.',
      )
    }

    // detectSessionInUrl: false — auth pages handle ?code= / token_hash explicitly
    // to avoid racing / aborting automatic PKCE exchange.
    const supabase = createBrowserSupabaseClient({ detectSessionInUrl: false })
    const authStore = useAuthStore()
    const orgStore = useOrganizationStore()

    let hydrateSeq = 0

    /**
     * @param {import('@supabase/supabase-js').Session|null} [knownSession]
     */
    const hydrateAuthState = async (knownSession) => {
      const seq = ++hydrateSeq
      authStore.loading = true
      try {
        let session = knownSession ?? null
        if (session === undefined || knownSession === undefined) {
          const { data } = await supabase.auth.getSession()
          session = data.session
        }

        if (seq !== hydrateSeq) return

        authStore.setSession(session)

        if (!session?.user) {
          authStore.setProfile(null)
          authStore.setAssuranceLevels({ currentLevel: 'aal1', nextLevel: 'aal1' })
          orgStore.reset()
          return
        }

        const [{ data: aalData }, { data: profile }] = await Promise.all([
          supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
          supabase
            .from('profiles')
            .select('id, email, full_name, avatar_url, is_platform_admin, mfa_opt_in')
            .eq('id', session.user.id)
            .maybeSingle(),
        ])

        if (seq !== hydrateSeq) return

        authStore.setAssuranceLevels({
          currentLevel: aalData?.currentLevel || 'aal1',
          nextLevel: aalData?.nextLevel || aalData?.currentLevel || 'aal1',
        })
        authStore.setProfile(profile)

        await loadMembershipsViaApi(supabase, orgStore, session)
      } catch (err) {
        // Aborted overlapping hydrations are expected; ignore them.
        if (err?.name === 'AbortError' || /aborted/i.test(err?.message || '')) {
          return
        }
        console.warn('[auth] hydrate failed', err?.message || err)
      } finally {
        if (seq === hydrateSeq) {
          authStore.loading = false
          authStore.initialized = true
        }
      }
    }

    if (import.meta.client) {
      supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT') {
          authStore.reset()
          orgStore.reset()
          authStore.initialized = true
          return
        }

        // Fire-and-forget; serialize with hydrateSeq
        void hydrateAuthState(session)
      })
    }

    await hydrateAuthState()

    return {
      provide: {
        supabase,
        hydrateAuthState,
      },
    }
  },
})

/**
 * Load orgs/roles through Nitro + service role (bypasses broken private.* RLS).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {ReturnType<typeof useOrganizationStore>} orgStore
 * @param {import('@supabase/supabase-js').Session} session
 */
async function loadMembershipsViaApi(supabase, orgStore, session) {
  orgStore.loading = true
  try {
    const token = session?.access_token
    if (!token) {
      orgStore.reset()
      return
    }

    const res = await $fetch('/api/me/context', {
      headers: { Authorization: `Bearer ${token}` },
    })

    const memberships = res?.memberships || []
    orgStore.setMemberships(memberships)
    orgStore.setRolesByOrg(res?.rolesByOrg || {})

    const saved = orgStore.restoreActiveOrganizationId()
    const validSaved = memberships.some((m) => m.organization_id === saved)
    const nextOrgId = validSaved
      ? saved
      : memberships[0]?.organization_id || null

    orgStore.setActiveOrganizationId(nextOrgId)
    orgStore.applyRolesForOrg(nextOrgId)
  }
  catch (err) {
    console.warn('[auth] Failed to load memberships via API', err?.data?.statusMessage || err?.message || err)
    orgStore.setMemberships([])
    orgStore.setActiveOrganizationId(null)
    orgStore.setRolesInActiveOrg([])
    orgStore.setRolesByOrg({})
  }
  finally {
    orgStore.loading = false
  }
}
