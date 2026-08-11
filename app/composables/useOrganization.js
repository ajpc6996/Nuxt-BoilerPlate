/**
 * Active organization context (single active org).
 */
export function useOrganization() {
  const authStore = useAuthStore()
  const orgStore = useOrganizationStore()

  const {
    memberships,
    activeOrganizationId,
    activeOrganization,
    rolesInActiveOrg,
    isOrgAdmin,
    loading,
  } = storeToRefs(orgStore)

  const activeLicence = computed(() => orgStore.activeLicence)

  /**
   * @param {string} orgId
   */
  async function setActiveOrganization(orgId) {
    const exists = memberships.value.some((m) => m.organization_id === orgId)
    const auth = authStore
    if (!exists && !auth.isPlatformAdmin) {
      throw new Error('You are not a member of that organization')
    }

    orgStore.setActiveOrganizationId(orgId)
    orgStore.applyRolesForOrg(orgId)
  }

  /**
   * Platform admins can activate any org (even without membership) for config.
   * @param {object} org
   */
  async function setActiveOrganizationAsPlatform(org) {
    if (!authStore.isPlatformAdmin) {
      throw new Error('Platform admin required')
    }

    const synthetic = {
      id: `platform-${org.id}`,
      organization_id: org.id,
      status: 'active',
      organizations: org,
    }

    const without = memberships.value.filter((m) => m.organization_id !== org.id)
    orgStore.setMemberships([synthetic, ...without])
    await setActiveOrganization(org.id)
  }

  return {
    memberships,
    activeOrganizationId,
    activeOrganization,
    rolesInActiveOrg,
    isOrgAdmin,
    activeLicence,
    loading,
    setActiveOrganization,
    setActiveOrganizationAsPlatform,
  }
}
