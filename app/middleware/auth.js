// middleware/auth.js

import { useAuthStore } from '~/stores/auth'

export default defineNuxtRouteMiddleware((to, from) => {
  const authStore = useAuthStore()

  // Read directly from the Pinia store state
  if (!authStore.isAuthenticated) {
    return navigateTo('/login', { replace: true })
  }
})
