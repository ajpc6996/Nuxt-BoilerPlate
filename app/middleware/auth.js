export default defineNuxtRouteMiddleware(async (to) => {
  // Auth session is browser-only (supabase.client plugin). Skipping SSR avoids a
  // login flash when opening dashboards in a new tab/window.
  if (import.meta.server) return

  const authStore = useAuthStore()

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

  if (authStore.needsMfaChallenge && to.path !== '/auth/mfa') {
    return navigateTo({
      path: '/auth/mfa',
      query: { redirect: to.fullPath },
      replace: true,
    })
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
