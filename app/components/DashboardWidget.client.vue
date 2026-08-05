<template>
  <div
    class="dashboard-widget min-h-0"
    :style="gridStyle"
  >
    <div
      v-if="loading"
      class="panel flex h-full min-h-[12rem] items-center justify-center text-sm text-[var(--mute)]"
    >
      Loading…
    </div>
    <div
      v-else-if="error"
      class="panel flex h-full min-h-[12rem] items-center justify-center px-4 text-sm text-[var(--danger)]"
    >
      {{ error }}
    </div>
    <template v-else>
      <WidgetInfoCard
        v-if="effectiveType === 'kpi'"
        :id="widget.id"
        :label="widget.title"
        :value="kpiValue"
        :active="isActive"
        @select="onKpiSelect"
      />
      <WidgetGauge
        v-else-if="effectiveType === 'gauge'"
        :title="widget.title"
        :subtitle="widget.subtitle || ''"
        :dataset="dataset"
      />
      <WidgetBar
        v-else-if="effectiveType === 'bar'"
        :title="widget.title"
        :subtitle="widget.subtitle || ''"
        :dataset="dataset"
        @select="onBarSelect"
      />
      <WidgetLine
        v-else-if="effectiveType === 'line'"
        :title="widget.title"
        :subtitle="widget.subtitle || ''"
        :dataset="lineDataset"
        :categories="lineCategories"
        @select="onLineSelect"
      />
      <WidgetPie
        v-else-if="effectiveType === 'pie'"
        :title="widget.title"
        :subtitle="widget.subtitle || ''"
        :dataset="dataset"
        @select="onPieSelect"
      />
      <WidgetDonut
        v-else-if="effectiveType === 'donut'"
        :title="widget.title"
        :subtitle="widget.subtitle || ''"
        :dataset="dataset"
        @select="onPieSelect"
      />
      <WidgetPanel
        v-else
        :title="widget.title"
        :subtitle="widget.subtitle || 'Table'"
      >
        <div class="max-h-80 overflow-auto">
          <table class="min-w-full text-left text-xs">
            <thead class="border-b border-[var(--border)] text-[var(--mute)]">
              <tr>
                <th
                  v-for="col in tableColumns"
                  :key="col"
                  class="px-2 py-1 font-medium"
                >
                  {{ col }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(row, idx) in tableRows"
                :key="idx"
                class="border-b border-[var(--border-soft)] cursor-pointer hover:bg-[var(--accent-soft)]"
                @click="onTableRow(row)"
              >
                <td
                  v-for="col in tableColumns"
                  :key="col"
                  class="px-2 py-1 text-[var(--ink)]"
                >
                  {{ row[col] }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </WidgetPanel>
    </template>
  </div>
</template>

<script setup>
import WidgetInfoCard from '~/components/WidgetInfoCard.client.vue'
import WidgetDonut from '~/components/WidgetDonut.client.vue'
import WidgetGauge from '~/components/WidgetGauge.client.vue'
import WidgetPie from '~/components/WidgetPie.client.vue'
import WidgetBar from '~/components/WidgetBar.client.vue'
import WidgetLine from '~/components/WidgetLine.client.vue'
import WidgetPanel from '~/components/WidgetPanel.vue'
import { normalizeDataConfig } from '~~/shared/dashboard.js'

const props = defineProps({
  widget: { type: Object, required: true },
  organizationId: { type: String, required: true },
  dashboardId: { type: String, required: true },
  filters: { type: Array, default: () => [] },
  displayTypeOverride: { type: String, default: '' },
})

const emit = defineEmits(['filter'])

const authedFetch = useAuthedFetch()
const loading = ref(true)
const error = ref('')
const dataset = ref(null)
const rows = ref([])
const dataConfig = ref(normalizeDataConfig(props.widget.data_config))

const effectiveType = computed(() =>
  props.displayTypeOverride || props.widget.widget_type || 'table',
)

const gridStyle = computed(() => ({
  gridColumn: `${(props.widget.grid_x || 0) + 1} / span ${props.widget.grid_w || 6}`,
  gridRow: `${(props.widget.grid_y || 0) + 1} / span ${Math.max(1, props.widget.grid_h || 4)}`,
}))

const kpiValue = computed(() => {
  if (dataset.value && typeof dataset.value === 'object' && 'value' in dataset.value) {
    return dataset.value.value
  }
  return 0
})

const lineDataset = computed(() => {
  if (dataset.value?.dataset) return dataset.value.dataset
  return Array.isArray(dataset.value) ? dataset.value : []
})

const lineCategories = computed(() => dataset.value?.categories || [])

const tableRows = computed(() => {
  if (dataset.value?.rows) return dataset.value.rows
  return rows.value
})

const tableColumns = computed(() => {
  const first = tableRows.value[0]
  return first ? Object.keys(first) : []
})

const isActive = computed(() =>
  props.filters.some((f) => f.sourceWidgetId === props.widget.id),
)

const dimField = computed(() => dataConfig.value.dimensions[0] || null)

async function load() {
  loading.value = true
  error.value = ''
  try {
    const res = await authedFetch('/api/dashboards/query', {
      method: 'POST',
      body: {
        organizationId: props.organizationId,
        dashboardId: props.dashboardId,
        widgetId: props.widget.id,
        displayType: effectiveType.value,
        filters: props.filters,
      },
    })
    dataset.value = res.dataset
    rows.value = res.rows || []
    dataConfig.value = normalizeDataConfig(res.dataConfig || props.widget.data_config)
  }
  catch (err) {
    error.value = err?.data?.statusMessage || err?.message || 'Query failed'
    dataset.value = null
    rows.value = []
  }
  finally {
    loading.value = false
  }
}

watch(
  () => [props.widget.id, props.filters, props.displayTypeOverride],
  () => {
    load()
  },
  { deep: true, immediate: true },
)

function emitDimFilter(value, label) {
  if (!dimField.value) return
  emit('filter', {
    field: dimField.value,
    value: String(value ?? ''),
    label: label || `${dimField.value}=${value}`,
    sourceWidgetId: props.widget.id,
  })
}

function onKpiSelect() {
  // KPI has no dimension — no-op for cross-filter
}

function onBarSelect(payload) {
  const name = payload?.name ?? payload
  emitDimFilter(name, String(name))
}

function onPieSelect(payload) {
  const name = payload?.name ?? payload
  emitDimFilter(name, String(name))
}

function onLineSelect(payload) {
  const idx = typeof payload === 'number' ? payload : payload?.index
  if (idx == null) return
  const cat = lineCategories.value[idx]
  if (cat != null) emitDimFilter(cat, String(cat))
}

function onTableRow(row) {
  if (!dimField.value) return
  const key = dimField.value.replace('.', '_')
  if (row[key] != null) emitDimFilter(row[key])
}

defineExpose({ reload: load })
</script>
