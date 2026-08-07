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
      class="relative w-full"
      :class="fill ? 'h-full min-h-0' : ''"
      :style="fill ? undefined : { minHeight: `${fallbackHeight}px` }"
    >
      <VueUiXy
        v-if="isMultiSeries && ready"
        :key="`bar-xy-${chartHeight}-${xyCategories.length}-${showLegend}-${showSeriesIndicators}`"
        :dataset="xyDataset"
        :config="xyConfig"
      />
      <VueUiVerticalBar
        v-else-if="!isMultiSeries"
        :key="`bar-v-${showLegend}-${showSeriesIndicators}`"
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
      class="relative min-h-0 w-full flex-1"
      :class="fill ? 'h-full' : ''"
      :style="fill ? undefined : { minHeight: `${fallbackHeight}px` }"
    >
      <VueUiXy
        v-if="isMultiSeries && ready"
        :key="`bar-xy-${chartHeight}-${xyCategories.length}-${showLegend}-${showSeriesIndicators}`"
        :dataset="xyDataset"
        :config="xyConfig"
      />
      <VueUiVerticalBar
        v-else-if="!isMultiSeries"
        :key="`bar-v-${showLegend}-${showSeriesIndicators}`"
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
const ready = ref(false)
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
    return Math.max(160, Math.floor(measuredHeight.value))
  }
  return fallbackHeight.value
})

const manyCategories = computed(() => xyCategories.value.length > 8)

function measure() {
  if (!hostEl.value) return
  const h = hostEl.value.clientHeight
  if (h > 0) {
    measuredHeight.value = h
    ready.value = true
  }
  else if (!props.fill) {
    ready.value = true
  }
}

onMounted(async () => {
  await nextTick()
  measure()
  if (import.meta.client && typeof ResizeObserver !== 'undefined' && hostEl.value) {
    observer = new ResizeObserver(() => measure())
    observer.observe(hostEl.value)
  }
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
  () => [props.fill, props.bare],
  async () => {
    await nextTick()
    measure()
    if (observer) {
      observer.disconnect()
      observer = null
    }
    if (import.meta.client && typeof ResizeObserver !== 'undefined' && hostEl.value) {
      observer = new ResizeObserver(() => measure())
      observer.observe(hostEl.value)
    }
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
  responsive: true,
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
  responsive: true,
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
    userOptions: userOptions.value,
    padding: {
      top: 12,
      right: 16,
      bottom: manyCategories.value ? 64 : 32,
      left: 8,
    },
    grid: {
      stroke: '#2f3742',
      showVerticalLines: false,
      labels: {
        show: true,
        color: chartInk,
        fontSize: 13,
        xAxisLabels: {
          show: true,
          color: chartInk,
          values: xyCategories.value,
          fontSize: 12,
          rotation: manyCategories.value ? -35 : 0,
        },
        yAxis: {
          color: chartInk,
          useNiceScale: true,
          commonScaleSteps: 6,
          scaleMin: null,
          scaleMax: null,
          fontSize: 13,
          labelWidth: 64,
        },
      },
    },
    labels: {
      fontSize: 13,
      color: chartInk,
    },
    legend: {
      show: props.showLegend,
      color: chartInk,
      backgroundColor: chartSurface,
      fontSize: 13,
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
