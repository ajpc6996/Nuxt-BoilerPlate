<template>
  <PipelineNodeShell
    label="Transform"
    :title="title"
    :subtitle="subtitle"
    :badge="badge"
    tone="transform"
  />
</template>

<script setup>
const props = defineProps({
  data: { type: Object, default: () => ({}) },
})

const title = computed(() => props.data?.label || 'Transform fields')
const subtitle = computed(() => {
  const actions = Array.isArray(props.data?.actions) ? props.data.actions : []
  if (!actions.length) return 'No actions yet'
  const ops = actions.map((a) => a?.op).filter(Boolean)
  const unique = [...new Set(ops)]
  return `${actions.length} step${actions.length === 1 ? '' : 's'} · ${unique.slice(0, 3).join(', ')}`
})
const badge = computed(() => {
  if (props.data?.lastOut == null) return ''
  return `${props.data.lastIn ?? '?'}→${props.data.lastOut}`
})
</script>
