<template>
  <PipelineNodeShell
    label="Export"
    title="Temp Stage"
    :subtitle="subtitle"
    tone="export"
    :show-target="true"
    :show-source="false"
  />
</template>

<script setup>
const props = defineProps({
  data: { type: Object, default: () => ({}) },
})

const subtitle = computed(() => {
  if (props.data?.connectionId) return 'Outbound destination'
  return 'Pick outbound connection'
})
</script>
