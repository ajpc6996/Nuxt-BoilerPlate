import { defineStore } from 'pinia'

const ACTIVE_ORG_KEY = 'zorro-active-org-id'

export const useOrganizationStore = defineStore('organization', () => {
  const memberships = ref([])
  const activeOrganizationId = ref(null)
  const rolesInActiveOrg = ref([])
  /** @type {import('vue').Ref<Record<string, Array<{ id: string, name: string }>>>} */
  const rolesByOrg = ref({})
  /** @type {import('vue').Ref<Record<string, object>>} */
  const licencesByOrg = ref({})
  const loading = ref(false)

  const activeOrganization = computed(() =>
    memberships.value.find((m) => m.organization_id === activeOrganizationId.value)
      ?.organizations ?? null,
  )

  const isOrgAdmin = computed(() =>
    rolesInActiveOrg.value.some((role) => role.name === 'Admin'),
  )

  const activeLicence = computed(() => {
    const id = activeOrganizationId.value
    if (!id) return null
    return licencesByOrg.value[id] || null
  })

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

  /**
   * @param {Record<string, Array<{ id: string, name: string }>>} next
   */
  function setRolesByOrg(next) {
    rolesByOrg.value = next && typeof next === 'object' ? next : {}
  }

  /**
   * @param {Record<string, object>} next
   */
  function setLicencesByOrg(next) {
    licencesByOrg.value = next && typeof next === 'object' ? next : {}
  }

  /**
   * @param {string|null} orgId
   */
  function applyRolesForOrg(orgId) {
    if (!orgId) {
      rolesInActiveOrg.value = []
      return
    }
    rolesInActiveOrg.value = Array.isArray(rolesByOrg.value[orgId])
      ? rolesByOrg.value[orgId]
      : []
  }

  function reset() {
    memberships.value = []
    activeOrganizationId.value = null
    rolesInActiveOrg.value = []
    rolesByOrg.value = {}
    licencesByOrg.value = {}
  }

  return {
    memberships,
    activeOrganizationId,
    activeOrganization,
    rolesInActiveOrg,
    rolesByOrg,
    licencesByOrg,
    activeLicence,
    loading,
    isOrgAdmin,
    setMemberships,
    setActiveOrganizationId,
    restoreActiveOrganizationId,
    setRolesInActiveOrg,
    setRolesByOrg,
    setLicencesByOrg,
    applyRolesForOrg,
    reset,
  }
})
