<template>
  <PipelineNodeShell
    label="Retrieve"
    title="Fetch data"
    :subtitle="subtitle"
    tone="retrieve"
    :show-target="false"
    :show-source="true"
  />
</template>

<script setup>
const props = defineProps({
  data: { type: Object, default: () => ({}) },
})

const subtitle = computed(() => props.data?.hint || 'Connection endpoint')
</script>
