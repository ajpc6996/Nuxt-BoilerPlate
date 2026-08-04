<template>
  <div class="mx-auto w-full max-w-6xl flex-1 px-6 py-10 lg:px-8">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="font-display text-3xl font-semibold tracking-tight text-[var(--ink)]">
          Connections
        </h1>
        <p class="mt-2 max-w-2xl text-[var(--mute)]">
          Configure org data source instances from connector types. Runs server-side into a destination table namespace.
          Active org:
          <span class="text-[var(--accent-ink)]">{{ activeOrganization?.name || 'None' }}</span>
        </p>
      </div>
      <button
        type="button"
        class="btn-primary !px-4 !py-2"
        :disabled="!activeOrganization?.id"
        @click="openCreate"
      >
        New connection
      </button>
    </div>

    <p
      v-if="!activeOrganization?.id"
      class="panel mt-6 px-4 py-3 text-sm text-[var(--mute)]"
    >
      Select an organization to manage connections.
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
            <th class="px-3 py-2 font-medium">Type</th>
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
              {{ row.connector_types?.name || '—' }}
            </td>
            <td class="px-3 py-3 font-mono text-[var(--accent-ink)]">
              {{ row.destination_table }}
            </td>
            <td class="px-3 py-3">
              <span
                class="rounded px-2 py-0.5 text-xs font-medium"
                :class="statusClass(row.status)"
              >
                {{ row.status }}
              </span>
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
                  @click="runConnection(row, 'test')"
                >
                  Test
                </button>
                <button
                  type="button"
                  class="btn-primary !px-2 !py-1 text-xs"
                  :disabled="busyId === row.id"
                  @click="runConnection(row, 'run')"
                >
                  Run
                </button>
                <button
                  type="button"
                  class="text-xs text-[var(--danger)] hover:underline"
                  :disabled="busyId === row.id"
                  @click="removeConnection(row)"
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
              No connections yet.
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
          {{ editingId ? 'Edit connection' : 'New connection' }}
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
            <label class="text-xs font-medium text-[var(--mute)]">Connector type</label>
            <select
              v-model="form.connectorTypeId"
              class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)]"
              :disabled="Boolean(editingId)"
              @change="onTypeChange"
            >
              <option value="" disabled>Select type…</option>
              <option
                v-for="t in catalog"
                :key="t.id"
                :value="t.id"
              >
                {{ t.name }}
              </option>
            </select>
          </div>

          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium text-[var(--mute)]">Destination table</label>
            <input
              v-model="form.destinationTable"
              type="text"
              placeholder="e.g. sales_json"
              class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-sm text-[var(--ink)]"
            >
            <p class="text-xs text-[var(--mute-soft)]">
              Creates physical table <span class="font-mono">ingest.&lt;name&gt;</span>
              (a-z, 0-9, underscore). Re-run replaces this connection’s rows.
            </p>
          </div>

          <div v-if="selectedType">
            <h3 class="mb-2 text-sm font-semibold text-[var(--ink)]">Configuration</h3>
            <SchemaFormFields
              v-model="form.config"
              :schema="selectedType.config_schema"
            />
          </div>

          <div v-if="selectedType && hasCredentialFields">
            <h3 class="mb-2 text-sm font-semibold text-[var(--ink)]">Credentials</h3>
            <SchemaFormFields
              v-model="form.credentials"
              :schema="selectedType.credential_schema"
              secret
              :has-existing-secrets="form.hasSecrets"
            />
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
            @click="saveConnection"
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

useHead({ title: 'Connections' })

const { activeOrganization } = useOrganization()
const authedFetch = useAuthedFetch()

const items = ref([])
const catalog = ref([])
const pending = ref(false)
const error = ref('')
const notice = ref('')
const busyId = ref(null)
const editorOpen = ref(false)
const editingId = ref(null)
const saving = ref(false)

const form = reactive({
  name: '',
  connectorTypeId: '',
  destinationTable: '',
  config: {},
  credentials: {},
  hasSecrets: false,
})

const selectedType = computed(() =>
  catalog.value.find((t) => t.id === form.connectorTypeId) || null,
)

const hasCredentialFields = computed(() =>
  Boolean(Object.keys(selectedType.value?.credential_schema?.properties || {}).length),
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

function defaultsFromSchema(schema) {
  const out = {}
  const properties = schema?.properties || {}
  Object.entries(properties).forEach(([key, def]) => {
    if (def.default !== undefined) out[key] = def.default
  })
  return out
}

function onTypeChange() {
  form.config = defaultsFromSchema(selectedType.value?.config_schema)
  form.credentials = {}
}

function openCreate() {
  editingId.value = null
  form.name = ''
  form.connectorTypeId = catalog.value[0]?.id || ''
  form.destinationTable = ''
  form.config = defaultsFromSchema(selectedType.value?.config_schema)
  form.credentials = {}
  form.hasSecrets = false
  editorOpen.value = true
}

/**
 * @param {Record<string, unknown>} row
 */
async function openEdit(row) {
  error.value = ''
  try {
    const res = await authedFetch(`/api/connections/${row.id}`, {
      query: { organizationId: activeOrganization.value.id },
    })
    const item = res.item
    editingId.value = item.id
    form.name = item.name
    form.connectorTypeId = item.connector_type_id
    form.destinationTable = item.destination_table
    form.config = { ...(item.config || {}) }
    form.credentials = {}
    form.hasSecrets = Boolean(item.hasSecrets)
    editorOpen.value = true
  }
  catch (err) {
    error.value = err?.data?.statusMessage || err?.message || 'Failed to load connection'
  }
}

async function loadCatalog() {
  if (!activeOrganization.value?.id) return
  const res = await authedFetch('/api/connector-types/catalog', {
    query: { organizationId: activeOrganization.value.id },
  })
  catalog.value = res.items || []
}

async function loadConnections() {
  if (!activeOrganization.value?.id) {
    items.value = []
    return
  }
  pending.value = true
  error.value = ''
  try {
    await loadCatalog()
    const res = await authedFetch('/api/connections', {
      query: { organizationId: activeOrganization.value.id },
    })
    items.value = res.items || []
  }
  catch (err) {
    error.value = err?.data?.statusMessage || err?.message || 'Failed to load connections'
  }
  finally {
    pending.value = false
  }
}

async function saveConnection() {
  if (!activeOrganization.value?.id) return
  saving.value = true
  error.value = ''
  notice.value = ''
  try {
    if (editingId.value) {
      await authedFetch(`/api/connections/${editingId.value}`, {
        method: 'PUT',
        body: {
          organizationId: activeOrganization.value.id,
          name: form.name,
          destinationTable: form.destinationTable,
          config: form.config,
          credentials: form.credentials,
        },
      })
      notice.value = 'Connection updated'
    }
    else {
      await authedFetch('/api/connections', {
        method: 'POST',
        body: {
          organizationId: activeOrganization.value.id,
          connectorTypeId: form.connectorTypeId,
          name: form.name,
          destinationTable: form.destinationTable,
          config: form.config,
          credentials: form.credentials,
        },
      })
      notice.value = 'Connection created'
    }
    editorOpen.value = false
    await loadConnections()
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
async function runConnection(row, mode) {
  busyId.value = row.id
  error.value = ''
  notice.value = ''
  try {
    const res = await authedFetch(`/api/connections/${row.id}/run`, {
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
    await loadConnections()
  }
  catch (err) {
    error.value = err?.data?.statusMessage || err?.message || 'Run failed'
    await loadConnections()
  }
  finally {
    busyId.value = null
  }
}

/**
 * @param {Record<string, unknown>} row
 */
async function removeConnection(row) {
  if (!confirm(`Delete connection “${row.name}”?`)) return
  busyId.value = row.id
  error.value = ''
  try {
    await authedFetch(`/api/connections/${row.id}`, {
      method: 'DELETE',
      query: { organizationId: activeOrganization.value.id },
    })
    notice.value = 'Connection deleted'
    await loadConnections()
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
    loadConnections()
  },
  { immediate: true },
)
</script>
