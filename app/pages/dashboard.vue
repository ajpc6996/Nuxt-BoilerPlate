<script setup>
definePageMeta({
  layout: 'app',
  middleware: 'auth',
})

await navigateTo('/dashboards', { replace: true })
</script>

<template>
  <div />
</template>
