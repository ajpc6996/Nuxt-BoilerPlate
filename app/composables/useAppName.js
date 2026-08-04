/**
 * Brand / product name + logo from app config.
 * Override in `app/app.config.js` via `appName` / `logoUrl`.
 */
export function useAppName() {
  const config = useAppConfig()

  const appName = computed(() => {
    const value = config.appName
    return typeof value === 'string' && value.trim() ? value.trim() : 'Zorro'
  })

  const logoUrl = computed(() => {
    const value = config.logoUrl
    return typeof value === 'string' && value.trim() ? value.trim() : ''
  })

  const monogram = computed(() => appName.value.slice(0, 1).toUpperCase())

  return { appName, logoUrl, monogram }
}
