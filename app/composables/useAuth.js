/**
 * Supabase Auth + profile/org helpers for the Nuxt app.
 */
export function useAuth() {
  const supabase = useSupabase()
  const authStore = useAuthStore()
  const orgStore = useOrganizationStore()
  const nuxtApp = useNuxtApp()

  const {
    isAuthenticated,
    user,
    profile,
    session,
    aal,
    isPlatformAdmin,
    isAal2,
    needsMfaChallenge,
    loading,
    initialized,
  } = storeToRefs(authStore)

  /**
   * @param {string} email
   * @param {string} password
   */
  async function signInWithPassword(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (error) {
      return { data: null, error }
    }

    await nuxtApp.$hydrateAuthState?.()

    if (authStore.needsMfaChallenge) {
      await navigateTo('/auth/mfa')
      return { data, error: null, mfaRequired: true }
    }

    const redirect = useRoute().query.redirect
    await navigateTo(
      typeof redirect === 'string' && redirect.startsWith('/')
        ? redirect
        : '/dashboard',
    )
    return { data, error: null, mfaRequired: false }
  }

  /**
   * @param {string} email
   */
  async function requestPasswordReset(email) {
    const origin = import.meta.client ? window.location.origin : ''
    return supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${origin}/auth/reset-password`,
    })
  }

  /**
   * @param {string} password
   */
  async function updatePassword(password) {
    return supabase.auth.updateUser({ password })
  }

  async function signOut() {
    await supabase.auth.signOut()
    authStore.reset()
    orgStore.reset()
    return navigateTo('/login')
  }

  /**
   * @param {Partial<{ full_name: string, mfa_opt_in: boolean }>} patch
   */
  async function updateProfile(patch) {
    if (!user.value?.id) {
      return { data: null, error: new Error('Not signed in') }
    }

    const { data, error } = await supabase
      .from('profiles')
      .update(patch)
      .eq('id', user.value.id)
      .select('id, email, full_name, avatar_url, is_platform_admin, mfa_opt_in')
      .single()

    if (!error && data) {
      authStore.setProfile(data)
    }

    return { data, error }
  }

  async function refreshAuth() {
    await nuxtApp.$hydrateAuthState?.()
  }

  // Back-compat aliases used by older pages
  const login = async (payload) => {
    if (payload?.email && payload?.password) {
      return signInWithPassword(payload.email, payload.password)
    }
    throw new Error('Use signInWithPassword({ email, password })')
  }

  const logout = signOut

  return {
    isAuthenticated,
    user,
    profile,
    session,
    aal,
    isPlatformAdmin,
    isAal2,
    needsMfaChallenge,
    loading,
    initialized,
    signInWithPassword,
    requestPasswordReset,
    updatePassword,
    signOut,
    updateProfile,
    refreshAuth,
    login,
    logout,
  }
}
