// composables/useAuth.js
export const useAuth = () => {
  const authStore = useAuthStore()
  const { isAuthenticated, user } = storeToRefs(authStore)

  /**
   * @param {object|null} userData
   */
  const login = (userData) => {
    authStore.login(userData)
    return navigateTo('/dashboard')
  }

  const logout = () => {
    authStore.logout()
    return navigateTo('/login')
  }

  return {
    isAuthenticated,
    user,
    login,
    logout,
  }
}
