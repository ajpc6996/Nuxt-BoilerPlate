<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
  <ClientOnly>
    <AppConfirmDialog />
  </ClientOnly>
</template>

<script setup>
const { appName } = useAppName()

useHead({
  htmlAttrs: {
    'data-theme': 'dark',
  },
  title: appName,
  titleTemplate: (title) => {
    const name = appName.value
    if (!title || title === name) return name
    return `${title} — ${name}`
  },
})
</script>
