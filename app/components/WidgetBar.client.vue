<template>
  <WidgetPanel
    v-if="!bare"
    :title="title"
    :subtitle="subtitle"
    :fill="fill"
    :compact="fill"
  >
    <template
      v-if="drilledParent"
      #actions
    >
      <button
        type="button"
        class="text-sm font-medium text-[var(--accent-ink)] hover:underline"
        @click="resetDrill"
      >
        ← {{ drilledParent }}
      </button>
    </template>

    <div
      ref="hostEl"
      class="chart-host relative w-full"
      :class="fill ? 'h-full min-h-0' : ''"
      :style="fill ? undefined : { minHeight: `${fallbackHeight}px` }"
    >
      <VueUiXy
        v-if="isMultiSeries && ready"
        :key="`bar-xy-${remountNonce}-${chartHeight}-${xyCategories.length}-${showLegend}-${showSeriesIndicators}`"
        :dataset="xyDataset"
        :config="xyConfig"
      />
      <VueUiVerticalBar
        v-else-if="!isMultiSeries && ready"
        :key="`bar-v-${remountNonce}-${chartHeight}-${showLegend}-${showSeriesIndicators}`"
        :dataset="activeDataset"
        :config="mergedConfig"
      />
    </div>
  </WidgetPanel>
  <div
    v-else
    class="relative flex h-full min-h-0 w-full flex-col"
  >
    <div
      v-if="drilledParent"
      class="mb-1 shrink-0"
    >
      <button
        type="button"
        class="text-sm font-medium text-[var(--accent-ink)] hover:underline"
        @click="resetDrill"
      >
        ← {{ drilledParent }}
      </button>
    </div>
    <div
      ref="hostEl"
      class="chart-host relative min-h-0 w-full flex-1"
      :class="fill ? 'h-full' : ''"
      :style="fill ? undefined : { minHeight: `${fallbackHeight}px` }"
    >
      <VueUiXy
        v-if="isMultiSeries && ready"
        :key="`bar-xy-${remountNonce}-${chartHeight}-${xyCategories.length}-${showLegend}-${showSeriesIndicators}`"
        :dataset="xyDataset"
        :config="xyConfig"
      />
      <VueUiVerticalBar
        v-else-if="!isMultiSeries && ready"
        :key="`bar-v-${remountNonce}-${chartHeight}-${showLegend}-${showSeriesIndicators}`"
        :dataset="activeDataset"
        :config="mergedConfig"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import WidgetPanel from '~/components/WidgetPanel.vue'
import { VueUiVerticalBar, VueUiXy } from 'vue-data-ui'
import {
  chartAccent,
  chartInk,
  chartMute,
  chartPalette,
  chartSurface,
  chartUserOptionsForTools,
  mergeChartConfig,
  xyFillPadding,
} from '~/utils/chartTheme.js'

const props = defineProps({
  title: {
    type: String,
    default: 'Bar chart',
  },
  subtitle: {
    type: String,
    default: '',
  },
  /**
   * Single: [{ name, value }]
   * Multi: { categories, dataset: [{ name, series, type }] }
   */
  dataset: {
    type: [Array, Object],
    required: true,
  },
  config: {
    type: Object,
    default: () => ({}),
  },
  height: {
    type: Number,
    default: 360,
  },
  fill: {
    type: Boolean,
    default: false,
  },
  bare: {
    type: Boolean,
    default: false,
  },
  showLegend: {
    type: Boolean,
    default: true,
  },
  showSeriesIndicators: {
    type: Boolean,
    default: true,
  },
  showTools: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['select', 'drill'])

const hostEl = ref(null)
const measuredHeight = ref(0)
const measuredWidth = ref(0)
const ready = ref(false)
const remountNonce = ref(0)
const drilledParent = ref(null)
const childDataset = ref([])

/** @type {ResizeObserver | null} */
let observer = null

const userOptions = computed(() => chartUserOptionsForTools(props.showTools))

const isMultiSeries = computed(() =>
  Boolean(props.dataset && !Array.isArray(props.dataset) && Array.isArray(props.dataset.dataset)),
)

const xyCategories = computed(() =>
  isMultiSeries.value ? (props.dataset.categories || []) : [],
)

const xyDataset = computed(() =>
  isMultiSeries.value
    ? (props.dataset.dataset || []).map((s) => ({ ...s, type: 'bar' }))
    : [],
)

const fallbackHeight = computed(() => Math.max(240, Number(props.height) || 360))

const chartHeight = computed(() => {
  if (props.fill && measuredHeight.value > 0) {
    return Math.max(160, measuredHeight.value)
  }
  return fallbackHeight.value
})

const manyCategories = computed(() => xyCategories.value.length > 8)

function measure() {
  if (!hostEl.value) return
  const h = hostEl.value.clientHeight
  const w = hostEl.value.clientWidth
  if (h > 0 && w > 0) {
    measuredHeight.value = Math.max(1, Math.round(h / 4) * 4)
    measuredWidth.value = Math.max(1, Math.round(w / 4) * 4)
    ready.value = true
  }
  else if (!props.fill) {
    ready.value = true
  }
}

function bindObserver() {
  if (observer) {
    observer.disconnect()
    observer = null
  }
  if (import.meta.client && typeof ResizeObserver !== 'undefined' && hostEl.value) {
    observer = new ResizeObserver(() => measure())
    observer.observe(hostEl.value)
  }
}

onMounted(async () => {
  await nextTick()
  measure()
  bindObserver()
})

onBeforeUnmount(() => {
  if (observer) {
    observer.disconnect()
    observer = null
  }
})

watch(
  () => props.dataset,
  () => {
    drilledParent.value = null
    childDataset.value = []
  },
)

watch(
  () => [props.showLegend, props.showSeriesIndicators],
  async () => {
    remountNonce.value += 1
    await nextTick()
    measure()
    bindObserver()
  },
)

watch(
  () => [props.fill, props.bare],
  async () => {
    await nextTick()
    measure()
    bindObserver()
  },
)

const activeDataset = computed(() => {
  if (drilledParent.value) {
    return childDataset.value
  }
  if (!Array.isArray(props.dataset)) return []
  return props.dataset.map(({ name, value, color }) => ({ name, value, color }))
})

/**
 * @param {{ datapoint?: { name?: string }, seriesIndex?: number }} args
 */
function handleDatapointClick({ datapoint } = {}) {
  const name = datapoint?.name
  if (!name || drilledParent.value) {
    emit('select', datapoint)
    return
  }

  const parent = Array.isArray(props.dataset)
    ? props.dataset.find((item) => item.name === name)
    : null
  if (parent?.children?.length) {
    drilledParent.value = parent.name
    childDataset.value = parent.children.map((child) => ({
      name: child.name,
      value: child.value,
      color: parent.color,
    }))
    emit('drill', { parent: parent.name, children: childDataset.value })
    return
  }

  emit('select', datapoint)
}

const baseConfig = computed(() => ({
  responsive: Boolean(props.fill),
  useCssAnimation: true,
  customPalette: chartPalette,
  userOptions: userOptions.value,
  events: {
    datapointClick: handleDatapointClick,
  },
  style: {
    fontFamily: 'DM Sans, system-ui, sans-serif',
    chart: {
      backgroundColor: chartSurface,
      color: chartInk,
      height: chartHeight.value,
      width: props.fill && measuredWidth.value > 0 ? measuredWidth.value : undefined,
      userOptions: userOptions.value,
      layout: {
        bars: {
          sort: 'desc',
          useGradient: true,
          borderRadius: 6,
          underlayerColor: '#14171c',
          dataLabels: {
            color: chartInk,
            fontSize: 12,
            value: {
              show: props.showSeriesIndicators,
            },
            percentage: {
              show: false,
            },
          },
          nameLabels: {
            color: chartInk,
            fontSize: 12,
          },
        },
        separators: {
          show: true,
          color: '#2f3742',
        },
      },
      legend: {
        show: props.showLegend,
        backgroundColor: chartSurface,
        color: chartMute,
      },
    },
  },
}))

const mergedConfig = computed(() => mergeChartConfig(baseConfig.value, props.config))

const xyConfig = computed(() => mergeChartConfig({
  responsive: Boolean(props.fill),
  responsiveProportionalSizing: false,
  useCssAnimation: true,
  customPalette: chartPalette,
  userOptions: userOptions.value,
  events: {
    datapointClick: (payload) => emit('select', payload),
  },
  chart: {
    fontFamily: 'DM Sans, system-ui, sans-serif',
    backgroundColor: chartSurface,
    color: chartInk,
    height: chartHeight.value,
    width: props.fill && measuredWidth.value > 0 ? measuredWidth.value : 1000,
    userOptions: userOptions.value,
    padding: xyFillPadding({
      manyCategories: manyCategories.value,
      showLegend: props.showLegend,
      compact: props.fill,
    }),
    grid: {
      stroke: '#2f3742',
      showVerticalLines: false,
      labels: {
        show: true,
        color: chartInk,
        fontSize: 12,
        xAxisLabels: {
          show: true,
          color: chartInk,
          values: xyCategories.value,
          fontSize: 11,
          rotation: manyCategories.value ? -35 : 0,
        },
        yAxis: {
          color: chartInk,
          useNiceScale: true,
          commonScaleSteps: 5,
          scaleMin: null,
          scaleMax: null,
          fontSize: 11,
          labelWidth: props.fill ? 36 : 48,
          scaleValueOffsetX: 2,
        },
      },
    },
    labels: {
      fontSize: 12,
      color: chartInk,
    },
    legend: {
      show: props.showLegend,
      color: chartInk,
      backgroundColor: chartSurface,
      fontSize: 12,
      padding: props.fill ? 2 : 8,
    },
    tooltip: {
      backgroundColor: '#14171c',
      color: chartInk,
      borderColor: '#2f3742',
      fontSize: 13,
    },
    highlighter: {
      color: chartAccent,
      opacity: 8,
    },
    zoom: {
      show: false,
      minimap: { show: false },
    },
  },
  bar: {
    labels: {
      show: props.showSeriesIndicators,
    },
  },
}, props.config))

function resetDrill() {
  drilledParent.value = null
  childDataset.value = []
  emit('drill', null)
}
</script>

<style scoped>
.chart-host :deep(.vue-data-ui-component),
.chart-host :deep(.vue-ui-xy),
.chart-host :deep(.vue-ui-vertical-bar) {
  display: block !important;
  width: 100% !important;
  height: 100% !important;
  max-height: none !important;
}

.chart-host :deep(svg) {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
