<template>
  <div class="mx-auto w-full max-w-6xl flex-1 px-6 py-10 lg:px-8">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="font-display text-3xl font-semibold tracking-tight text-[var(--ink)]">
          {{ form.name || 'Edit dashboard' }}
        </h1>
        <p class="mt-2 text-sm text-[var(--mute)]">
          Configure visibility, widgets, joins, and chart types.
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <NuxtLink
          :to="`/dashboards/${route.params.id}`"
          class="btn-secondary !px-3 !py-1.5 text-sm"
        >
          View
        </NuxtLink>
        <NuxtLink
          to="/dashboards/configure"
          class="btn-secondary !px-3 !py-1.5 text-sm"
        >
          Back
        </NuxtLink>
        <button
          type="button"
          class="btn-primary !px-3 !py-1.5 text-sm"
          :disabled="saving"
          @click="saveDashboard"
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

    <template v-else>
      <section class="panel mt-8 space-y-4 px-5 py-4">
        <h2 class="text-sm font-semibold text-[var(--ink)]">
          Dashboard
        </h2>
        <div class="grid gap-3 sm:grid-cols-2">
          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium text-[var(--mute)]">Name</label>
            <input
              v-model="form.name"
              type="text"
              class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)]"
            >
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium text-[var(--mute)]">Visibility</label>
            <select
              v-model="form.visibility"
              class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)]"
            >
              <option value="private">Private</option>
              <option value="role">Role-limited</option>
              <option value="public">Public in org</option>
            </select>
          </div>
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-xs font-medium text-[var(--mute)]">Description</label>
          <textarea
            v-model="form.description"
            rows="2"
            class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)]"
          />
        </div>
        <div
          v-if="form.visibility === 'role'"
          class="flex flex-col gap-2"
        >
          <label class="text-xs font-medium text-[var(--mute)]">Roles that can view</label>
          <div class="flex flex-wrap gap-2">
            <label
              v-for="role in orgRoles"
              :key="role.id"
              class="flex items-center gap-2 rounded-md border border-[var(--border)] px-2 py-1 text-xs text-[var(--ink)]"
            >
              <input
                v-model="form.roleIds"
                type="checkbox"
                :value="role.id"
                class="accent-[var(--accent)]"
              >
              {{ role.name }}
            </label>
          </div>
        </div>
      </section>

      <section class="mt-8">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="text-sm font-semibold text-[var(--ink)]">
            Widgets
          </h2>
          <button
            type="button"
            class="btn-primary !px-3 !py-1.5 text-sm"
            @click="openWidgetEditor(null)"
          >
            + Widget
          </button>
        </div>

        <div class="mt-4 space-y-3">
          <div
            v-for="w in widgets"
            :key="w.id"
            class="panel flex flex-wrap items-center justify-between gap-3 px-4 py-3"
          >
            <div>
              <p class="text-sm font-medium text-[var(--ink)]">
                {{ w.title }}
              </p>
              <p class="text-xs text-[var(--mute)]">
                {{ w.widget_type }} · grid {{ w.grid_w }}×{{ w.grid_h }} @ ({{ w.grid_x }},{{ w.grid_y }})
              </p>
            </div>
            <div class="flex gap-2">
              <button
                type="button"
                class="btn-secondary !px-2 !py-1 text-xs"
                @click="openWidgetEditor(w)"
              >
                Edit
              </button>
              <button
                type="button"
                class="text-xs text-[var(--danger)] hover:underline"
                @click="removeWidget(w)"
              >
                Remove
              </button>
            </div>
          </div>
          <p
            v-if="!widgets.length"
            class="text-sm text-[var(--mute)]"
          >
            No widgets yet. Add one to bind ingest tables and charts.
          </p>
        </div>
      </section>
    </template>

    <div
      v-if="widgetEditorOpen"
      class="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-[var(--modal-scrim)] p-4"
      @click.self="widgetEditorOpen = false"
    >
      <div class="panel my-6 w-full max-w-2xl px-6 py-5">
        <h2 class="font-display text-xl font-semibold text-[var(--ink)]">
          {{ editingWidgetId ? 'Edit widget' : 'Add widget' }}
        </h2>

        <div class="mt-4 space-y-4">
          <div class="grid gap-3 sm:grid-cols-2">
            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium text-[var(--mute)]">Title</label>
              <input
                v-model="widgetForm.title"
                type="text"
                class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)]"
              >
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium text-[var(--mute)]">Display type</label>
              <select
                v-model="widgetForm.widgetType"
                class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)]"
              >
                <option
                  v-for="t in DASHBOARD_WIDGET_TYPES"
                  :key="t"
                  :value="t"
                >
                  {{ widgetMeta(t).label }}
                </option>
              </select>
            </div>
          </div>

          <div class="grid gap-3 sm:grid-cols-4">
            <div
              v-for="key in ['gridX', 'gridY', 'gridW', 'gridH']"
              :key="key"
              class="flex flex-col gap-1"
            >
              <label class="text-xs font-medium text-[var(--mute)]">{{ key }}</label>
              <input
                v-model.number="widgetForm[key]"
                type="number"
                min="0"
                class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)]"
              >
            </div>
          </div>

          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <p class="text-xs font-medium text-[var(--mute)]">
                Source tables (ingest)
              </p>
              <button
                type="button"
                class="text-xs text-[var(--accent-ink)] hover:underline"
                @click="addSource"
              >
                + Table
              </button>
            </div>
            <div
              v-for="(src, idx) in widgetForm.dataConfig.sources"
              :key="idx"
              class="flex flex-wrap items-end gap-2 rounded-md border border-[var(--border-soft)] p-2"
            >
              <div class="min-w-[8rem] flex-1 flex flex-col gap-1">
                <label class="text-[10px] text-[var(--mute-soft)]">Alias</label>
                <input
                  v-model="src.alias"
                  type="text"
                  class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 font-mono text-sm text-[var(--ink)]"
                  @change="loadFieldsForAlias(src.alias, src.table)"
                >
              </div>
              <div class="min-w-[10rem] flex-[2] flex flex-col gap-1">
                <label class="text-[10px] text-[var(--mute-soft)]">Table</label>
                <select
                  v-model="src.table"
                  class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm text-[var(--ink)]"
                  @change="loadFieldsForAlias(src.alias, src.table)"
                >
                  <option value="">
                    Select…
                  </option>
                  <option
                    v-for="t in ingestTables"
                    :key="t"
                    :value="t"
                  >
                    {{ t }}
                  </option>
                </select>
              </div>
              <button
                type="button"
                class="text-xs text-[var(--danger)] hover:underline"
                :disabled="widgetForm.dataConfig.sources.length <= 1"
                @click="removeSource(idx)"
              >
                Remove
              </button>
            </div>
          </div>

          <div
            v-if="widgetForm.dataConfig.sources.length > 1"
            class="space-y-2"
          >
            <div class="flex items-center justify-between">
              <p class="text-xs font-medium text-[var(--mute)]">
                Joins
              </p>
              <button
                type="button"
                class="text-xs text-[var(--accent-ink)] hover:underline"
                @click="widgetForm.dataConfig.joins.push({ left: '', right: '' })"
              >
                + Join
              </button>
            </div>
            <div
              v-for="(join, idx) in widgetForm.dataConfig.joins"
              :key="idx"
              class="flex flex-wrap items-end gap-2"
            >
              <select
                v-model="join.left"
                class="min-w-[10rem] flex-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 font-mono text-sm text-[var(--ink)]"
              >
                <option value="">
                  Left field…
                </option>
                <option
                  v-for="f in allQualifiedFields"
                  :key="`L-${f}`"
                  :value="f"
                >
                  {{ f }}
                </option>
              </select>
              <span class="pb-2 text-xs text-[var(--mute)]">=</span>
              <select
                v-model="join.right"
                class="min-w-[10rem] flex-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 font-mono text-sm text-[var(--ink)]"
              >
                <option value="">
                  Right field…
                </option>
                <option
                  v-for="f in allQualifiedFields"
                  :key="`R-${f}`"
                  :value="f"
                >
                  {{ f }}
                </option>
              </select>
            </div>
          </div>

          <div class="grid gap-3 sm:grid-cols-2">
            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium text-[var(--mute)]">Dimension (category)</label>
              <select
                v-model="widgetForm.dataConfig.dimensions[0]"
                class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-sm text-[var(--ink)]"
              >
                <option value="">
                  None
                </option>
                <option
                  v-for="f in allQualifiedFields"
                  :key="`d-${f}`"
                  :value="f"
                >
                  {{ f }}
                </option>
              </select>
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium text-[var(--mute)]">Series split (optional)</label>
              <select
                v-model="widgetForm.dataConfig.seriesField"
                class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-sm text-[var(--ink)]"
              >
                <option value="">
                  None
                </option>
                <option
                  v-for="f in allQualifiedFields"
                  :key="`s-${f}`"
                  :value="f"
                >
                  {{ f }}
                </option>
              </select>
            </div>
          </div>

          <div class="grid gap-3 sm:grid-cols-3">
            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium text-[var(--mute)]">Metric field</label>
              <select
                v-model="widgetForm.dataConfig.metrics[0].field"
                class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-sm text-[var(--ink)]"
              >
                <option value="*">
                  * (count rows)
                </option>
                <option
                  v-for="f in allQualifiedFields"
                  :key="`m-${f}`"
                  :value="f"
                >
                  {{ f }}
                </option>
              </select>
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium text-[var(--mute)]">Aggregate</label>
              <select
                v-model="widgetForm.dataConfig.metrics[0].agg"
                class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)]"
              >
                <option
                  v-for="a in DASHBOARD_AGGS"
                  :key="a"
                  :value="a"
                >
                  {{ a }}
                </option>
              </select>
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium text-[var(--mute)]">Metric name</label>
              <input
                v-model="widgetForm.dataConfig.metrics[0].as"
                type="text"
                class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-sm text-[var(--ink)]"
              >
            </div>
          </div>

          <p
            v-if="suggestedTypes.length"
            class="text-xs text-[var(--mute-soft)]"
          >
            Suggested display types for this shape:
            <span class="text-[var(--accent-ink)]">{{ suggestedTypes.join(', ') }}</span>
          </p>

          <p
            v-if="widgetError"
            class="text-sm text-[var(--danger)]"
          >
            {{ widgetError }}
          </p>
        </div>

        <div class="mt-6 flex justify-end gap-2">
          <button
            type="button"
            class="btn-secondary !px-4 !py-2"
            @click="widgetEditorOpen = false"
          >
            Cancel
          </button>
          <button
            type="button"
            class="btn-primary !px-4 !py-2"
            :disabled="savingWidget"
            @click="saveWidget"
          >
            {{ savingWidget ? 'Saving…' : 'Save widget' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import {
  DASHBOARD_AGGS,
  DASHBOARD_WIDGET_TYPES,
  createEmptyDataConfig,
  normalizeDataConfig,
  suggestedDisplayTypes,
  widgetMeta,
} from '~~/shared/dashboard.js'

definePageMeta({
  layout: 'app',
  middleware: ['auth', 'admin'],
})

const route = useRoute()
const { activeOrganization } = useOrganization()
const authedFetch = useAuthedFetch()
const { confirm: appConfirm } = useAppConfirm()

const pending = ref(true)
const saving = ref(false)
const savingWidget = ref(false)
const error = ref('')
const notice = ref('')
const widgets = ref([])
const orgRoles = ref([])
const ingestTables = ref([])
/** @type {import('vue').Ref<Record<string, string[]>>} */
const fieldsByAlias = ref({})

const form = reactive({
  name: '',
  description: '',
  visibility: 'private',
  roleIds: [],
  layout: { version: 1, cols: 12 },
})

const widgetEditorOpen = ref(false)
const editingWidgetId = ref(null)
const widgetError = ref('')
const widgetForm = reactive({
  title: 'Widget',
  widgetType: 'bar',
  gridX: 0,
  gridY: 0,
  gridW: 6,
  gridH: 4,
  dataConfig: createEmptyDataConfig(),
})

const allQualifiedFields = computed(() => {
  /** @type {string[]} */
  const out = []
  Object.entries(fieldsByAlias.value).forEach(([alias, fields]) => {
    ;(fields || []).forEach((f) => out.push(`${alias}.${f}`))
  })
  return out.sort()
})

const suggestedTypes = computed(() =>
  suggestedDisplayTypes({
    dimensionCount: widgetForm.dataConfig.dimensions.filter(Boolean).length,
    metricCount: widgetForm.dataConfig.metrics.length,
    hasSeries: Boolean(widgetForm.dataConfig.seriesField),
  }),
)

useHead(() => ({ title: form.name || 'Edit dashboard' }))

async function loadIngestTables() {
  if (!activeOrganization.value?.id) return
  try {
    const res = await authedFetch('/api/ingest/tables', {
      query: { organizationId: activeOrganization.value.id },
    })
    ingestTables.value = (res.items || []).map((t) =>
      typeof t === 'string' ? t : (t.name || t.table_name || ''),
    ).filter(Boolean)
  }
  catch {
    ingestTables.value = []
  }
}

async function loadRoles() {
  if (!activeOrganization.value?.id) return
  try {
    const client = useSupabaseClient()
    const { data } = await client
      .from('roles')
      .select('id, name')
      .eq('organization_id', activeOrganization.value.id)
      .order('name')
    orgRoles.value = data || []
  }
  catch {
    orgRoles.value = []
  }
}

/**
 * @param {string} alias
 * @param {string} table
 */
async function loadFieldsForAlias(alias, table) {
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
    fieldsByAlias.value = {
      ...fieldsByAlias.value,
      [alias]: cols,
    }
  }
  catch {
    fieldsByAlias.value = { ...fieldsByAlias.value, [alias]: [] }
  }
}

async function refreshAllFields() {
  fieldsByAlias.value = {}
  await Promise.all(
    widgetForm.dataConfig.sources.map((s) => loadFieldsForAlias(s.alias, s.table)),
  )
}

function addSource() {
  const i = widgetForm.dataConfig.sources.length
  widgetForm.dataConfig.sources.push({
    kind: 'ingest',
    table: '',
    alias: `t${i}`,
  })
}

/**
 * @param {number} idx
 */
function removeSource(idx) {
  if (widgetForm.dataConfig.sources.length <= 1) return
  widgetForm.dataConfig.sources.splice(idx, 1)
}

/**
 * @param {Record<string, unknown> | null} widget
 */
function openWidgetEditor(widget) {
  widgetError.value = ''
  if (widget) {
    editingWidgetId.value = widget.id
    widgetForm.title = widget.title || 'Widget'
    widgetForm.widgetType = widget.widget_type || 'bar'
    widgetForm.gridX = widget.grid_x || 0
    widgetForm.gridY = widget.grid_y || 0
    widgetForm.gridW = widget.grid_w || 6
    widgetForm.gridH = widget.grid_h || 4
    widgetForm.dataConfig = normalizeDataConfig(widget.data_config)
    if (!widgetForm.dataConfig.dimensions.length) {
      widgetForm.dataConfig.dimensions = ['']
    }
  }
  else {
    editingWidgetId.value = null
    widgetForm.title = 'Widget'
    widgetForm.widgetType = 'bar'
    widgetForm.gridX = 0
    widgetForm.gridY = widgets.value.length * 4
    widgetForm.gridW = 6
    widgetForm.gridH = 4
    widgetForm.dataConfig = createEmptyDataConfig()
    widgetForm.dataConfig.dimensions = ['']
  }
  widgetEditorOpen.value = true
  refreshAllFields()
}

async function saveWidget() {
  widgetError.value = ''
  const dataConfig = normalizeDataConfig({
    ...widgetForm.dataConfig,
    dimensions: (widgetForm.dataConfig.dimensions || []).filter(Boolean),
    seriesField: widgetForm.dataConfig.seriesField || null,
  })
  if (!dataConfig.sources.length || !dataConfig.sources[0].table) {
    widgetError.value = 'Select at least one ingest table'
    return
  }
  savingWidget.value = true
  try {
    const body = {
      organizationId: activeOrganization.value.id,
      title: widgetForm.title,
      widgetType: widgetForm.widgetType,
      gridX: widgetForm.gridX,
      gridY: widgetForm.gridY,
      gridW: widgetForm.gridW,
      gridH: widgetForm.gridH,
      dataConfig,
      displayConfig: {},
    }
    if (editingWidgetId.value) {
      await authedFetch(
        `/api/dashboards/${route.params.id}/widgets/${editingWidgetId.value}`,
        { method: 'PUT', body },
      )
    }
    else {
      await authedFetch(`/api/dashboards/${route.params.id}/widgets`, {
        method: 'POST',
        body,
      })
    }
    widgetEditorOpen.value = false
    notice.value = 'Widget saved'
    await load()
  }
  catch (err) {
    widgetError.value = err?.data?.statusMessage || err?.message || 'Save widget failed'
  }
  finally {
    savingWidget.value = false
  }
}

/**
 * @param {Record<string, unknown>} widget
 */
async function removeWidget(widget) {
  const ok = await appConfirm({
    title: 'Remove widget?',
    message: `Remove “${widget.title}”?`,
    confirmLabel: 'Remove',
    danger: true,
  })
  if (!ok) return
  try {
    await authedFetch(`/api/dashboards/${route.params.id}/widgets/${widget.id}`, {
      method: 'DELETE',
      query: { organizationId: activeOrganization.value.id },
    })
    notice.value = 'Widget removed'
    await load()
  }
  catch (err) {
    error.value = err?.data?.statusMessage || err?.message || 'Remove failed'
  }
}

async function saveDashboard() {
  if (!form.name.trim()) {
    error.value = 'Name is required'
    return
  }
  saving.value = true
  error.value = ''
  try {
    await authedFetch(`/api/dashboards/${route.params.id}`, {
      method: 'PUT',
      body: {
        organizationId: activeOrganization.value.id,
        name: form.name.trim(),
        description: form.description,
        visibility: form.visibility,
        roleIds: form.roleIds,
        layout: form.layout,
      },
    })
    notice.value = 'Dashboard saved'
  }
  catch (err) {
    error.value = err?.data?.statusMessage || err?.message || 'Save failed'
  }
  finally {
    saving.value = false
  }
}

async function load() {
  if (!activeOrganization.value?.id || !route.params.id) return
  pending.value = true
  error.value = ''
  try {
    const res = await authedFetch(`/api/dashboards/${route.params.id}`, {
      query: { organizationId: activeOrganization.value.id },
    })
    const item = res.item
    form.name = item.name
    form.description = item.description || ''
    form.visibility = item.visibility
    form.roleIds = item.roleIds || []
    form.layout = item.layout || { version: 1, cols: 12 }
    widgets.value = item.widgets || []
  }
  catch (err) {
    error.value = err?.data?.statusMessage || err?.message || 'Failed to load'
  }
  finally {
    pending.value = false
  }
}

watch(
  () => activeOrganization.value?.id,
  async () => {
    await Promise.all([load(), loadIngestTables(), loadRoles()])
  },
  { immediate: true },
)
</script>
