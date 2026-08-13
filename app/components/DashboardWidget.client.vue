<template>
  <div
    class="dashboard-widget flex h-full min-h-0 flex-col"
    :style="outerStyle"
  >
    <div
      v-if="loading"
      class="panel flex h-full min-h-[12rem] flex-1 items-center justify-center text-sm text-[var(--mute)]"
    >
      Loading…
    </div>
    <div
      v-else-if="error"
      class="panel flex h-full min-h-[12rem] flex-1 items-center justify-center px-4 text-sm text-[var(--danger)]"
    >
      {{ error }}
    </div>
    <section
      v-else
      class="panel relative flex h-full min-h-0 flex-1 flex-col overflow-visible"
    >
      <header
        class="dashboard-widget__drag relative z-10 flex shrink-0 flex-wrap items-center justify-between gap-2 overflow-visible border-b border-[var(--border-soft)] px-3 py-2"
        :class="locked ? '' : 'cursor-grab active:cursor-grabbing'"
      >
        <div class="min-w-0 flex items-center gap-2">
          <span
            v-if="!locked"
            class="select-none text-[var(--mute-soft)]"
            title="Drag to move"
            aria-hidden="true"
          >⠿</span>
          <div class="min-w-0">
            <InfoTip
              :text="widgetDescription"
              aria-label="Widget description"
            >
              <p class="truncate text-sm font-medium text-[var(--ink)]">
                {{ widget.title }}
              </p>
            </InfoTip>
            <p
              v-if="showTypeLabel"
              class="truncate text-[10px] uppercase tracking-wide text-[var(--mute)]"
            >
              {{ widgetMeta(effectiveType).label }}
            </p>
          </div>
        </div>
        <div class="flex shrink-0 flex-wrap items-center gap-1.5">
          <label
            v-if="showTypeSelect"
            class="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-[var(--mute)]"
          >
            <span class="sr-only">Chart type</span>
            <select
              v-model="selectedType"
              class="rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 py-1 text-xs normal-case text-[var(--ink)]"
              @change="onTypeChange"
            >
              <option
                v-for="t in availableTypes"
                :key="t"
                :value="t"
              >
                {{ widgetMeta(t).label }}
              </option>
            </select>
          </label>
          <template v-if="supportsLegendControls">
            <button
              type="button"
              class="rounded border px-1.5 py-1 text-[10px] transition-colors"
              :class="displayConfig.showLegend
                ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)]'
                : 'border-[var(--border)] text-[var(--mute)] hover:border-[var(--accent)] hover:text-[var(--accent-ink)]'"
              :title="displayConfig.showLegend ? 'Hide legend' : 'Show legend'"
              :aria-pressed="displayConfig.showLegend"
              @click.stop="toggleDisplayFlag('showLegend')"
            >
              Legend
            </button>
            <button
              v-if="supportsMarkerControls"
              type="button"
              class="rounded border px-1.5 py-1 text-[10px] transition-colors"
              :class="displayConfig.showSeriesIndicators
                ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)]'
                : 'border-[var(--border)] text-[var(--mute)] hover:border-[var(--accent)] hover:text-[var(--accent-ink)]'"
              :title="displayConfig.showSeriesIndicators ? 'Hide series markers' : 'Show series markers'"
              :aria-pressed="displayConfig.showSeriesIndicators"
              @click.stop="toggleDisplayFlag('showSeriesIndicators')"
            >
              Markers
            </button>
            <button
              v-else-if="supportsLabelControls"
              type="button"
              class="rounded border px-1.5 py-1 text-[10px] transition-colors"
              :class="displayConfig.showSeriesIndicators
                ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)]'
                : 'border-[var(--border)] text-[var(--mute)] hover:border-[var(--accent)] hover:text-[var(--accent-ink)]'"
              :title="displayConfig.showSeriesIndicators ? 'Hide slice labels' : 'Show slice labels'"
              :aria-pressed="displayConfig.showSeriesIndicators"
              @click.stop="toggleDisplayFlag('showSeriesIndicators')"
            >
              Labels
            </button>
          </template>
        </div>
      </header>

      <div
        class="flex min-h-0 flex-1 flex-col p-0.5 sm:p-1"
        :class="chartToolsEnabled ? 'overflow-visible' : 'overflow-hidden'"
      >
        <WidgetInfoCard
          v-if="effectiveType === 'kpi'"
          class="h-full min-h-0"
          :id="widget.id"
          label=""
          :value="kpiValue"
          :prefix="kpiPrefix"
          :suffix="kpiSuffix"
          :format="kpiFormat"
          :delta="kpiDelta"
          :sparkline="kpiSparkline"
          :active="isActive"
          centered
          fill
          bare
          @select="onKpiSelect"
        />
        <WidgetGauge
          v-else-if="effectiveType === 'gauge'"
          class="h-full min-h-0"
          bare
          :title="''"
          :subtitle="widget.subtitle || ''"
          :dataset="dataset"
          :show-tools="chartToolsEnabled"
        />
        <WidgetBar
          v-else-if="effectiveType === 'bar'"
          class="h-full min-h-0"
          bare
          :title="''"
          :subtitle="widget.subtitle || ''"
          :dataset="dataset"
          :show-legend="displayConfig.showLegend"
          :show-series-indicators="displayConfig.showSeriesIndicators"
          :show-tools="chartToolsEnabled"
          fill
          @select="onBarSelect"
        />
        <WidgetLine
          v-else-if="effectiveType === 'line'"
          class="h-full min-h-0"
          bare
          :title="''"
          :subtitle="widget.subtitle || ''"
          :dataset="lineDataset"
          :categories="lineCategories"
          :show-legend="displayConfig.showLegend"
          :show-series-indicators="displayConfig.showSeriesIndicators"
          :show-tools="chartToolsEnabled"
          fill
          @select="onLineSelect"
        />
        <WidgetPie
          v-else-if="effectiveType === 'pie'"
          class="h-full min-h-0"
          bare
          :title="''"
          :subtitle="widget.subtitle || ''"
          :dataset="dataset"
          :show-legend="displayConfig.showLegend"
          :show-series-indicators="displayConfig.showSeriesIndicators"
          :show-tools="chartToolsEnabled"
          fill
          @select="onPieSelect"
        />
        <WidgetDonut
          v-else-if="effectiveType === 'donut'"
          class="h-full min-h-0"
          bare
          :title="''"
          :subtitle="widget.subtitle || ''"
          :dataset="dataset"
          :show-legend="displayConfig.showLegend"
          :show-series-indicators="displayConfig.showSeriesIndicators"
          :show-tools="chartToolsEnabled"
          fill
          @select="onPieSelect"
        />
        <WidgetPolar
          v-else-if="effectiveType === 'polar'"
          class="h-full min-h-0"
          bare
          :title="''"
          :subtitle="widget.subtitle || ''"
          :dataset="dataset"
          :show-legend="displayConfig.showLegend"
          :show-series-indicators="displayConfig.showSeriesIndicators"
          :show-tools="chartToolsEnabled"
          fill
          @select="onPieSelect"
        />
        <div
          v-else
          class="h-full max-h-full overflow-auto"
        >
          <table class="min-w-full text-left text-sm">
            <thead class="border-b border-[var(--border)] text-[var(--mute)]">
              <tr>
                <th
                  v-for="col in tableColumns"
                  :key="col"
                  class="px-2 py-1.5 font-medium"
                >
                  {{ col }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(row, idx) in tableRows"
                :key="idx"
                class="cursor-pointer border-b border-[var(--border-soft)] hover:bg-[var(--accent-soft)]"
                @click="onTableRow(row)"
              >
                <td
                  v-for="col in tableColumns"
                  :key="col"
                  class="px-2 py-1.5 text-[var(--ink)]"
                >
                  {{ formatCell(row[col]) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import WidgetInfoCard from '~/components/WidgetInfoCard.client.vue'
import WidgetDonut from '~/components/WidgetDonut.client.vue'
import WidgetPolar from '~/components/WidgetPolar.client.vue'
import WidgetGauge from '~/components/WidgetGauge.client.vue'
import WidgetPie from '~/components/WidgetPie.client.vue'
import WidgetBar from '~/components/WidgetBar.client.vue'
import WidgetLine from '~/components/WidgetLine.client.vue'
import InfoTip from '~/components/InfoTip.vue'
import {
  displayTypesForConfig,
  normalizeDataConfig,
  widgetMeta,
} from '~~/shared/dashboard.js'
import { normalizeDisplayConfig } from '~~/shared/dashboardLayout.js'

const props = defineProps({
  widget: { type: Object, required: true },
  organizationId: { type: String, required: true },
  dashboardId: { type: String, required: true },
  filters: { type: Array, default: () => [] },
  locked: { type: Boolean, default: true },
  canConfigure: { type: Boolean, default: false },
  /** When false, CSS grid placement is handled by DashboardBoard */
  useCssGrid: { type: Boolean, default: false },
  /** Bumped by parent to soft-refresh query data without full page reload. */
  refreshNonce: { type: Number, default: 0 },
})

const emit = defineEmits(['filter', 'type-change', 'display-change', 'data-loaded'])

const authedFetch = useAuthedFetch()
const loading = ref(true)
const error = ref('')
const dataset = ref(null)
const rows = ref([])
const dataConfig = ref(normalizeDataConfig(props.widget.data_config))
const selectedType = ref(props.widget.widget_type || 'table')
const suggestedFromApi = ref([])
const displayConfig = ref(normalizeDisplayConfig(props.widget.display_config))

const widgetDescription = computed(() =>
  String(props.widget.subtitle || props.widget.description || '').trim(),
)

/** Per-widget chart toolbar from display_config.showTools. */
const chartToolsEnabled = computed(() => displayConfig.value.showTools === true)

const availableTypes = computed(() => {
  const fromShape = displayTypesForConfig(dataConfig.value)
  const fromApi = suggestedFromApi.value || []
  // Always union shape + API so newer types (e.g. polar) are never dropped
  // when the query response was shaped before they existed.
  return [...new Set([...fromShape, ...fromApi, selectedType.value].filter(Boolean))]
})

const effectiveType = computed(() => selectedType.value || props.widget.widget_type || 'table')

const supportsLegendControls = computed(() =>
  ['line', 'bar', 'pie', 'donut', 'polar'].includes(effectiveType.value),
)

/** Line/bar series markers (dots / bar value labels). */
const supportsMarkerControls = computed(() =>
  ['line', 'bar'].includes(effectiveType.value),
)

/** Pie/donut/polar slice name/percentage labels. */
const supportsLabelControls = computed(() =>
  ['pie', 'donut', 'polar'].includes(effectiveType.value),
)

/**
 * Type dropdown: always while configuring (when >1 type).
 * In view mode: when showWidgetType is on, or when Polar is a valid swap
 * for this widget's data shape (so Polar is always reachable in view).
 */
const showTypeSelect = computed(() => {
  if (availableTypes.value.length <= 1) return false
  if (!props.locked && props.canConfigure) return true
  if (displayConfig.value.showWidgetType) return true
  return availableTypes.value.includes('polar')
})

/** Static type label on view when showWidgetType but only one type (no select). */
const showTypeLabel = computed(() =>
  displayConfig.value.showWidgetType && !showTypeSelect.value,
)

const outerStyle = computed(() => {
  if (!props.useCssGrid) return { height: '100%' }
  return {
    height: '100%',
    gridColumn: `${(props.widget.grid_x || 0) + 1} / span ${props.widget.grid_w || 6}`,
    gridRow: `${(props.widget.grid_y || 0) + 1} / span ${Math.max(1, props.widget.grid_h || 4)}`,
  }
})

const kpiValue = computed(() => {
  if (dataset.value && typeof dataset.value === 'object' && 'value' in dataset.value) {
    return dataset.value.value
  }
  return 0
})

const kpiDelta = computed(() => {
  if (!displayConfig.value.showDelta) return null
  const d = dataset.value?.delta
  return typeof d === 'number' && Number.isFinite(d) ? d : null
})

const kpiSparkline = computed(() => {
  if (!displayConfig.value.showSparkline) return null
  const spark = dataset.value?.sparkline
  return Array.isArray(spark) && spark.length ? spark : null
})

const kpiPrefix = computed(() => String(displayConfig.value.kpiPrefix || ''))
const kpiSuffix = computed(() => String(displayConfig.value.kpiSuffix || ''))
const kpiFormat = computed(() =>
  displayConfig.value.kpiFormat === 'compact' ? 'compact' : 'number',
)

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

watch(
  () => props.widget.widget_type,
  (t) => {
    if (t && t !== selectedType.value) selectedType.value = t
  },
)

watch(
  () => props.widget.display_config,
  (cfg) => {
    displayConfig.value = normalizeDisplayConfig(cfg)
  },
  { deep: true },
)

/** Stable key so filter identity changes do not spuriously refetch. */
const filterKey = computed(() => JSON.stringify(props.filters || []))

/**
 * @param {{ quiet?: boolean }} [opts]
 */
async function load(opts = {}) {
  const quiet = Boolean(opts.quiet)
  if (!quiet) {
    loading.value = true
  }
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
    suggestedFromApi.value = res.suggestedTypes || []
    emit('data-loaded', { widgetId: props.widget.id, at: Date.now() })
  }
  catch (err) {
    error.value = err?.data?.statusMessage || err?.message || 'Query failed'
    dataset.value = null
    rows.value = []
  }
  finally {
    if (!quiet) {
      loading.value = false
    }
  }
}

// Multi-source watch — avoids refetch when only display_config changes.
watch(
  [
    () => props.widget.id,
    () => props.dashboardId,
    () => props.organizationId,
    () => effectiveType.value,
    filterKey,
  ],
  () => {
    load({ quiet: false })
  },
  { immediate: true },
)

watch(
  () => props.refreshNonce,
  (nonce, prev) => {
    if (prev == null || nonce === prev) return
    load({ quiet: true })
  },
)

async function persistWidget(extra = {}) {
  if (!props.canConfigure) return
  try {
    await authedFetch(`/api/dashboards/${props.dashboardId}/widgets/${props.widget.id}`, {
      method: 'PUT',
      body: {
        organizationId: props.organizationId,
        title: props.widget.title,
        widgetType: selectedType.value,
        gridX: props.widget.grid_x,
        gridY: props.widget.grid_y,
        gridW: props.widget.grid_w,
        gridH: props.widget.grid_h,
        dataConfig: props.widget.data_config,
        displayConfig: displayConfig.value,
        subtitle: props.widget.subtitle,
        ...extra,
      },
    })
  }
  catch {
    // Local toggle still works if persist fails
  }
}

async function onTypeChange() {
  emit('type-change', { widgetId: props.widget.id, widgetType: selectedType.value })
  await persistWidget()
}

/**
 * @param {'showLegend'|'showSeriesIndicators'} key
 */
async function toggleDisplayFlag(key) {
  displayConfig.value = {
    ...displayConfig.value,
    [key]: !displayConfig.value[key],
  }
  emit('display-change', { widgetId: props.widget.id, displayConfig: displayConfig.value })
  await persistWidget()
}

/**
 * @param {unknown} value
 */
function formatCell(value) {
  if (typeof value === 'number') {
    return Number.isInteger(value) ? value : Number(value).toLocaleString(undefined, { maximumFractionDigits: 4 })
  }
  return value
}

function emitDimFilter(value, label) {
  if (!dimField.value) return
  emit('filter', {
    field: dimField.value,
    value: String(value ?? ''),
    label: label || `${dimField.value}=${value}`,
    sourceWidgetId: props.widget.id,
  })
}

function onKpiSelect() {}

function onBarSelect(payload) {
  const name = payload?.name ?? payload?.datapoint?.name ?? payload
  if (name != null && typeof name !== 'object') emitDimFilter(name, String(name))
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
