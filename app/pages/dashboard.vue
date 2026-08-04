<script setup>
definePageMeta({
  layout: 'app',
  middleware: 'auth',
})

await navigateTo('/', { replace: true })
</script>

<template>
  <div />
</template>
