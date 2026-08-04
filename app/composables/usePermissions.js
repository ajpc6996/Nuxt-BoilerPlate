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

  return {
    canOpenAdministration,
    canUseAdministration,
    canOpenPlatform,
    canUsePlatform,
  }
}
