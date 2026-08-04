import { defineStore } from 'pinia'

export const useAuthStore = defineStore('auth', () => {
  const session = ref(null)
  const user = ref(null)
  const profile = ref(null)
  const aal = ref('aal1')
  const nextAal = ref('aal1')
  const loading = ref(true)
  const initialized = ref(false)

  const isAuthenticated = computed(() => Boolean(session.value?.user))
  const isPlatformAdmin = computed(() => Boolean(profile.value?.is_platform_admin))
  const isAal2 = computed(() => aal.value === 'aal2')
  const needsMfaChallenge = computed(
    () => nextAal.value === 'aal2' && aal.value !== 'aal2',
  )

  /**
   * @param {import('@supabase/supabase-js').Session|null} nextSession
   */
  function setSession(nextSession) {
    session.value = nextSession
    user.value = nextSession?.user ?? null
  }

  /**
   * @param {object|null} nextProfile
   */
  function setProfile(nextProfile) {
    profile.value = nextProfile
  }

  /**
   * @param {{ currentLevel?: string, nextLevel?: string }} levels
   */
  function setAssuranceLevels(levels = {}) {
    aal.value = levels.currentLevel || 'aal1'
    nextAal.value = levels.nextLevel || levels.currentLevel || 'aal1'
  }

  function reset() {
    session.value = null
    user.value = null
    profile.value = null
    aal.value = 'aal1'
    nextAal.value = 'aal1'
  }

  return {
    session,
    user,
    profile,
    aal,
    nextAal,
    loading,
    initialized,
    isAuthenticated,
    isPlatformAdmin,
    isAal2,
    needsMfaChallenge,
    setSession,
    setProfile,
    setAssuranceLevels,
    reset,
  }
})
