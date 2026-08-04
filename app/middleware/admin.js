/**
 * Org Administration — visible to Org Admin or Platform Admin.
 * Requires MFA (aal2) to use; redirects to MFA challenge when needed.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  const authStore = useAuthStore()
  const orgStore = useOrganizationStore()

  if (!authStore.isAuthenticated) {
    return navigateTo({
      path: '/login',
      query: { redirect: to.fullPath },
    })
  }

  const allowed = authStore.isPlatformAdmin || orgStore.isOrgAdmin
  if (!allowed) {
    return navigateTo('/dashboard')
  }

  if (!authStore.isAal2) {
    return navigateTo({
      path: '/auth/mfa',
      query: {
        redirect: to.fullPath,
        reason: 'administration',
      },
    })
  }
})
