/**
 * Platform Administration — platform admin only, always requires aal2.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  const authStore = useAuthStore()

  if (!authStore.isAuthenticated) {
    return navigateTo({
      path: '/login',
      query: { redirect: to.fullPath },
    })
  }

  if (!authStore.isPlatformAdmin) {
    return navigateTo('/dashboard')
  }

  if (!authStore.isAal2) {
    return navigateTo({
      path: '/auth/mfa',
      query: {
        redirect: to.fullPath,
        reason: 'platform',
      },
    })
  }
})
