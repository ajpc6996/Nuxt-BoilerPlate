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

    <p class="text-xs text-[var(--mute)]">
      Inner join of the two inbound inputs (sorted by node id: left = first, right = second).
      Output fields are prefixed so keys do not collide.
    </p>

    <div class="rounded-md border border-[var(--border)] bg-[var(--surface)] p-3 space-y-2">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <p class="text-xs font-medium text-[var(--mute)]">
          Fields from inputs
        </p>
        <button
          type="button"
          class="text-xs text-[var(--accent-ink)] hover:underline disabled:opacity-50"
          :disabled="loadingFields"
          @click="emit('fetch-fields')"
        >
          {{ loadingFields ? 'Loading…' : 'Refresh fields' }}
        </button>
      </div>
      <div class="grid gap-2 sm:grid-cols-2">
        <div class="rounded-md border border-[var(--border-soft)] px-2 py-1.5">
          <p class="text-[10px] font-semibold uppercase tracking-wide text-[var(--mute-soft)]">
            Left
          </p>
          <p class="truncate text-xs text-[var(--ink)]">
            {{ leftMeta.label }}
          </p>
          <p class="text-[10px] text-[var(--mute-soft)]">
            {{ leftFields.length ? `${leftFields.length} fields` : (loadingFields ? '…' : 'No fields yet') }}
            <span v-if="leftMeta.rowCount != null"> · {{ leftMeta.rowCount }} rows</span>
          </p>
        </div>
        <div class="rounded-md border border-[var(--border-soft)] px-2 py-1.5">
          <p class="text-[10px] font-semibold uppercase tracking-wide text-[var(--mute-soft)]">
            Right
          </p>
          <p class="truncate text-xs text-[var(--ink)]">
            {{ rightMeta.label }}
          </p>
          <p class="text-[10px] text-[var(--mute-soft)]">
            {{ rightFields.length ? `${rightFields.length} fields` : (loadingFields ? '…' : 'No fields yet') }}
            <span v-if="rightMeta.rowCount != null"> · {{ rightMeta.rowCount }} rows</span>
          </p>
        </div>
      </div>
      <p
        v-if="fieldsError"
        class="text-xs text-[var(--danger)]"
      >
        {{ fieldsError }}
      </p>
      <p
        v-else-if="!loadingFields && !leftFields.length && !rightFields.length"
        class="text-xs text-[var(--mute-soft)]"
      >
        Connect two Fetches, ensure each has a source with last-ingest data (or run those sources once), then refresh.
      </p>
    </div>

    <div class="grid grid-cols-2 gap-2">
      <div class="flex flex-col gap-1">
        <label class="text-xs font-medium text-[var(--mute)]">Left prefix</label>
        <input
          v-model="draft.leftPrefix"
          type="text"
          class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-sm text-[var(--ink)]"
          @change="emitUpdate"
        >
      </div>
      <div class="flex flex-col gap-1">
        <label class="text-xs font-medium text-[var(--mute)]">Right prefix</label>
        <input
          v-model="draft.rightPrefix"
          type="text"
          class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-sm text-[var(--ink)]"
          @change="emitUpdate"
        >
      </div>
    </div>

    <div class="space-y-2">
      <div class="flex items-center justify-between">
        <p class="text-xs font-medium text-[var(--mute)]">
          Join keys
        </p>
        <button
          type="button"
          class="text-xs text-[var(--accent-ink)] hover:underline"
          @click="addKey"
        >
          + Key pair
        </button>
      </div>
      <div
        v-for="(pair, idx) in draft.keys"
        :key="idx"
        class="flex flex-wrap items-end gap-2 rounded-md border border-[var(--border-soft)] p-2"
      >
        <div class="min-w-[7rem] flex-1 flex flex-col gap-1">
          <label class="text-[10px] text-[var(--mute-soft)]">
            Left · {{ leftMeta.shortLabel }}
          </label>
          <select
            v-if="leftFields.length"
            v-model="pair.left"
            class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 font-mono text-sm text-[var(--ink)]"
            @change="emitUpdate"
          >
            <option value="">
              Select field…
            </option>
            <option
              v-for="f in leftSelectOptions(pair.left)"
              :key="f"
              :value="f"
            >
              {{ f }}
            </option>
          </select>
          <input
            v-else
            v-model="pair.left"
            type="text"
            placeholder="id"
            class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 font-mono text-sm text-[var(--ink)]"
            @change="emitUpdate"
          >
        </div>
        <span class="pb-2 text-xs text-[var(--mute)]">=</span>
        <div class="min-w-[7rem] flex-1 flex flex-col gap-1">
          <label class="text-[10px] text-[var(--mute-soft)]">
            Right · {{ rightMeta.shortLabel }}
          </label>
          <select
            v-if="rightFields.length"
            v-model="pair.right"
            class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 font-mono text-sm text-[var(--ink)]"
            @change="emitUpdate"
          >
            <option value="">
              Select field…
            </option>
            <option
              v-for="f in rightSelectOptions(pair.right)"
              :key="f"
              :value="f"
            >
              {{ f }}
            </option>
          </select>
          <input
            v-else
            v-model="pair.right"
            type="text"
            placeholder="id"
            class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 font-mono text-sm text-[var(--ink)]"
            @change="emitUpdate"
          >
        </div>
        <button
          type="button"
          class="pb-1 text-xs text-[var(--danger)] hover:underline"
          :disabled="draft.keys.length <= 1"
          @click="removeKey(idx)"
        >
          Remove
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  modelValue: { type: Object, default: () => ({}) },
  leftFields: { type: Array, default: () => [] },
  rightFields: { type: Array, default: () => [] },
  leftInfo: { type: Object, default: null },
  rightInfo: { type: Object, default: null },
  loadingFields: { type: Boolean, default: false },
  fieldsError: { type: String, default: '' },
})

const emit = defineEmits(['update:modelValue', 'fetch-fields'])

const draft = reactive({
  label: 'Merge',
  leftPrefix: 'a_',
  rightPrefix: 'b_',
  keys: [{ left: '', right: '' }],
})

const leftMeta = computed(() => sideMeta(props.leftInfo, 'Left input'))
const rightMeta = computed(() => sideMeta(props.rightInfo, 'Right input'))

/**
 * @param {Record<string, unknown> | null} info
 * @param {string} fallback
 */
function sideMeta(info, fallback) {
  const sourceName = info?.sourceName ? String(info.sourceName) : ''
  const label = sourceName || String(info?.label || fallback)
  const shortLabel = sourceName || String(info?.label || info?.nodeId || fallback)
  return {
    label,
    shortLabel,
    rowCount: info?.rowCount != null ? Number(info.rowCount) : null,
  }
}

/**
 * Keep a manually typed value selectable even if not in the discovered list.
 * @param {string} current
 */
function leftSelectOptions(current) {
  return mergeFieldOptions(props.leftFields, current)
}

/**
 * @param {string} current
 */
function rightSelectOptions(current) {
  return mergeFieldOptions(props.rightFields, current)
}

/**
 * @param {string[]} fields
 * @param {string} current
 */
function mergeFieldOptions(fields, current) {
  const list = Array.isArray(fields) ? [...fields] : []
  const cur = String(current || '').trim()
  if (cur && !list.includes(cur)) list.unshift(cur)
  return list
}

watch(
  () => props.modelValue,
  (v) => {
    draft.label = v?.label || 'Merge'
    draft.leftPrefix = typeof v?.leftPrefix === 'string' ? v.leftPrefix : 'a_'
    draft.rightPrefix = typeof v?.rightPrefix === 'string' ? v.rightPrefix : 'b_'
    const keys = Array.isArray(v?.keys) && v.keys.length
      ? v.keys.map((k) => ({ left: k?.left || '', right: k?.right || '' }))
      : [{ left: '', right: '' }]
    draft.keys = keys
  },
  { immediate: true, deep: true },
)

function emitUpdate() {
  emit('update:modelValue', {
    label: draft.label || 'Merge',
    leftPrefix: draft.leftPrefix ?? 'a_',
    rightPrefix: draft.rightPrefix ?? 'b_',
    keys: draft.keys.map((k) => ({
      left: String(k.left || '').trim(),
      right: String(k.right || '').trim(),
    })),
  })
}

function addKey() {
  draft.keys.push({ left: '', right: '' })
  emitUpdate()
}

/**
 * @param {number} idx
 */
function removeKey(idx) {
  if (draft.keys.length <= 1) return
  draft.keys.splice(idx, 1)
  emitUpdate()
}

defineExpose({
  flush() {
    emitUpdate()
  },
})

onMounted(() => {
  emit('fetch-fields')
})
</script>
