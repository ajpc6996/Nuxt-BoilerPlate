<template>
  <PipelineNodeShell
    label="Ingest"
    title="Write table"
    :subtitle="subtitle"
    tone="ingest"
    :show-target="true"
    :show-source="false"
  />
</template>

<script setup>
const props = defineProps({
  data: { type: Object, default: () => ({}) },
})

const subtitle = computed(() => {
  const t = props.data?.destinationTable
  return t ? `ingest.${t}` : 'Destination table'
})
</script>
