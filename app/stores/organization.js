import { defineStore } from 'pinia'

const ACTIVE_ORG_KEY = 'zorro-active-org-id'

export const useOrganizationStore = defineStore('organization', () => {
  const memberships = ref([])
  const activeOrganizationId = ref(null)
  const rolesInActiveOrg = ref([])
  const loading = ref(false)

  const activeOrganization = computed(() =>
    memberships.value.find((m) => m.organization_id === activeOrganizationId.value)
      ?.organizations ?? null,
  )

  const isOrgAdmin = computed(() =>
    rolesInActiveOrg.value.some((role) => role.name === 'Admin'),
  )

  /**
   * @param {Array} next
   */
  function setMemberships(next) {
    memberships.value = Array.isArray(next) ? next : []
  }

  /**
   * @param {string|null} orgId
   */
  function setActiveOrganizationId(orgId) {
    activeOrganizationId.value = orgId
    if (import.meta.client) {
      if (orgId) {
        localStorage.setItem(ACTIVE_ORG_KEY, orgId)
      } else {
        localStorage.removeItem(ACTIVE_ORG_KEY)
      }
    }
  }

  function restoreActiveOrganizationId() {
    if (!import.meta.client) return null
    return localStorage.getItem(ACTIVE_ORG_KEY)
  }

  /**
   * @param {Array} roles
   */
  function setRolesInActiveOrg(roles) {
    rolesInActiveOrg.value = Array.isArray(roles) ? roles : []
  }

  function reset() {
    memberships.value = []
    activeOrganizationId.value = null
    rolesInActiveOrg.value = []
  }

  return {
    memberships,
    activeOrganizationId,
    activeOrganization,
    rolesInActiveOrg,
    loading,
    isOrgAdmin,
    setMemberships,
    setActiveOrganizationId,
    restoreActiveOrganizationId,
    setRolesInActiveOrg,
    reset,
  }
})
