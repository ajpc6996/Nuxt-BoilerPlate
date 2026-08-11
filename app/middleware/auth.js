export default defineNuxtRouteMiddleware(async (to) => {
  // Auth session is browser-only (supabase.client plugin). Skipping SSR avoids a
  // login flash when opening dashboards in a new tab/window.
  if (import.meta.server) return

  const authStore = useAuthStore()
  const orgStore = useOrganizationStore()

  // Wait briefly for client plugin hydration on first paint
  if (!authStore.initialized) {
    await until(() => authStore.initialized).toBe(true)
  }

  if (!authStore.isAuthenticated) {
    return navigateTo({
      path: '/login',
      query: { redirect: to.fullPath },
      replace: true,
    })
  }

  // Supabase MFA challenge pending (enrolled factor, not yet verified)
  if (authStore.needsMfaChallenge && to.path !== '/auth/mfa') {
    return navigateTo({
      path: '/auth/mfa',
      query: { redirect: to.fullPath },
      replace: true,
    })
  }

  // Org / licence policy requires MFA for app use (not only admin routes)
  const exemptPaths = new Set([
    '/auth/mfa',
    '/me/security',
    '/login',
    '/auth/callback',
    '/auth/reset-password',
  ])
  if (!exemptPaths.has(to.path) && !authStore.isAal2) {
    const org = orgStore.activeOrganization
    const licence = orgStore.activeLicence
    const orgRequires = org?.mfa_mode === 'required'
    const licenceRequires = Boolean(licence?.features?.mfaRequired)
    if (orgRequires || licenceRequires) {
      // Enrolled but not stepped up → challenge; otherwise enroll first
      if (authStore.needsMfaChallenge || authStore.nextAal === 'aal2') {
        return navigateTo({
          path: '/auth/mfa',
          query: { redirect: to.fullPath },
          replace: true,
        })
      }
      return navigateTo({
        path: '/me/security',
        query: { redirect: to.fullPath, reason: 'org-mfa' },
        replace: true,
      })
    }
  }
})

/**
 * Tiny waiter without pulling VueUse as a hard dep if unavailable.
 * @param {() => boolean} source
 */
function until(source) {
  return {
    toBe(value) {
      return new Promise((resolve) => {
        if (source() === value) {
          resolve(true)
          return
        }
        const timer = setInterval(() => {
          if (source() === value) {
            clearInterval(timer)
            resolve(true)
          }
        }, 20)
        setTimeout(() => {
          clearInterval(timer)
          resolve(false)
        }, 4000)
      })
    },
  }
}
