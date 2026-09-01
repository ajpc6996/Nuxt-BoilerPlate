<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center gap-3">
      <input
        v-model="filter"
        type="search"
        placeholder="Filter fields…"
        class="min-w-[12rem] flex-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--ink)]"
      >
      <label class="inline-flex items-center gap-2 text-xs text-[var(--mute)]">
        <input
          v-model="showUnmappedOnly"
          type="checkbox"
          class="accent-[var(--accent)]"
        >
        Required unmapped only
      </label>
    </div>

    <div class="grid gap-4 lg:grid-cols-2">
      <details
        class="panel px-3 py-2"
        open
      >
        <summary class="cursor-pointer text-sm font-medium text-[var(--ink)]">
          Source fields ({{ filteredSourceFields.length }})
        </summary>
        <ul class="mt-2 max-h-48 space-y-1 overflow-y-auto text-xs text-[var(--mute)]">
          <li
            v-for="field in filteredSourceFields"
            :key="field"
            class="font-mono"
          >
            {{ field }}
          </li>
          <li v-if="!filteredSourceFields.length" class="text-[var(--mute-soft)]">
            No source fields listed.
          </li>
        </ul>
      </details>

      <details class="panel px-3 py-2">
        <summary class="cursor-pointer text-sm font-medium text-[var(--ink)]">
          Destination fields ({{ filteredDestFields.length }})
        </summary>
        <ul class="mt-2 max-h-48 space-y-1 overflow-y-auto text-xs text-[var(--mute)]">
          <li
            v-for="field in filteredDestFields"
            :key="field"
            class="font-mono"
          >
            {{ field }}
          </li>
          <li v-if="!filteredDestFields.length" class="text-[var(--mute-soft)]">
            No destination fields listed.
          </li>
        </ul>
      </details>
    </div>

    <div class="overflow-x-auto">
      <table class="min-w-full text-left text-xs">
        <thead class="border-b border-[var(--border)] text-[var(--mute)]">
          <tr>
            <th class="px-2 py-2">Source(s)</th>
            <th class="px-2 py-2">Transform</th>
            <th class="px-2 py-2">Destination</th>
            <th class="px-2 py-2">If null</th>
            <th class="px-2 py-2">Req</th>
            <th class="px-2 py-2" />
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in visibleMappings"
            :key="row.id || row.destination"
            class="border-b border-[var(--border-soft)]"
          >
            <td class="px-2 py-2">
              <input
                :value="(row.sources || []).join(', ')"
                class="w-full min-w-[8rem] rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 font-mono text-[var(--ink)]"
                placeholder="field_a, field_b"
                @change="updateSources(row.id, $event.target.value)"
              >
            </td>
            <td class="px-2 py-2">
              <select
                :value="row.transform || 'copy'"
                class="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[var(--ink)]"
                @change="updateRow(row.id, { transform: $event.target.value })"
              >
                <option value="copy">copy</option>
                <option value="constant">constant</option>
                <option value="template">template</option>
                <option value="map">map</option>
                <option value="join">join</option>
              </select>
              <input
                v-if="row.transform === 'constant'"
                :value="formatConstant(row.constantValue)"
                class="mt-1 w-full min-w-[8rem] rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 font-mono text-[var(--ink)]"
                placeholder="1 or __NOW__ or true"
                @change="updateRow(row.id, { constantValue: parseConstant($event.target.value) })"
              >
            </td>
            <td class="px-2 py-2">
              <input
                :value="row.destination"
                class="w-full min-w-[8rem] rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 font-mono text-[var(--ink)]"
                list="migration-dest-fields"
                @input="updateRow(row.id, { destination: $event.target.value })"
              >
            </td>
            <td class="px-2 py-2">
              <MappingIfNullInput
                v-if="showIfNull(row)"
                :model-value="row.ifNullValue"
                :destination="row.destination"
                :destination-system-id="destinationSystemId"
                :entity-key="entityKey"
                @update:model-value="updateRow(row.id, { ifNullValue: $event })"
              />
              <span
                v-else
                class="text-[var(--mute-soft)]"
              >
                —
              </span>
            </td>
            <td class="px-2 py-2">
              <input
                type="checkbox"
                :checked="row.required"
                class="accent-[var(--accent)]"
                @change="updateRow(row.id, { required: $event.target.checked })"
              >
            </td>
            <td class="px-2 py-2">
              <button
                type="button"
                class="text-[var(--danger)] hover:underline"
                @click="removeRow(row.id)"
              >
                Remove
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <p class="text-xs text-[var(--mute-soft)]">
      <span class="font-medium text-[var(--mute)]">If null</span> sets a static destination value when the mapped source is null
      (after copy/map/cast). Restricted fields show a dropdown of valid values.
    </p>

    <datalist id="migration-dest-fields">
      <option
        v-for="field in destinationFields"
        :key="field"
        :value="field"
      />
    </datalist>

    <button
      type="button"
      class="btn-secondary self-start !px-3 !py-1.5 text-xs"
      @click="addRow"
    >
      Add mapping
    </button>
  </div>
</template>

<script setup>
const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  sourceFields: { type: Array, default: () => [] },
  destinationFields: { type: Array, default: () => [] },
  destinationSystemId: { type: String, default: '' },
  entityKey: { type: String, default: '' },
})

const emit = defineEmits(['update:modelValue'])

const filter = ref('')
const showUnmappedOnly = ref(false)

const mappings = computed({
  get: () => (Array.isArray(props.modelValue) ? props.modelValue : []),
  set: (val) => emit('update:modelValue', val),
})

const filteredSourceFields = computed(() => {
  const q = filter.value.trim().toLowerCase()
  const list = props.sourceFields || []
  if (!q) return list
  return list.filter((f) => String(f).toLowerCase().includes(q))
})

const filteredDestFields = computed(() => {
  const q = filter.value.trim().toLowerCase()
  const list = props.destinationFields || []
  if (!q) return list
  return list.filter((f) => String(f).toLowerCase().includes(q))
})

const visibleMappings = computed(() => {
  let rows = mappings.value
  if (showUnmappedOnly.value) {
    rows = rows.filter((r) => r.required && !(r.destination && (r.sources || []).length))
  }
  const q = filter.value.trim().toLowerCase()
  if (!q) return rows
  return rows.filter((r) =>
    [r.destination, ...(r.sources || [])].some((v) => String(v || '').toLowerCase().includes(q)),
  )
})

const patchMappings = (next) => {
  mappings.value = next
}

const addRow = () => {
  patchMappings([
    ...mappings.value,
    {
      id: `map_${Date.now()}`,
      sources: [],
      destination: '',
      transform: 'copy',
      required: false,
    },
  ])
}

const removeRow = (id) => {
  patchMappings(mappings.value.filter((row) => row.id !== id))
}

const updateRow = (id, patch) => {
  const next = mappings.value.map((row) => (row.id === id ? { ...row, ...patch } : row))
  patchMappings(next)
}

const updateSources = (id, raw) => {
  const sources = String(raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  updateRow(id, { sources })
}

/**
 * @param {Record<string, unknown>} row
 */
function showIfNull(row) {
  const transform = String(row.transform || 'copy').trim()
  return transform !== 'constant'
}

function formatConstant(value) {
  if (value === undefined || value === null) return ''
  if (typeof value === 'boolean' || typeof value === 'number') return String(value)
  return String(value)
}

function parseConstant(raw) {
  const s = String(raw ?? '').trim()
  if (s === '') return ''
  if (s === 'true') return true
  if (s === 'false') return false
  if (s === '__NOW__' || s === '{{now}}') return '__NOW__'
  if (/^-?\d+$/.test(s)) {
    const n = Number(s)
    if (Number.isSafeInteger(n)) return n
  }
  return s
}
</script>
