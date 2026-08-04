<template>
  <div class="space-y-4 rounded-md border border-[var(--border)] p-4">
    <div class="flex items-start gap-3">
      <input
        id="lookup-enabled"
        v-model="enabled"
        type="checkbox"
        class="mt-1"
      >
      <div>
        <label
          for="lookup-enabled"
          class="text-sm font-semibold text-[var(--ink)]"
        >
          Expand URL from ingest table
        </label>
        <p class="mt-1 text-xs text-[var(--mute)]">
          Resolve <span class="font-mono">{'{var}'}</span> placeholders in the path from distinct
          values in a previously ingested table. Each distinct tuple becomes one request; results are unioned.
        </p>
      </div>
    </div>

    <template v-if="enabled">
      <div class="flex flex-col gap-1">
        <label class="text-xs font-medium text-[var(--mute)]">Lookup table</label>
        <select
          v-model="lookupTable"
          class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-sm text-[var(--ink)]"
        >
          <option value="" disabled>Select ingest table…</option>
          <option
            v-for="t in tables"
            :key="t"
            :value="t"
          >
            ingest.{{ t }}
          </option>
        </select>
        <p
          v-if="tablesError"
          class="text-xs text-[var(--danger)]"
        >
          {{ tablesError }}
        </p>
      </div>

      <div class="flex flex-col gap-1">
        <label class="text-xs font-medium text-[var(--mute)]">Max URL expansions</label>
        <input
          v-model.number="maxExpansions"
          type="number"
          min="1"
          max="500"
          class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)]"
        >
      </div>

      <div v-if="pathVars.length">
        <h4 class="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--mute)]">
          Variable → column bindings
        </h4>
        <p
          v-if="!lookupTable"
          class="text-xs text-[var(--mute-soft)]"
        >
          Select a lookup table to map columns.
        </p>
        <div
          v-else
          class="space-y-2"
        >
          <div
            v-for="variable in pathVars"
            :key="variable"
            class="grid grid-cols-[1fr_1fr] gap-2"
          >
            <div class="rounded-md border border-[var(--border-soft)] px-3 py-2 font-mono text-sm text-[var(--ink)]">
              {{ '{' + variable + '}' }}
            </div>
            <select
              class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-sm text-[var(--ink)]"
              :value="bindingFor(variable)"
              @change="setBinding(variable, $event.target.value)"
            >
              <option value="" disabled>Column…</option>
              <option
                v-for="col in columns"
                :key="col.name"
                :value="col.name"
              >
                {{ col.name }}
              </option>
            </select>
          </div>
        </div>
      </div>
      <p
        v-else
        class="text-xs text-[var(--danger)]"
      >
        Add at least one <span class="font-mono">{'{var}'}</span> in the path template.
      </p>
    </template>
  </div>
</template>

<script setup>
const props = defineProps({
  modelValue: {
    type: Object,
    default: () => ({}),
  },
  pathTemplate: {
    type: String,
    default: '',
  },
  organizationId: {
    type: String,
    default: '',
  },
})

const emit = defineEmits(['update:modelValue'])
const authedFetch = useAuthedFetch()

const tables = ref([])
const columns = ref([])
const tablesError = ref('')

const pathVars = computed(() => {
  const out = []
  const re = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g
  let m
  while ((m = re.exec(props.pathTemplate || '')) !== null) {
    if (!out.includes(m[1])) out.push(m[1])
  }
  return out
})

const enabled = computed({
  get: () => Boolean(props.modelValue?.lookupEnabled),
  set: (v) => patch({ lookupEnabled: Boolean(v) }),
})

const lookupTable = computed({
  get: () => String(props.modelValue?.lookupTable || ''),
  set: (v) => patch({ lookupTable: v }),
})

const maxExpansions = computed({
  get: () => Number(props.modelValue?.maxExpansions) || 100,
  set: (v) => patch({ maxExpansions: Number(v) || 100 }),
})

/**
 * @param {Record<string, unknown>} partial
 */
function patch(partial) {
  emit('update:modelValue', {
    ...props.modelValue,
    ...partial,
  })
}

/**
 * @param {string} variable
 */
function bindingFor(variable) {
  const list = Array.isArray(props.modelValue?.lookupBindings)
    ? props.modelValue.lookupBindings
    : []
  const found = list.find((b) => b?.variable === variable)
  return found?.column || ''
}

/**
 * @param {string} variable
 * @param {string} column
 */
function setBinding(variable, column) {
  const list = Array.isArray(props.modelValue?.lookupBindings)
    ? [...props.modelValue.lookupBindings]
    : []
  const idx = list.findIndex((b) => b?.variable === variable)
  const next = { variable, column }
  if (idx >= 0) list[idx] = next
  else list.push(next)
  // Drop bindings for removed path vars
  const keep = new Set(pathVars.value)
  patch({
    lookupBindings: list.filter((b) => keep.has(b.variable)),
  })
}

async function loadTables() {
  tablesError.value = ''
  if (!props.organizationId) {
    tables.value = []
    return
  }
  try {
    const res = await authedFetch('/api/ingest/tables', {
      query: { organizationId: props.organizationId },
    })
    tables.value = res.items || []
  }
  catch (err) {
    tablesError.value = err?.data?.statusMessage || err?.message || 'Failed to list tables'
    tables.value = []
  }
}

async function loadColumns() {
  columns.value = []
  if (!props.organizationId || !lookupTable.value) return
  try {
    const res = await authedFetch('/api/ingest/columns', {
      query: {
        organizationId: props.organizationId,
        table: lookupTable.value,
      },
    })
    columns.value = res.items || []
  }
  catch {
    columns.value = []
  }
}

watch(
  () => props.organizationId,
  () => {
    loadTables()
  },
  { immediate: true },
)

watch(lookupTable, () => {
  loadColumns()
})

watch(pathVars, (vars) => {
  const list = Array.isArray(props.modelValue?.lookupBindings)
    ? props.modelValue.lookupBindings.filter((b) => vars.includes(b.variable))
    : []
  // Seed missing bindings with same-named column when available
  let changed = list.length !== (props.modelValue?.lookupBindings || []).length
  vars.forEach((variable) => {
    if (!list.some((b) => b.variable === variable)) {
      const col = columns.value.find((c) => c.name === variable)
      list.push({ variable, column: col?.name || '' })
      changed = true
    }
  })
  if (changed) patch({ lookupBindings: list })
})
</script>
