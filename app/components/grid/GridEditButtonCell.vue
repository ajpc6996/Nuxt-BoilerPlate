<template>
  <button
    type="button"
    class="grid-edit-btn"
    @click.stop.prevent="onEdit"
    @mousedown.stop
    @pointerdown.stop
  >
    Edit
  </button>
</template>

<script setup>
/**
 * AG Grid Vue cell renderer.
 * Receives `params` from AG Grid (includes data + context).
 */
const props = defineProps({
  params: {
    type: Object,
    required: true,
  },
})

const onEdit = () => {
  const row = props.params?.data
  const onEditRow = props.params?.context?.onEditRow

  if (typeof onEditRow === 'function') {
    onEditRow(row)
    return
  }

  // Fallback if context was not provided
  props.params?.api?.dispatchEvent?.({
    type: 'editRowRequested',
    data: row,
  })
}
</script>

<style scoped>
.grid-edit-btn {
  border: 1px solid var(--border);
  background: var(--surface-raised);
  color: var(--ink);
  border-radius: var(--radius-sm);
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.grid-edit-btn:hover {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--accent-ink);
}
</style>
