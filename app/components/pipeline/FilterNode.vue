<template>
  <PipelineNodeShell
    label="Filter"
    :title="title"
    :subtitle="subtitle"
    :badge="badge"
    tone="filter"
  />
</template>

<script setup>
const props = defineProps({
  data: { type: Object, default: () => ({}) },
})

const title = computed(() => props.data?.label || 'Filter rows')
const subtitle = computed(() => {
  const select = Array.isArray(props.data?.select) ? props.data.select.filter(Boolean) : []
  const where = Array.isArray(props.data?.where) ? props.data.where.filter((r) => r?.field) : []
  const bits = []
  if (select.length) bits.push(`${select.length} fields`)
  if (where.length) bits.push(`${where.length} rule${where.length === 1 ? '' : 's'}`)
  return bits.length ? bits.join(' · ') : 'No rules yet'
})
const badge = computed(() => {
  if (props.data?.lastOut == null) return ''
  return `${props.data.lastIn ?? '?'}→${props.data.lastOut}`
})
</script>
