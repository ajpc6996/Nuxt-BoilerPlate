<template>
  <div class="space-y-4">
    <div>
      <h3 class="text-sm font-semibold text-[var(--ink)]">Filter</h3>
      <p class="mt-1 text-xs text-[var(--mute)]">
        Keep flat fields and AND-match rows. Applied after Retrieve, before Ingest.
      </p>
    </div>

    <div class="rounded-md border border-[var(--border)] bg-[var(--surface)] p-3 space-y-2">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <p class="text-xs font-medium text-[var(--mute)]">Sample object (for field lists)</p>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="text-xs text-[var(--accent-ink)] hover:underline disabled:opacity-50"
            :disabled="loadingSample"
            @click="emit('fetch-sample')"
          >
            {{ loadingSample ? 'Fetching…' : 'Load from Retrieve' }}
          </button>
          <button
            type="button"
            class="text-xs text-[var(--mute)] hover:underline"
            @click="applyPaste"
          >
            Apply pasted JSON
          </button>
        </div>
      </div>
      <textarea
        v-model="pasteText"
        rows="4"
        placeholder='Paste one object, e.g. { "org_id": "…", "role": "read" }'
        class="w-full rounded-md border border-[var(--border)] bg-[var(--surface-raised)] px-2 py-1.5 font-mono text-xs text-[var(--ink)]"
      />
      <p
        v-if="sampleError"
        class="text-xs text-[var(--danger)]"
      >
        {{ sampleError }}
      </p>
      <p
        v-else-if="availableFields.length"
        class="text-xs text-[var(--mute-soft)]"
      >
        Fields: <span class="font-mono text-[var(--accent-ink)]">{{ availableFields.join(', ') }}</span>
      </p>
    </div>

    <div class="flex flex-col gap-1">
      <label class="text-xs font-medium text-[var(--mute)]">Keep fields</label>
      <div class="flex flex-wrap gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-2">
        <span
          v-for="(field, idx) in selectFields"
          :key="`${field}-${idx}`"
          class="inline-flex items-center gap-1 rounded bg-[var(--accent-soft)] px-2 py-0.5 font-mono text-xs text-[var(--ink)]"
        >
          {{ field }}
          <button
            type="button"
            class="text-[var(--mute)] hover:text-[var(--danger)]"
            @click="removeField(idx)"
          >
            ×
          </button>
        </span>
        <select
          v-if="availableFields.length"
          class="rounded border border-[var(--border)] bg-[var(--surface-raised)] px-2 py-1 font-mono text-xs text-[var(--ink)]"
          :value="''"
          @change="onAddFieldSelect($event)"
        >
          <option value="" disabled>Add field…</option>
          <option
            v-for="f in fieldsNotSelected"
            :key="f"
            :value="f"
          >
            {{ f }}
          </option>
        </select>
        <input
          v-model="fieldDraft"
          type="text"
          :placeholder="availableFields.length ? 'or type custom…' : 'type field, then comma or Enter'"
          class="min-w-[8rem] flex-1 bg-transparent px-1 py-0.5 font-mono text-sm text-[var(--ink)] outline-none"
          @keydown="onFieldKeydown"
          @blur="commitFieldDraft"
        >
      </div>
      <p class="text-xs text-[var(--mute-soft)]">
        Leave empty to keep all fields.
      </p>
    </div>

    <div>
      <div class="mb-2 flex items-center justify-between">
        <label class="text-xs font-medium text-[var(--mute)]">Row rules (AND)</label>
        <button
          type="button"
          class="text-xs text-[var(--accent-ink)] hover:underline"
          @click="addRule"
        >
          Add rule
        </button>
      </div>
      <div
        v-if="!where.length"
        class="rounded-md border border-dashed border-[var(--border)] px-3 py-4 text-center text-xs text-[var(--mute)]"
      >
        No row filters — all retrieved objects pass through (then field projection).
      </div>
      <div
        v-else
        class="space-y-2"
      >
        <div
          v-for="(rule, idx) in where"
          :key="idx"
          class="grid grid-cols-[1fr_auto_1fr_auto] gap-2"
        >
          <select
            v-if="availableFields.length"
            v-model="rule.field"
            class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 font-mono text-sm text-[var(--ink)]"
            @change="emitUpdate"
          >
            <option value="" disabled>field…</option>
            <option
              v-for="f in availableFields"
              :key="f"
              :value="f"
            >
              {{ f }}
            </option>
          </select>
          <input
            v-else
            v-model="rule.field"
            type="text"
            placeholder="field"
            class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 font-mono text-sm text-[var(--ink)]"
            @input="emitUpdate"
          >
          <select
            v-model="rule.op"
            class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm text-[var(--ink)]"
            @change="emitUpdate"
          >
            <option value="eq">equals</option>
            <option value="neq">not equals</option>
            <option value="contains">contains</option>
            <option value="not_contains">not contains</option>
          </select>
          <input
            v-model="rule.value"
            type="text"
            placeholder="value"
            class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm text-[var(--ink)]"
            @input="emitUpdate"
          >
          <button
            type="button"
            class="text-xs text-[var(--danger)] hover:underline"
            @click="removeRule(idx)"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  modelValue: {
    type: Object,
    default: () => ({}),
  },
  /** Flat sample object from Retrieve / paste */
  sampleObject: {
    type: Object,
    default: null,
  },
  loadingSample: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['update:modelValue', 'fetch-sample'])

const selectFields = ref([])
const fieldDraft = ref('')
const where = ref([])
const hydrating = ref(false)
const pasteText = ref('')
const sampleError = ref('')
const localSample = ref(null)

const availableFields = computed(() => {
  const obj = localSample.value || props.sampleObject
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return []
  return Object.keys(obj).filter((k) => !String(k).startsWith('_')).sort()
})

const fieldsNotSelected = computed(() =>
  availableFields.value.filter((f) => !selectFields.value.includes(f)),
)

watch(
  () => props.sampleObject,
  (val) => {
    if (val && typeof val === 'object') {
      localSample.value = val
      pasteText.value = JSON.stringify(val, null, 2)
      sampleError.value = ''
    }
  },
  { immediate: true },
)

watch(
  () => props.modelValue,
  (val) => {
    hydrating.value = true
    selectFields.value = Array.isArray(val?.select)
      ? val.select.map((s) => String(s).trim()).filter(Boolean)
      : []
    where.value = Array.isArray(val?.where)
      ? val.where.map((r) => ({
          field: r?.field || '',
          op: r?.op || 'eq',
          value: r?.value ?? '',
        }))
      : []
    nextTick(() => {
      hydrating.value = false
    })
  },
  { immediate: true, deep: true },
)

function emitUpdate() {
  if (hydrating.value) return
  emit('update:modelValue', {
    ...props.modelValue,
    label: props.modelValue?.label || 'Filter',
    select: [...selectFields.value],
    where: where.value.map((r) => ({
      field: String(r.field || '').trim(),
      op: r.op || 'eq',
      value: r.value ?? '',
    })),
  })
}

function applyPaste() {
  sampleError.value = ''
  try {
    const parsed = JSON.parse(pasteText.value || '')
    const obj = Array.isArray(parsed) ? parsed[0] : parsed
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      throw new Error('Paste a JSON object (or an array of objects)')
    }
    localSample.value = obj
  }
  catch (err) {
    sampleError.value = err?.message || 'Invalid JSON'
  }
}

/**
 * @param {Event} event
 */
function onAddFieldSelect(event) {
  const value = event.target?.value
  if (!value) return
  if (!selectFields.value.includes(value)) {
    selectFields.value.push(value)
    emitUpdate()
  }
  event.target.value = ''
}

/**
 * @param {KeyboardEvent} event
 */
function onFieldKeydown(event) {
  if (event.key === ',' || event.key === 'Enter') {
    event.preventDefault()
    commitFieldDraft()
  }
  else if (event.key === 'Backspace' && !fieldDraft.value && selectFields.value.length) {
    selectFields.value.pop()
    emitUpdate()
  }
}

function commitFieldDraft() {
  const parts = fieldDraft.value.split(',')
  let changed = false
  parts.forEach((part) => {
    const name = part.trim()
    if (!name) return
    if (!selectFields.value.includes(name)) {
      selectFields.value.push(name)
      changed = true
    }
  })
  fieldDraft.value = ''
  if (changed) emitUpdate()
}

/**
 * @param {number} idx
 */
function removeField(idx) {
  selectFields.value.splice(idx, 1)
  emitUpdate()
}

function addRule() {
  const defaultField = availableFields.value[0] || ''
  where.value.push({ field: defaultField, op: 'eq', value: '' })
  emitUpdate()
}

/**
 * @param {number} idx
 */
function removeRule(idx) {
  where.value.splice(idx, 1)
  emitUpdate()
}

function flush() {
  commitFieldDraft()
}

defineExpose({ flush })
</script>
