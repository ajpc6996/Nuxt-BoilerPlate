import { defineStore } from 'pinia'

export const useAuthStore = defineStore('auth', () => {
  const isAuthenticated = ref(false)
  const user = ref(null)

  /**
   * @param {object|null} userData
   */
  const login = (userData) => {
    isAuthenticated.value = true
    user.value = userData
  }

  const logout = () => {
    isAuthenticated.value = false
    user.value = null
  }

  return {
    isAuthenticated,
    user,
    login,
    logout,
  }
})
