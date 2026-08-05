<template>
  <div class="mx-auto w-full max-w-6xl flex-1 px-6 py-10 lg:px-8">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="font-display text-3xl font-semibold tracking-tight text-[var(--ink)]">
          Sources
        </h1>
        <p class="mt-2 max-w-2xl text-[var(--mute)]">
          Endpoint-specific ingest jobs. Each source reuses a connection’s credentials; path, paging, and destination are per source.
          Active org:
          <span class="text-[var(--accent-ink)]">{{ activeOrganization?.name || 'None' }}</span>
        </p>
      </div>
      <button
        type="button"
        class="btn-primary !px-4 !py-2"
        :disabled="!activeOrganization?.id || !connections.length"
        @click="openCreate"
      >
        New source
      </button>
    </div>

    <p
      v-if="activeOrganization?.id && !connections.length && !pending"
      class="panel mt-6 px-4 py-3 text-sm text-[var(--mute)]"
    >
      Create a
      <NuxtLink
        to="/data-sources/connections"
        class="text-[var(--accent-ink)] underline"
      >connection</NuxtLink>
      first, then add sources that reuse it.
    </p>

    <p
      v-if="error"
      class="panel mt-6 border-[var(--danger)] px-4 py-3 text-sm text-[var(--danger)]"
    >
      {{ error }}
    </p>

    <p
      v-if="notice"
      class="panel mt-6 whitespace-pre-wrap border-[var(--accent)] bg-[var(--accent-soft)] px-4 py-3 text-sm text-[var(--ink)]"
    >
      {{ notice }}
    </p>

    <div
      v-if="pending"
      class="mt-8 text-sm text-[var(--mute)]"
    >
      Loading…
    </div>

    <div
      v-else-if="activeOrganization?.id"
      class="mt-8 overflow-x-auto"
    >
      <table class="min-w-full text-left text-sm">
        <thead class="border-b border-[var(--border)] text-[var(--mute)]">
          <tr>
            <th class="px-3 py-2 font-medium">Name</th>
            <th class="px-3 py-2 font-medium">Connection</th>
            <th class="px-3 py-2 font-medium">Destination</th>
            <th class="px-3 py-2 font-medium">Status</th>
            <th class="px-3 py-2 font-medium">Last run</th>
            <th class="px-3 py-2 font-medium" />
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in items"
            :key="row.id"
            class="border-b border-[var(--border-soft)]"
          >
            <td class="px-3 py-3 text-[var(--ink)]">{{ row.name }}</td>
            <td class="px-3 py-3 text-[var(--mute)]">
              {{ row.connections?.name || '—' }}
            </td>
            <td class="px-3 py-3 font-mono text-[var(--accent-ink)]">
              {{ row.destination_table }}
            </td>
            <td class="px-3 py-3">
              <div class="flex flex-col gap-1">
                <span
                  class="rounded px-2 py-0.5 text-xs font-medium w-fit"
                  :class="statusClass(row.status)"
                  :title="row.status === 'error' ? row.last_error : ''"
                >
                  {{ row.status }}
                </span>
                <p
                  v-if="row.status === 'error' && row.last_error"
                  class="text-xs text-[var(--danger)] max-w-[26rem] whitespace-pre-wrap break-words"
                >
                  {{ truncateError(row.last_error) }}
                </p>
              </div>
            </td>
            <td class="px-3 py-3 text-[var(--mute)]">
              {{ formatDate(row.last_run_at) }}
            </td>
            <td class="px-3 py-3">
              <div class="flex flex-wrap gap-2">
                <button
                  type="button"
                  class="btn-secondary !px-2 !py-1 text-xs"
                  @click="openEdit(row)"
                >
                  Edit
                </button>
                <button
                  type="button"
                  class="btn-secondary !px-2 !py-1 text-xs"
                  :disabled="busyId === row.id"
                  @click="runSource(row, 'test')"
                >
                  Test
                </button>
                <button
                  type="button"
                  class="btn-primary !px-2 !py-1 text-xs"
                  :disabled="busyId === row.id"
                  @click="runSource(row, 'run')"
                >
                  Run
                </button>
                <button
                  type="button"
                  class="text-xs text-[var(--danger)] hover:underline"
                  :disabled="busyId === row.id"
                  @click="removeSource(row)"
                >
                  Delete
                </button>
              </div>
            </td>
          </tr>
          <tr v-if="!items.length">
            <td
              colspan="6"
              class="px-3 py-8 text-center text-[var(--mute)]"
            >
              No sources yet.
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div
      v-if="editorOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-[var(--modal-scrim)] p-4"
      @click.self="editorOpen = false"
    >
      <div class="panel max-h-[90vh] w-full max-w-xl overflow-y-auto px-6 py-5">
        <h2 class="font-display text-xl font-semibold text-[var(--ink)]">
          {{ editingId ? 'Edit source' : 'New source' }}
        </h2>

        <div class="mt-4 space-y-4">
          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium text-[var(--mute)]">Name</label>
            <input
              v-model="form.name"
              type="text"
              class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)]"
            >
          </div>

          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium text-[var(--mute)]">Connection</label>
            <select
              v-model="form.connectionId"
              class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)]"
              @change="onConnectionChange"
            >
              <option value="" disabled>Select connection…</option>
              <option
                v-for="c in connections"
                :key="c.id"
                :value="c.id"
              >
                {{ c.name }} ({{ c.connector_types?.name || 'type' }})
              </option>
            </select>
          </div>

          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium text-[var(--mute)]">Destination table</label>
            <input
              v-model="form.destinationTable"
              type="text"
              placeholder="e.g. teams_players"
              class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-sm text-[var(--ink)]"
            >
            <p class="text-xs text-[var(--mute-soft)]">
              Creates <span class="font-mono">ingest.&lt;name&gt;</span>. Re-run replaces this source’s rows.
            </p>
          </div>

          <div v-if="selectedType">
            <h3 class="mb-2 text-sm font-semibold text-[var(--ink)]">Source configuration</h3>
            <SchemaFormFields
              v-model="form.config"
              :schema="selectedType.config_schema"
              :omit-keys="lookupOmitKeys"
            />
            <div
              v-if="supportsLookup"
              class="mt-4"
            >
              <ConnectionLookupConfig
                v-model="form.config"
                :path-template="String(form.config.path || '')"
                :organization-id="activeOrganization?.id || ''"
              />
            </div>
          </div>
        </div>

        <div class="mt-6 flex justify-end gap-2">
          <button
            type="button"
            class="btn-secondary !px-4 !py-2"
            @click="editorOpen = false"
          >
            Cancel
          </button>
          <button
            type="button"
            class="btn-primary !px-4 !py-2"
            :disabled="saving"
            @click="saveSource"
          >
            {{ saving ? 'Saving…' : 'Save' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
definePageMeta({
  layout: 'app',
  middleware: ['auth', 'admin'],
})

useHead({ title: 'Sources' })

const route = useRoute()
const { activeOrganization } = useOrganization()
const authedFetch = useAuthedFetch()

const items = ref([])
const connections = ref([])
const catalogByTypeId = ref({})
const pending = ref(false)
const error = ref('')
const notice = ref('')
const busyId = ref(null)
const editorOpen = ref(false)
const editingId = ref(null)
const saving = ref(false)

const form = reactive({
  name: '',
  connectionId: '',
  destinationTable: '',
  config: {},
})

const selectedConnection = computed(() =>
  connections.value.find((c) => c.id === form.connectionId) || null,
)

const selectedType = computed(() => {
  const typeId = selectedConnection.value?.connector_type_id
    || selectedConnection.value?.connector_types?.id
  if (!typeId) return null
  return catalogByTypeId.value[typeId] || selectedConnection.value?.connector_types || null
})

const supportsLookup = computed(() =>
  selectedType.value?.runner_key === 'rest_generic'
  || Boolean(selectedType.value?.capabilities?.lookupExpansion),
)

const lookupOmitKeys = computed(() =>
  supportsLookup.value
    ? ['lookupEnabled', 'lookupTable', 'maxExpansions']
    : [],
)

function statusClass(status) {
  if (status === 'ready') return 'bg-emerald-500/15 text-emerald-300'
  if (status === 'error') return 'bg-red-500/15 text-[var(--danger)]'
  return 'bg-[var(--accent-soft)] text-[var(--mute)]'
}

function formatDate(value) {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleString()
  }
  catch {
    return value
  }
}

function truncateError(value) {
  const s = String(value || '')
  if (!s) return ''
  return s.length > 900 ? `${s.slice(0, 900)}…` : s
}

function defaultsFromSchema(schema) {
  const out = {}
  const properties = schema?.properties || {}
  Object.entries(properties).forEach(([key, def]) => {
    if (def.default !== undefined) out[key] = def.default
  })
  return out
}

function onConnectionChange() {
  form.config = defaultsFromSchema(selectedType.value?.config_schema)
}

function openCreate() {
  editingId.value = null
  form.name = ''
  form.connectionId = String(route.query.connectionId || connections.value[0]?.id || '')
  form.destinationTable = ''
  form.config = defaultsFromSchema(selectedType.value?.config_schema)
  editorOpen.value = true
}

/**
 * @param {Record<string, unknown>} row
 */
async function openEdit(row) {
  error.value = ''
  try {
    const res = await authedFetch(`/api/data-sources/${row.id}`, {
      query: { organizationId: activeOrganization.value.id },
    })
    const item = res.item
    editingId.value = item.id
    form.name = item.name
    form.connectionId = item.connection_id
    form.destinationTable = item.destination_table
    form.config = { ...(item.config || {}) }
    editorOpen.value = true
  }
  catch (err) {
    error.value = err?.data?.statusMessage || err?.message || 'Failed to load source'
  }
}

async function load() {
  if (!activeOrganization.value?.id) {
    items.value = []
    connections.value = []
    return
  }
  pending.value = true
  error.value = ''
  try {
    const [connRes, catalogRes, srcRes] = await Promise.all([
      authedFetch('/api/connections', {
        query: { organizationId: activeOrganization.value.id },
      }),
      authedFetch('/api/connector-types/catalog', {
        query: { organizationId: activeOrganization.value.id },
      }),
      authedFetch('/api/data-sources', {
        query: { organizationId: activeOrganization.value.id },
      }),
    ])
    connections.value = connRes.items || []
    const map = {}
    ;(catalogRes.items || []).forEach((t) => {
      map[t.id] = t
    })
    catalogByTypeId.value = map
    items.value = srcRes.items || []
  }
  catch (err) {
    error.value = err?.data?.statusMessage || err?.message || 'Failed to load sources'
  }
  finally {
    pending.value = false
  }
}

async function saveSource() {
  if (!activeOrganization.value?.id) return
  saving.value = true
  error.value = ''
  notice.value = ''
  try {
    if (editingId.value) {
      await authedFetch(`/api/data-sources/${editingId.value}`, {
        method: 'PUT',
        body: {
          organizationId: activeOrganization.value.id,
          name: form.name,
          connectionId: form.connectionId,
          destinationTable: form.destinationTable,
          config: form.config,
        },
      })
      notice.value = 'Source updated'
    }
    else {
      await authedFetch('/api/data-sources', {
        method: 'POST',
        body: {
          organizationId: activeOrganization.value.id,
          connectionId: form.connectionId,
          name: form.name,
          destinationTable: form.destinationTable,
          config: form.config,
        },
      })
      notice.value = 'Source created'
    }
    editorOpen.value = false
    await load()
  }
  catch (err) {
    error.value = err?.data?.statusMessage || err?.message || 'Save failed'
  }
  finally {
    saving.value = false
  }
}

/**
 * @param {Record<string, unknown>} row
 * @param {'test'|'run'} mode
 */
async function runSource(row, mode) {
  busyId.value = row.id
  error.value = ''
  notice.value = ''
  try {
    const res = await authedFetch(`/api/data-sources/${row.id}/run`, {
      method: 'POST',
      body: {
        organizationId: activeOrganization.value.id,
        mode,
      },
    })
    if (mode === 'test') {
      const preview = JSON.stringify(res.sample || [], null, 2).slice(0, 800)
      notice.value = `Test OK — fetched ${res.rowsFetched} row(s). Preview:\n${preview}`
    }
    else {
      notice.value = `Run OK — wrote ${res.rowsWritten} row(s) to ${res.physicalTable || res.destinationTable}.`
    }
    await load()
  }
  catch (err) {
    await load()
    error.value = err?.data?.statusMessage || err?.message || 'Run failed'
  }
  finally {
    busyId.value = null
  }
}

/**
 * @param {Record<string, unknown>} row
 */
async function removeSource(row) {
  if (!confirm(`Delete source “${row.name}”?`)) return
  busyId.value = row.id
  error.value = ''
  try {
    await authedFetch(`/api/data-sources/${row.id}`, {
      method: 'DELETE',
      query: { organizationId: activeOrganization.value.id },
    })
    notice.value = 'Source deleted'
    await load()
  }
  catch (err) {
    error.value = err?.data?.statusMessage || err?.message || 'Delete failed'
  }
  finally {
    busyId.value = null
  }
}

watch(
  () => activeOrganization.value?.id,
  () => {
    load()
  },
  { immediate: true },
)
</script>
