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

    <details class="panel px-3 py-2">
      <summary class="cursor-pointer text-sm font-medium text-[var(--ink)]">
        Known fields
        <span class="ml-1 font-normal text-[var(--mute)]">
          ({{ filteredSourceFields.length }} source · {{ filteredDestFields.length }} destination)
        </span>
      </summary>
      <div class="mt-3 grid gap-4 lg:grid-cols-2">
        <div>
          <div class="flex items-center gap-2">
            <h3 class="text-xs font-medium text-[var(--mute)]">
              Source
            </h3>
            <button
              type="button"
              class="inline-flex h-6 w-6 items-center justify-center rounded border border-[var(--border)] text-[var(--mute)] hover:border-[var(--accent)] hover:text-[var(--accent-ink)]"
              title="Upload JSON field schema"
              aria-label="Upload source JSON field schema"
              @click="triggerUpload('source')"
            >
              <svg class="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path d="M9.25 13.5V5.81L6.78 8.28a.75.75 0 01-1.06-1.06l3.5-3.5a.75.75 0 011.06 0l3.5 3.5a.75.75 0 01-1.06 1.06L10.75 5.81V13.5a.75.75 0 01-1.5 0z" />
                <path d="M4.5 14.75A.75.75 0 015.25 14h9.5a.75.75 0 010 1.5h-9.5a.75.75 0 01-.75-.75z" />
              </svg>
            </button>
            <div class="relative">
              <button
                type="button"
                class="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[var(--border)] text-[10px] font-semibold text-[var(--mute)] hover:border-[var(--accent)] hover:text-[var(--accent-ink)]"
                title="JSON schema format"
                aria-label="Source JSON schema format info"
                :aria-expanded="schemaInfoSide === 'source'"
                @click.stop="toggleSchemaInfo('source')"
              >
                i
              </button>
              <div
                v-if="schemaInfoSide === 'source'"
                class="absolute left-0 top-full z-20 mt-1 w-72 rounded-md border border-[var(--border)] bg-[var(--surface-raised)] p-3 text-[10px] text-[var(--mute)] shadow-lg"
                @click.stop
              >
                <p class="font-medium text-[var(--ink)]">
                  Upload merges into Known fields (does not replace).
                </p>
                <p class="mt-1">
                  Flat path → type. Dots = nesting. Empty type (&quot;&quot;) = untyped (no default).
                </p>
                <pre class="mt-2 overflow-x-auto rounded bg-[var(--surface)] p-2 font-mono text-[var(--ink)]">{{ schemaExample }}</pre>
              </div>
            </div>
          </div>
          <p
            v-if="uploadNotice && uploadNotice.side === 'source'"
            class="mt-1 text-[10px]"
            :class="uploadNotice.ok ? 'text-[var(--accent-ink)]' : 'text-[var(--danger)]'"
          >
            {{ uploadNotice.message }}
          </p>
          <ul class="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-[var(--mute)]">
            <li
              v-for="field in filteredSourceFields"
              :key="`src-${field}`"
              class="font-mono"
            >
              {{ field }}<span
                v-if="fieldTypeLabel('source', field)"
                class="ml-1 text-[var(--mute-soft)]"
              >· {{ fieldTypeLabel('source', field) }}</span>
            </li>
            <li
              v-if="!filteredSourceFields.length"
              class="text-[var(--mute-soft)]"
            >
              No source fields listed. Introspect, upload JSON, or generate a plan.
            </li>
          </ul>
        </div>
        <div>
          <div class="flex items-center gap-2">
            <h3 class="text-xs font-medium text-[var(--mute)]">
              Destination
            </h3>
            <button
              type="button"
              class="inline-flex h-6 w-6 items-center justify-center rounded border border-[var(--border)] text-[var(--mute)] hover:border-[var(--accent)] hover:text-[var(--accent-ink)]"
              title="Upload JSON field schema"
              aria-label="Upload destination JSON field schema"
              @click="triggerUpload('destination')"
            >
              <svg class="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path d="M9.25 13.5V5.81L6.78 8.28a.75.75 0 01-1.06-1.06l3.5-3.5a.75.75 0 011.06 0l3.5 3.5a.75.75 0 01-1.06 1.06L10.75 5.81V13.5a.75.75 0 01-1.5 0z" />
                <path d="M4.5 14.75A.75.75 0 015.25 14h9.5a.75.75 0 010 1.5h-9.5a.75.75 0 01-.75-.75z" />
              </svg>
            </button>
            <div class="relative">
              <button
                type="button"
                class="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[var(--border)] text-[10px] font-semibold text-[var(--mute)] hover:border-[var(--accent)] hover:text-[var(--accent-ink)]"
                title="JSON schema format"
                aria-label="Destination JSON schema format info"
                :aria-expanded="schemaInfoSide === 'destination'"
                @click.stop="toggleSchemaInfo('destination')"
              >
                i
              </button>
              <div
                v-if="schemaInfoSide === 'destination'"
                class="absolute left-0 top-full z-20 mt-1 w-72 rounded-md border border-[var(--border)] bg-[var(--surface-raised)] p-3 text-[10px] text-[var(--mute)] shadow-lg"
                @click.stop
              >
                <p class="font-medium text-[var(--ink)]">
                  Upload merges into Known fields (does not replace).
                </p>
                <p class="mt-1">
                  Flat path → type. Dots = nesting. Empty type (&quot;&quot;) = untyped (no default).
                </p>
                <pre class="mt-2 overflow-x-auto rounded bg-[var(--surface)] p-2 font-mono text-[var(--ink)]">{{ schemaExample }}</pre>
              </div>
            </div>
          </div>
          <p
            v-if="uploadNotice && uploadNotice.side === 'destination'"
            class="mt-1 text-[10px]"
            :class="uploadNotice.ok ? 'text-[var(--accent-ink)]' : 'text-[var(--danger)]'"
          >
            {{ uploadNotice.message }}
          </p>
          <ul class="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-[var(--mute)]">
            <li
              v-for="field in filteredDestFields"
              :key="`dest-${field}`"
              class="font-mono"
            >
              {{ field }}<span
                v-if="fieldTypeLabel('destination', field)"
                class="ml-1 text-[var(--mute-soft)]"
              >· {{ fieldTypeLabel('destination', field) }}</span>
            </li>
            <li
              v-if="!filteredDestFields.length"
              class="text-[var(--mute-soft)]"
            >
              No destination fields listed. Introspect, upload JSON, or generate a plan.
            </li>
          </ul>
        </div>
      </div>
      <input
        ref="fileInput"
        type="file"
        accept="application/json,.json,text/json"
        class="hidden"
        @change="onFileChosen"
      >
    </details>

    <div class="overflow-x-auto">
      <table class="min-w-full text-left text-xs">
        <thead class="border-b border-[var(--border)] text-[var(--mute)]">
          <tr>
            <th class="min-w-[12rem] px-2 py-2">Source(s)</th>
            <th class="min-w-[7rem] px-2 py-2">Transform</th>
            <th class="min-w-[12rem] px-2 py-2">Destination</th>
            <th class="min-w-[8rem] px-2 py-2">If null</th>
            <th class="px-2 py-2">Req</th>
            <th class="px-2 py-2" />
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, index) in visibleMappings"
            :key="row.id || `map-row-${index}`"
            class="border-b border-[var(--border-soft)]"
          >
            <td class="px-2 py-2 align-top">
              <FieldSuggestInput
                :model-value="(row.sources || []).join(', ')"
                :options="knownSourceFields"
                input-placeholder="field or field_a, field_b"
                select-label="Pick source field"
                @update:model-value="updateSources(row.id, $event)"
              />
            </td>
            <td class="px-2 py-2 align-top">
              <div class="flex min-w-[7rem] flex-col gap-1">
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
                  class="w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 font-mono text-[var(--ink)]"
                  placeholder="1 or __NOW__ or true"
                  @change="updateRow(row.id, { constantValue: parseConstant($event.target.value) })"
                >
              </div>
            </td>
            <td class="px-2 py-2 align-top">
              <FieldSuggestInput
                :model-value="row.destination || ''"
                :options="knownDestFields"
                input-placeholder="destination field"
                select-label="Pick destination field"
                @update:model-value="updateRow(row.id, { destination: $event })"
              />
            </td>
            <td class="px-2 py-2 align-top">
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
            <td class="px-2 py-2 align-top">
              <input
                type="checkbox"
                :checked="row.required"
                class="accent-[var(--accent)]"
                @change="updateRow(row.id, { required: $event.target.checked })"
              >
            </td>
            <td class="px-2 py-2 align-top">
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
      Use the ▾ button to pick a known column, or type a custom name (comma-separate
      multiple sources). Names stay in the list after you change a mapping.
    </p>

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
import FieldSuggestInput from '~/components/migration/FieldSuggestInput.vue'
import MappingIfNullInput from '~/components/migration/MappingIfNullInput.vue'
import { mergeFieldNames } from '~~/shared/migrationFieldOptions.js'
import {
  FIELD_SCHEMA_UPLOAD_EXAMPLE,
  mergeFieldTypeMaps,
  parseUploadedFieldSchema,
} from '~~/shared/migrationFieldSchemaUpload.js'

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  sourceFields: { type: Array, default: () => [] },
  destinationFields: { type: Array, default: () => [] },
  sourceFieldTypes: { type: Object, default: () => ({}) },
  destinationFieldTypes: { type: Object, default: () => ({}) },
  destinationSystemId: { type: String, default: '' },
  entityKey: { type: String, default: '' },
})

const emit = defineEmits(['update:modelValue', 'known-fields', 'import-schema'])

const filter = ref('')
const showUnmappedOnly = ref(false)
const rememberedSource = ref([])
const rememberedDest = ref([])
const localSourceTypes = ref({})
const localDestTypes = ref({})
const fileInput = ref(null)
const uploadSide = ref('source')
const schemaInfoSide = ref('')
const uploadNotice = ref(null)
const schemaExample = FIELD_SCHEMA_UPLOAD_EXAMPLE

const mappings = computed({
  get: () => (Array.isArray(props.modelValue) ? props.modelValue : []),
  set: (val) => emit('update:modelValue', val),
})

/**
 * @param {unknown[]} rows
 */
function namesFromMappings(rows) {
  const sources = []
  const destinations = []
  for (const row of rows || []) {
    if (Array.isArray(row?.sources)) sources.push(...row.sources)
    if (row?.destination) destinations.push(row.destination)
  }
  return { sources, destinations }
}

function rememberFields() {
  const fromRows = namesFromMappings(mappings.value)
  rememberedSource.value = mergeFieldNames(
    rememberedSource.value,
    props.sourceFields,
    fromRows.sources,
  )
  rememberedDest.value = mergeFieldNames(
    rememberedDest.value,
    props.destinationFields,
    fromRows.destinations,
  )
  localSourceTypes.value = mergeFieldTypeMaps(
    props.sourceFieldTypes,
    localSourceTypes.value,
  )
  localDestTypes.value = mergeFieldTypeMaps(
    props.destinationFieldTypes,
    localDestTypes.value,
  )
}

watch(
  () => props.entityKey,
  () => {
    rememberedSource.value = []
    rememberedDest.value = []
    localSourceTypes.value = {}
    localDestTypes.value = {}
    rememberFields()
  },
)

watch(
  [() => props.sourceFields, () => props.destinationFields, mappings],
  rememberFields,
  { deep: true, immediate: true },
)

watch(
  [() => props.sourceFieldTypes, () => props.destinationFieldTypes],
  () => {
    localSourceTypes.value = mergeFieldTypeMaps(
      props.sourceFieldTypes,
      localSourceTypes.value,
    )
    localDestTypes.value = mergeFieldTypeMaps(
      props.destinationFieldTypes,
      localDestTypes.value,
    )
  },
  { deep: true },
)

const knownSourceFields = computed(() =>
  mergeFieldNames(rememberedSource.value, props.sourceFields),
)

const knownDestFields = computed(() =>
  mergeFieldNames(rememberedDest.value, props.destinationFields),
)

watch(
  [knownSourceFields, knownDestFields],
  ([sourceFields, destinationFields]) => {
    emit('known-fields', {
      sourceFields,
      destinationFields,
      sourceFieldTypes: localSourceTypes.value,
      destinationFieldTypes: localDestTypes.value,
    })
  },
  { immediate: true },
)

const filteredSourceFields = computed(() => {
  const q = filter.value.trim().toLowerCase()
  const list = knownSourceFields.value
  if (!q) return list
  return list.filter((f) => String(f).toLowerCase().includes(q))
})

const filteredDestFields = computed(() => {
  const q = filter.value.trim().toLowerCase()
  const list = knownDestFields.value
  if (!q) return list
  return list.filter((f) => String(f).toLowerCase().includes(q))
})

/**
 * @param {'source'|'destination'} side
 * @param {string} field
 */
function fieldTypeLabel(side, field) {
  const map = side === 'source' ? localSourceTypes.value : localDestTypes.value
  return String(map?.[field] || '').trim()
}

/**
 * @param {'source'|'destination'} side
 */
function toggleSchemaInfo(side) {
  schemaInfoSide.value = schemaInfoSide.value === side ? '' : side
}

/**
 * @param {'source'|'destination'} side
 */
function triggerUpload(side) {
  uploadSide.value = side
  uploadNotice.value = null
  schemaInfoSide.value = ''
  fileInput.value?.click()
}

/**
 * @param {Event} event
 */
async function onFileChosen(event) {
  const input = /** @type {HTMLInputElement} */ (event.target)
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  const side = uploadSide.value
  try {
    const text = await file.text()
    const parsed = parseUploadedFieldSchema(text)
    if (side === 'source') {
      rememberedSource.value = mergeFieldNames(rememberedSource.value, parsed.names)
      localSourceTypes.value = mergeFieldTypeMaps(localSourceTypes.value, parsed.types)
    }
    else {
      rememberedDest.value = mergeFieldNames(rememberedDest.value, parsed.names)
      localDestTypes.value = mergeFieldTypeMaps(localDestTypes.value, parsed.types)
    }
    emit('import-schema', {
      side,
      names: parsed.names,
      types: parsed.types,
    })
    emit('known-fields', {
      sourceFields: knownSourceFields.value,
      destinationFields: knownDestFields.value,
      sourceFieldTypes: localSourceTypes.value,
      destinationFieldTypes: localDestTypes.value,
    })
    const typed = Object.keys(parsed.types).length
    uploadNotice.value = {
      side,
      ok: true,
      message: `Merged ${parsed.names.length} field(s)`
        + (typed ? ` (${typed} typed)` : ' (untyped or empty types)'),
    }
  }
  catch (err) {
    uploadNotice.value = {
      side,
      ok: false,
      message: err?.message || 'Failed to parse JSON schema',
    }
  }
}

onMounted(() => {
  document.addEventListener('click', onDocClick)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick)
})

function onDocClick() {
  schemaInfoSide.value = ''
}

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
