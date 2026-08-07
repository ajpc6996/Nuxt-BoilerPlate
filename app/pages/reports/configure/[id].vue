<template>
  <div class="mx-auto w-full max-w-[90rem] flex-1 px-6 py-10 lg:px-8">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div class="min-w-0">
        <h1 class="font-display text-3xl font-semibold tracking-tight text-[var(--ink)]">
          {{ form.name || (pending ? 'Loading…' : 'Edit report') }}
        </h1>
        <p class="mt-2 text-sm text-[var(--mute)]">
          Build a multi-table report from ingest sources.
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <NuxtLink
          to="/reports/configure"
          class="btn-secondary !px-3 !py-1.5 text-sm"
        >
          Back
        </NuxtLink>
        <NuxtLink
          :to="`/reports/${route.params.id}`"
          class="btn-secondary !px-3 !py-1.5 text-sm"
        >
          View
        </NuxtLink>
        <button
          type="button"
          class="btn-secondary !px-3 !py-1.5 text-sm"
          :disabled="previewing || pending"
          @click="runPreview"
        >
          {{ previewing ? 'Running…' : 'Preview' }}
        </button>
        <button
          type="button"
          class="btn-primary !px-3 !py-1.5 text-sm"
          :disabled="saving || pending"
          @click="save"
        >
          {{ saving ? 'Saving…' : 'Save' }}
        </button>
      </div>
    </div>

    <p
      v-if="error"
      class="panel mt-6 border-[var(--danger)] px-4 py-3 text-sm text-[var(--danger)]"
    >
      {{ error }}
    </p>
    <p
      v-if="notice"
      class="panel mt-6 border-[var(--accent)] bg-[var(--accent-soft)] px-4 py-3 text-sm text-[var(--ink)]"
    >
      {{ notice }}
    </p>

    <div
      v-if="pending"
      class="mt-8 text-sm text-[var(--mute)]"
    >
      Loading…
    </div>

    <template v-else-if="loaded">
      <section class="panel mt-6 overflow-hidden">
        <button
          type="button"
          class="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-[var(--surface-raised)]"
          :aria-expanded="settingsOpen"
          @click="settingsOpen = !settingsOpen"
        >
          <div class="min-w-0">
            <p class="text-sm font-semibold text-[var(--ink)]">
              Report settings
            </p>
            <p class="truncate text-[11px] text-[var(--mute)]">
              {{ form.name || 'Untitled' }} · {{ form.visibility }}
            </p>
          </div>
          <span
            class="shrink-0 text-xs text-[var(--mute)]"
            aria-hidden="true"
          >{{ settingsOpen ? '▾' : '▸' }}</span>
        </button>

        <div
          v-show="settingsOpen"
          class="space-y-3 border-t border-[var(--border-soft)] px-4 py-3"
        >
          <div class="grid gap-3 sm:grid-cols-2">
            <div class="flex flex-col gap-0.5">
              <label class="text-[10px] font-medium uppercase tracking-wide text-[var(--mute-soft)]">Name</label>
              <input
                v-model="form.name"
                type="text"
                class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm text-[var(--ink)]"
              >
            </div>
            <div class="flex flex-col gap-0.5">
              <label class="text-[10px] font-medium uppercase tracking-wide text-[var(--mute-soft)]">Visibility</label>
              <select
                v-model="form.visibility"
                class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm text-[var(--ink)]"
              >
                <option value="private">Private (owner + admins)</option>
                <option value="public">Public (all org members)</option>
              </select>
            </div>
          </div>
          <div class="flex flex-col gap-0.5">
            <label class="text-[10px] font-medium uppercase tracking-wide text-[var(--mute-soft)]">Description</label>
            <input
              v-model="form.description"
              type="text"
              class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm text-[var(--ink)]"
              placeholder="Optional"
            >
          </div>
        </div>
      </section>

      <section class="panel mt-4 p-4">
        <h2 class="text-sm font-semibold text-[var(--ink)]">
          Sources
        </h2>
        <p class="mt-1 text-xs text-[var(--mute)]">
          Select ingest tables. Aliases are assigned as t0, t1, …
        </p>
        <div
          v-if="!ingestTables.length"
          class="mt-3 text-sm text-[var(--mute)]"
        >
          No ingest tables found for this organization.
        </div>
        <div
          v-else
          class="mt-3 flex flex-wrap gap-2"
        >
          <label
            v-for="table in ingestTables"
            :key="table"
            class="flex items-center gap-1.5 rounded border border-[var(--border)] px-2 py-1 text-xs text-[var(--ink)]"
            :class="isSourceSelected(table) ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : ''"
          >
            <input
              type="checkbox"
              class="accent-[var(--accent)]"
              :checked="isSourceSelected(table)"
              @change="toggleSource(table, $event.target.checked)"
            >
            <span class="font-mono">{{ table }}</span>
            <span
              v-if="aliasForTable(table)"
              class="text-[var(--mute-soft)]"
            >· {{ aliasForTable(table) }}</span>
          </label>
        </div>

        <div
          v-if="queryConfig.sources.length"
          class="mt-3 overflow-x-auto"
        >
          <table class="min-w-full text-left text-xs">
            <thead class="text-[var(--mute)]">
              <tr>
                <th class="px-2 py-1 font-medium">Alias</th>
                <th class="px-2 py-1 font-medium">Table</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="src in queryConfig.sources"
                :key="src.alias"
                class="border-t border-[var(--border-soft)]"
              >
                <td class="px-2 py-1.5 font-mono text-[var(--accent-ink)]">{{ src.alias }}</td>
                <td class="px-2 py-1.5 font-mono text-[var(--ink)]">{{ src.table }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section
        v-if="queryConfig.sources.length > 1"
        class="panel mt-4 p-4"
      >
        <h2 class="text-sm font-semibold text-[var(--ink)]">
          Joins
        </h2>
        <p class="mt-1 text-xs text-[var(--mute)]">
          Define how each additional table joins prior sources.
        </p>
        <div class="mt-3 space-y-3">
          <div
            v-for="(src, idx) in queryConfig.sources.slice(1)"
            :key="src.alias"
            class="grid gap-2 rounded border border-[var(--border-soft)] p-3 sm:grid-cols-4"
          >
            <div class="flex flex-col gap-0.5 sm:col-span-4">
              <p class="text-xs font-medium text-[var(--ink)]">
                Join {{ src.alias }} ({{ src.table }})
              </p>
            </div>
            <div class="flex flex-col gap-0.5">
              <label class="text-[10px] uppercase tracking-wide text-[var(--mute-soft)]">Left field</label>
              <select
                v-model="queryConfig.joins[idx].left"
                class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm text-[var(--ink)]"
              >
                <option value="">Select…</option>
                <option
                  v-for="f in fieldsBeforeAlias(src.alias)"
                  :key="f"
                  :value="f"
                >
                  {{ f }}
                </option>
              </select>
            </div>
            <div class="flex flex-col gap-0.5">
              <label class="text-[10px] uppercase tracking-wide text-[var(--mute-soft)]">Right field</label>
              <select
                v-model="queryConfig.joins[idx].right"
                class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm text-[var(--ink)]"
              >
                <option value="">Select…</option>
                <option
                  v-for="f in fieldsForAlias(src.alias)"
                  :key="f"
                  :value="f"
                >
                  {{ f }}
                </option>
              </select>
            </div>
            <div class="flex flex-col gap-0.5">
              <label class="text-[10px] uppercase tracking-wide text-[var(--mute-soft)]">Type</label>
              <select
                v-model="queryConfig.joins[idx].type"
                class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm text-[var(--ink)]"
              >
                <option value="inner">Inner</option>
                <option value="left">Left</option>
              </select>
            </div>
          </div>
        </div>
      </section>

      <section class="panel mt-4 p-4">
        <div class="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 class="text-sm font-semibold text-[var(--ink)]">
              Fields
            </h2>
            <p class="mt-1 text-xs text-[var(--mute)]">
              Choose columns to display. Drag selected rows to reorder.
            </p>
          </div>
          <div class="flex flex-col gap-0.5">
            <label class="text-[10px] uppercase tracking-wide text-[var(--mute-soft)]">Row limit</label>
            <input
              v-model.number="queryConfig.limit"
              type="number"
              min="1"
              max="10000"
              class="w-28 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm text-[var(--ink)]"
            >
          </div>
        </div>

        <div
          v-if="!availableFields.length"
          class="mt-3 text-sm text-[var(--mute)]"
        >
          Select sources to load columns.
        </div>
        <div
          v-else
          class="mt-3 max-h-40 overflow-y-auto rounded border border-[var(--border-soft)] p-2"
        >
          <div class="flex flex-wrap gap-2">
            <label
              v-for="field in availableFields"
              :key="field"
              class="flex items-center gap-1.5 rounded border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--ink)]"
              :class="isFieldSelected(field) ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : ''"
            >
              <input
                type="checkbox"
                class="accent-[var(--accent)]"
                :checked="isFieldSelected(field)"
                @change="toggleField(field, $event.target.checked)"
              >
              <span class="font-mono">{{ field }}</span>
            </label>
          </div>
        </div>

        <ul
          v-if="queryConfig.fields.length"
          class="mt-4 space-y-2"
        >
          <li
            v-for="(fld, idx) in queryConfig.fields"
            :key="fld.as + '-' + fld.field"
            class="flex flex-wrap items-center gap-2 rounded border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
            draggable="true"
            @dragstart="onFieldDragStart(idx, $event)"
            @dragover.prevent
            @drop="onFieldDrop(idx, $event)"
          >
            <span
              class="cursor-grab text-[var(--mute-soft)]"
              title="Drag to reorder"
              aria-hidden="true"
            >⠿</span>
            <span class="min-w-0 flex-1 font-mono text-xs text-[var(--ink)]">{{ fld.field }}</span>
            <input
              v-model="fld.header"
              type="text"
              placeholder="Header (optional)"
              class="w-40 rounded-md border border-[var(--border)] bg-[var(--surface-raised)] px-2 py-1 text-xs text-[var(--ink)]"
              @change="onHeaderChange(fld)"
            >
            <button
              type="button"
              class="text-xs text-[var(--mute)] hover:text-[var(--ink)]"
              :disabled="idx === 0"
              @click="moveField(idx, -1)"
            >
              ↑
            </button>
            <button
              type="button"
              class="text-xs text-[var(--mute)] hover:text-[var(--ink)]"
              :disabled="idx === queryConfig.fields.length - 1"
              @click="moveField(idx, 1)"
            >
              ↓
            </button>
            <button
              type="button"
              class="text-xs text-[var(--danger)] hover:underline"
              @click="removeField(idx)"
            >
              Remove
            </button>
          </li>
        </ul>
      </section>

      <section
        v-if="previewShown"
        class="panel mt-4 h-[min(50vh,480px)] overflow-hidden p-2"
      >
        <div class="mb-2 flex items-center justify-between px-1">
          <h2 class="text-sm font-semibold text-[var(--ink)]">
            Preview
          </h2>
          <p class="text-xs text-[var(--mute)]">
            {{ previewRows.length }} row{{ previewRows.length === 1 ? '' : 's' }}
          </p>
        </div>
        <ClientOnly>
          <AppDataGrid
            :key="previewKey"
            :column-defs="previewColumnDefs"
            :adapter="previewAdapter"
            :default-col-def="{ editable: false }"
            height="calc(100% - 1.75rem)"
            :pagination="true"
            :pagination-page-size="displayConfig.pageSize || 25"
          />
          <template #fallback>
            <p class="p-4 text-sm text-[var(--mute)]">Loading grid…</p>
          </template>
        </ClientOnly>
      </section>
    </template>
  </div>
</template>

<script setup>
import {
  defaultFieldAs,
  emptyReportQueryConfig,
  normalizeReportDisplayConfig,
  normalizeReportQueryConfig,
  reportColumnDefs,
  validateReportQuery,
} from '~~/shared/report.js'
import { createLocalDataAdapter } from '~/utils/gridAdapters.js'

definePageMeta({
  layout: 'app',
  middleware: ['auth', 'admin'],
})

const route = useRoute()
const { activeOrganization } = useOrganization()
const authedFetch = useAuthedFetch()

const pending = ref(true)
const loaded = ref(false)
const saving = ref(false)
const previewing = ref(false)
const error = ref('')
const notice = ref('')
const settingsOpen = ref(true)
const ingestTables = ref([])
/** @type {import('vue').Ref<Record<string, string[]>>} */
const columnsByAlias = ref({})
const dragFieldIndex = ref(-1)

const form = reactive({
  name: '',
  description: '',
  visibility: 'private',
})

const queryConfig = reactive(emptyReportQueryConfig())
const displayConfig = reactive(normalizeReportDisplayConfig({}))

const previewRows = ref([])
const previewShown = ref(false)
const previewKey = ref(0)

const previewColumnDefs = computed(() => reportColumnDefs(queryConfig.fields))
const previewAdapter = createLocalDataAdapter(async () => previewRows.value)

useHead(() => ({ title: form.name || 'Edit report' }))

const availableFields = computed(() => {
  /** @type {string[]} */
  const out = []
  for (const src of queryConfig.sources) {
    const cols = columnsByAlias.value[src.alias] || []
    for (const col of cols) {
      out.push(`${src.alias}.${col}`)
    }
  }
  return out
})

function isSourceSelected(table) {
  return queryConfig.sources.some((s) => s.table === table)
}

function aliasForTable(table) {
  return queryConfig.sources.find((s) => s.table === table)?.alias || ''
}

/**
 * @param {string} alias
 */
function fieldsForAlias(alias) {
  const cols = columnsByAlias.value[alias] || []
  return cols.map((c) => `${alias}.${c}`)
}

/**
 * Fields from sources before the given alias (for join left side).
 * @param {string} alias
 */
function fieldsBeforeAlias(alias) {
  /** @type {string[]} */
  const out = []
  for (const src of queryConfig.sources) {
    if (src.alias === alias) break
    const cols = columnsByAlias.value[src.alias] || []
    for (const col of cols) {
      out.push(`${src.alias}.${col}`)
    }
  }
  return out
}

function isFieldSelected(field) {
  return queryConfig.fields.some((f) => f.field === field)
}

function syncJoins() {
  const needed = Math.max(0, queryConfig.sources.length - 1)
  while (queryConfig.joins.length < needed) {
    queryConfig.joins.push({ left: '', right: '', type: 'inner' })
  }
  while (queryConfig.joins.length > needed) {
    queryConfig.joins.pop()
  }
}

/**
 * Remap field/join references after alias changes.
 * @param {Record<string, string>} map oldAlias -> newAlias
 */
function remapAliases(map) {
  for (const f of queryConfig.fields) {
    const [a, col] = String(f.field).split('.')
    if (map[a] && map[a] !== a) {
      f.field = `${map[a]}.${col}`
      f.as = defaultFieldAs(f.field)
    }
  }
  for (const j of queryConfig.joins) {
    for (const side of ['left', 'right']) {
      const parts = String(j[side] || '').split('.')
      if (parts.length === 2 && map[parts[0]]) {
        j[side] = `${map[parts[0]]}.${parts[1]}`
      }
    }
  }
}

/**
 * @param {string} table
 * @param {boolean} checked
 */
function toggleSource(table, checked) {
  const oldAliases = Object.fromEntries(
    queryConfig.sources.map((s) => [s.table, s.alias]),
  )

  if (checked) {
    if (!isSourceSelected(table)) {
      queryConfig.sources.push({
        table,
        alias: `t${queryConfig.sources.length}`,
      })
    }
  }
  else {
    const idx = queryConfig.sources.findIndex((s) => s.table === table)
    if (idx === -1) return
    const removedAlias = queryConfig.sources[idx].alias
    queryConfig.sources.splice(idx, 1)
    queryConfig.fields = queryConfig.fields.filter(
      (f) => !String(f.field).startsWith(`${removedAlias}.`),
    )
    // Drop join that belonged to this source index (or trailing)
    if (idx === 0) {
      queryConfig.joins = []
    }
    else if (idx - 1 < queryConfig.joins.length) {
      queryConfig.joins.splice(idx - 1, 1)
    }
  }

  const aliasMap = {}
  queryConfig.sources.forEach((s, i) => {
    const prev = oldAliases[s.table]
    const next = `t${i}`
    if (prev && prev !== next) aliasMap[prev] = next
    s.alias = next
  })
  if (Object.keys(aliasMap).length) {
    remapAliases(aliasMap)
  }
  syncJoins()
  refreshAllColumns()
}

/**
 * @param {string} field
 * @param {boolean} checked
 */
function toggleField(field, checked) {
  if (checked) {
    if (!isFieldSelected(field)) {
      queryConfig.fields.push({
        field,
        as: defaultFieldAs(field),
        header: null,
      })
    }
  }
  else {
    const idx = queryConfig.fields.findIndex((f) => f.field === field)
    if (idx !== -1) queryConfig.fields.splice(idx, 1)
  }
}

/**
 * @param {number} idx
 */
function removeField(idx) {
  queryConfig.fields.splice(idx, 1)
}

/**
 * @param {number} idx
 * @param {number} delta
 */
function moveField(idx, delta) {
  const next = idx + delta
  if (next < 0 || next >= queryConfig.fields.length) return
  const [item] = queryConfig.fields.splice(idx, 1)
  queryConfig.fields.splice(next, 0, item)
}

/**
 * @param {number} idx
 * @param {DragEvent} event
 */
function onFieldDragStart(idx, event) {
  dragFieldIndex.value = idx
  event.dataTransfer?.setData('text/plain', String(idx))
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

/**
 * @param {number} toIdx
 * @param {DragEvent} event
 */
function onFieldDrop(toIdx, event) {
  event.preventDefault()
  const fromIdx = dragFieldIndex.value
  dragFieldIndex.value = -1
  if (fromIdx < 0 || fromIdx === toIdx) return
  const [item] = queryConfig.fields.splice(fromIdx, 1)
  queryConfig.fields.splice(toIdx, 0, item)
}

/**
 * @param {{ field: string, as: string, header: string|null }} fld
 */
function onHeaderChange(fld) {
  fld.header = String(fld.header || '').trim()
}

async function loadIngestTables() {
  if (!activeOrganization.value?.id) return
  try {
    const res = await authedFetch('/api/ingest/tables', {
      query: { organizationId: activeOrganization.value.id },
    })
    ingestTables.value = (res.items || [])
      .map((t) => (typeof t === 'string' ? t : (t.name || t.table_name || '')))
      .filter(Boolean)
      .sort()
  }
  catch {
    ingestTables.value = []
  }
}

/**
 * @param {string} alias
 * @param {string} table
 */
async function loadColumnsForAlias(alias, table) {
  if (!alias || !table || !activeOrganization.value?.id) return
  try {
    const res = await authedFetch('/api/ingest/columns', {
      query: {
        organizationId: activeOrganization.value.id,
        table,
      },
    })
    const cols = (res.items || [])
      .map((c) => (typeof c === 'string' ? c : c.name || c.column_name))
      .filter(Boolean)
    columnsByAlias.value = {
      ...columnsByAlias.value,
      [alias]: cols,
    }
  }
  catch {
    columnsByAlias.value = { ...columnsByAlias.value, [alias]: [] }
  }
}

async function refreshAllColumns() {
  columnsByAlias.value = {}
  await Promise.all(
    queryConfig.sources.map((s) => loadColumnsForAlias(s.alias, s.table)),
  )
}

function applyQueryConfig(raw) {
  const normalized = normalizeReportQueryConfig(raw)
  queryConfig.sources = normalized.sources.map((s) => ({ ...s }))
  queryConfig.joins = normalized.joins.map((j) => ({ ...j }))
  queryConfig.fields = normalized.fields.map((f) => ({
    ...f,
    header: f.header || '',
  }))
  queryConfig.limit = normalized.limit
  syncJoins()
}

async function load() {
  if (!activeOrganization.value?.id || !route.params.id) {
    loaded.value = false
    return
  }
  pending.value = true
  error.value = ''
  notice.value = ''
  try {
    await loadIngestTables()
    const res = await authedFetch(`/api/reports/${route.params.id}`, {
      query: { organizationId: activeOrganization.value.id },
    })
    const item = res.item
    form.name = item.name || ''
    form.description = item.description || ''
    form.visibility = item.visibility === 'public' ? 'public' : 'private'
    applyQueryConfig(item.query_config)
    const disp = normalizeReportDisplayConfig(item.display_config)
    displayConfig.pageSize = disp.pageSize
    await refreshAllColumns()
    loaded.value = true
  }
  catch (err) {
    error.value = err?.data?.statusMessage || err?.message || 'Failed to load report'
    loaded.value = false
  }
  finally {
    pending.value = false
  }
}

async function runPreview() {
  error.value = ''
  notice.value = ''
  const validationError = validateReportQuery(normalizeReportQueryConfig(queryConfig))
  if (validationError) {
    error.value = validationError
    return
  }
  previewing.value = true
  try {
    const res = await authedFetch('/api/reports/query', {
      method: 'POST',
      body: {
        organizationId: activeOrganization.value.id,
        queryConfig: normalizeReportQueryConfig(queryConfig),
      },
    })
    previewRows.value = res.rows || []
    previewShown.value = true
    previewKey.value += 1
    notice.value = `Preview returned ${previewRows.value.length} row(s)`
  }
  catch (err) {
    error.value = err?.data?.statusMessage || err?.message || 'Preview failed'
  }
  finally {
    previewing.value = false
  }
}

async function save() {
  error.value = ''
  notice.value = ''
  if (!form.name.trim()) {
    error.value = 'Name is required'
    return
  }
  saving.value = true
  try {
    const res = await authedFetch(`/api/reports/${route.params.id}`, {
      method: 'PUT',
      body: {
        organizationId: activeOrganization.value.id,
        name: form.name.trim(),
        description: form.description.trim() || null,
        visibility: form.visibility,
        queryConfig: normalizeReportQueryConfig(queryConfig),
        displayConfig: normalizeReportDisplayConfig(displayConfig),
      },
    })
    form.name = res.item.name
    form.description = res.item.description || ''
    form.visibility = res.item.visibility === 'public' ? 'public' : 'private'
    applyQueryConfig(res.item.query_config)
    notice.value = 'Report saved'
  }
  catch (err) {
    error.value = err?.data?.statusMessage || err?.message || 'Save failed'
  }
  finally {
    saving.value = false
  }
}

watch(
  () => [activeOrganization.value?.id, route.params.id],
  () => load(),
  { immediate: true },
)
</script>
