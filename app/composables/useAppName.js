/**
 * Brand / product name from app config (default: Zorro).
 * Override in `app/app.config.js` via `appName`.
 */
export function useAppName() {
  const config = useAppConfig()

  const appName = computed(() => {
    const value = config.appName
    return typeof value === 'string' && value.trim() ? value.trim() : 'Zorro'
  })

  return { appName }
}
