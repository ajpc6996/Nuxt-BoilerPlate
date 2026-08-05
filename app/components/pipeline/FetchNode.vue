<template>
  <PipelineNodeShell
    label="Fetch"
    :title="title"
    :subtitle="subtitle"
    :badge="badge"
    tone="fetch"
    :show-target="false"
    :show-source="true"
  />
</template>

<script setup>
const props = defineProps({
  data: { type: Object, default: () => ({}) },
})

const title = computed(() => props.data?.label || 'Fetch source')

const badge = computed(() =>
  props.data?.mode === 'refresh' ? 'refresh' : 'ingest',
)

const subtitle = computed(() => {
  if (props.data?.sourceName) return String(props.data.sourceName)
  if (props.data?.sourceId) return 'Source selected'
  return 'Pick a source'
})
</script>
