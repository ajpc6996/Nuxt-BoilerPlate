/**
 * Permission helpers for menus and route gates.
 */
export function usePermissions() {
  const authStore = useAuthStore()
  const orgStore = useOrganizationStore()

  const canOpenAdministration = computed(
    () =>
      authStore.isAuthenticated
      && (authStore.isPlatformAdmin || orgStore.isOrgAdmin),
  )

  const canUseAdministration = computed(
    () => canOpenAdministration.value && authStore.isAal2,
  )

  const canOpenPlatform = computed(
    () => authStore.isAuthenticated && authStore.isPlatformAdmin,
  )

  const canUsePlatform = computed(
    () => canOpenPlatform.value && authStore.isAal2,
  )

  const canConfigureConnections = computed(
    () =>
      authStore.isAuthenticated
      && (authStore.isPlatformAdmin || orgStore.isOrgAdmin),
  )

  /**
   * @param {Array<'platform'|'orgAdmin'> | undefined} roles
   */
  function allowsRoles(roles) {
    if (!roles?.length) return true
    if (roles.includes('platform') && authStore.isPlatformAdmin) return true
    if (roles.includes('orgAdmin') && orgStore.isOrgAdmin) return true
    // Platform admins can open org-admin surfaces
    if (roles.includes('orgAdmin') && authStore.isPlatformAdmin) return true
    return false
  }

  /**
   * Display-only feature gate. Server enforcement is authoritative.
   * Platform admins always pass.
   * @param {string} feature
   */
  function hasFeature(feature) {
    if (authStore.isPlatformAdmin) return true
    const licence = orgStore.activeLicence
    if (!licence) return true
    if (['locked', 'canceled'].includes(licence.status)) return false
    return licence.features?.[feature] !== false
  }

  return {
    canOpenAdministration,
    canUseAdministration,
    canOpenPlatform,
    canUsePlatform,
    canConfigureConnections,
    allowsRoles,
    hasFeature,
  }
}
