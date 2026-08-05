<template>
  <PipelineNodeShell
    label="Merge"
    :title="title"
    :subtitle="subtitle"
    tone="merge"
    :show-target="true"
    :show-source="true"
  />
</template>

<script setup>
const props = defineProps({
  data: { type: Object, default: () => ({}) },
})

const title = computed(() => props.data?.label || 'Inner join')

const subtitle = computed(() => {
  const keys = Array.isArray(props.data?.keys) ? props.data.keys : []
  const pair = keys.find((k) => k?.left && k?.right)
  if (pair) return `${pair.left} = ${pair.right}`
  return 'Set join keys'
})
</script>
