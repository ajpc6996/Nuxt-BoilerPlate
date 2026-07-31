export default defineNuxtPlugin(() => {
  const { initTheme, theme } = useTheme()

  initTheme()

  watch(
    theme,
    (value) => {
      document.documentElement.setAttribute('data-theme', value)
    },
    { immediate: true },
  )
})
