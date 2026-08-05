<template>
  <div class="space-y-4">
    <div class="flex flex-col gap-1">
      <label class="text-xs font-medium text-[var(--mute)]">Label</label>
      <input
        v-model="draft.label"
        type="text"
        class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)]"
        @change="emitUpdate"
      >
    </div>

    <div class="flex flex-col gap-1">
      <label class="text-xs font-medium text-[var(--mute)]">Source</label>
      <select
        v-model="draft.sourceId"
        class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)]"
        @change="onSourceChange"
      >
        <option value="">
          Select a source…
        </option>
        <option
          v-for="s in sourceOptions"
          :key="s.id"
          :value="s.id"
        >
          {{ s.name }} ({{ s.destination_table }})
        </option>
      </select>
      <p class="text-[10px] text-[var(--mute-soft)]">
        Cannot select this merge source itself.
      </p>
    </div>

    <fieldset class="space-y-2">
      <legend class="text-xs font-medium text-[var(--mute)]">
        Load mode
      </legend>
      <label class="flex cursor-pointer items-start gap-2 rounded-md border border-[var(--border)] px-3 py-2 hover:border-[var(--accent)]">
        <input
          v-model="draft.mode"
          type="radio"
          value="last_ingest"
          class="mt-1 accent-[var(--accent)]"
          @change="emitUpdate"
        >
        <span>
          <span class="block text-sm text-[var(--ink)]">Last ingest table</span>
          <span class="block text-[10px] text-[var(--mute-soft)]">
            Default — read rows already written to ingest.{{ selectedDest || '…' }}
          </span>
        </span>
      </label>
      <label class="flex cursor-pointer items-start gap-2 rounded-md border border-[var(--border)] px-3 py-2 hover:border-[var(--accent)]">
        <input
          v-model="draft.mode"
          type="radio"
          value="refresh"
          class="mt-1 accent-[var(--accent)]"
          @change="emitUpdate"
        >
        <span>
          <span class="block text-sm text-[var(--ink)]">Refresh now</span>
          <span class="block text-[10px] text-[var(--mute-soft)]">
            Re-run the child source when this merge runs (async, in parallel with other Fetches).
          </span>
        </span>
      </label>
    </fieldset>
  </div>
</template>

<script setup>
const props = defineProps({
  modelValue: { type: Object, default: () => ({}) },
  sources: { type: Array, default: () => [] },
  excludeSourceId: { type: String, default: '' },
})

const emit = defineEmits(['update:modelValue'])

const draft = reactive({
  label: 'Fetch',
  sourceId: '',
  mode: 'last_ingest',
  sourceName: '',
})

const sourceOptions = computed(() =>
  (props.sources || []).filter((s) => s.id && s.id !== props.excludeSourceId),
)

const selectedDest = computed(() => {
  const s = sourceOptions.value.find((x) => x.id === draft.sourceId)
  return s?.destination_table || ''
})

watch(
  () => props.modelValue,
  (v) => {
    draft.label = v?.label || 'Fetch'
    draft.sourceId = v?.sourceId || ''
    draft.mode = v?.mode === 'refresh' ? 'refresh' : 'last_ingest'
    draft.sourceName = v?.sourceName || ''
  },
  { immediate: true, deep: true },
)

function emitUpdate() {
  emit('update:modelValue', {
    label: draft.label || 'Fetch',
    sourceId: draft.sourceId || '',
    mode: draft.mode === 'refresh' ? 'refresh' : 'last_ingest',
    sourceName: draft.sourceName || '',
  })
}

function onSourceChange() {
  const s = sourceOptions.value.find((x) => x.id === draft.sourceId)
  draft.sourceName = s?.name || ''
  emitUpdate()
}

defineExpose({
  flush() {
    emitUpdate()
  },
})
</script>
