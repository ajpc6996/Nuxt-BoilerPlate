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

        await loadMemberships(supabase, orgStore, session.user.id)
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
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {ReturnType<typeof useOrganizationStore>} orgStore
 * @param {string} userId
 */
async function loadMemberships(supabase, orgStore, userId) {
  orgStore.loading = true
  try {
    const { data, error } = await supabase
      .from('organization_members')
      .select('id, organization_id, status, organizations(id, name, slug, mfa_mode)')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: true })

    if (error) {
      console.warn('[auth] Failed to load memberships', error.message)
      orgStore.setMemberships([])
      orgStore.setActiveOrganizationId(null)
      orgStore.setRolesInActiveOrg([])
      return
    }

    orgStore.setMemberships(data || [])

    const saved = orgStore.restoreActiveOrganizationId()
    const validSaved = (data || []).some((m) => m.organization_id === saved)
    const nextOrgId = validSaved
      ? saved
      : data?.[0]?.organization_id || null

    orgStore.setActiveOrganizationId(nextOrgId)
    await loadRolesForActiveOrg(supabase, orgStore, userId)
  } finally {
    orgStore.loading = false
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {ReturnType<typeof useOrganizationStore>} orgStore
 * @param {string} userId
 */
async function loadRolesForActiveOrg(supabase, orgStore, userId) {
  const orgId = orgStore.activeOrganizationId
  if (!orgId) {
    orgStore.setRolesInActiveOrg([])
    return
  }

  const { data, error } = await supabase
    .from('user_roles')
    .select('id, role_id, roles(id, name, description, is_system)')
    .eq('organization_id', orgId)
    .eq('user_id', userId)

  if (error) {
    console.warn('[auth] Failed to load roles', error.message)
    orgStore.setRolesInActiveOrg([])
    return
  }

  orgStore.setRolesInActiveOrg(
    (data || []).map((row) => row.roles).filter(Boolean),
  )
}
