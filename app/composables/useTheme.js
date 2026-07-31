/** Theme id for the default Dark Theme (Sintrex Dark). */
export const THEME_DARK = 'dark'

/** Human-readable labels for UI selectors. */
export const THEME_OPTIONS = [
  { id: THEME_DARK, label: 'Dark Theme' },
]

const STORAGE_KEY = 'app-theme'

/**
 * App theme state. Dark Theme (Sintrex Dark) is the default.
 */
export function useTheme() {
  const theme = useState('app-theme', () => THEME_DARK)

  /**
   * @param {string} value
   */
  function applyTheme(value) {
    const next = value === THEME_DARK ? THEME_DARK : THEME_DARK
    theme.value = next

    if (import.meta.client) {
      document.documentElement.setAttribute('data-theme', next)
      localStorage.setItem(STORAGE_KEY, next)
    }
  }

  /**
   * @param {string} value
   */
  function setTheme(value) {
    applyTheme(value)
  }

  function initTheme() {
    if (!import.meta.client) {
      return
    }

    const saved = localStorage.getItem(STORAGE_KEY)
    applyTheme(saved || theme.value || THEME_DARK)
  }

  return {
    theme,
    themeOptions: THEME_OPTIONS,
    setTheme,
    initTheme,
  }
}
