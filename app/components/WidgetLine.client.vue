<template>
  <WidgetPanel
    v-if="!bare"
    :title="title"
    :subtitle="subtitle"
    :fill="fill"
    :compact="fill"
  >
    <div
      ref="hostEl"
      class="relative w-full"
      :class="fill ? 'h-full min-h-0' : ''"
      :style="fill ? undefined : { minHeight: `${fallbackHeight}px` }"
    >
      <VueUiXy
        v-if="ready"
        :key="chartKey"
        :dataset="dataset"
        :config="mergedConfig"
      />
    </div>
  </WidgetPanel>
  <div
    v-else
    ref="hostEl"
    class="relative w-full"
    :class="fill ? 'h-full min-h-0' : ''"
    :style="fill ? undefined : { minHeight: `${fallbackHeight}px` }"
  >
    <VueUiXy
      v-if="ready"
      :key="chartKey"
      :dataset="dataset"
      :config="mergedConfig"
    />
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import WidgetPanel from '~/components/WidgetPanel.vue'
import { VueUiXy } from 'vue-data-ui'
import {
  chartAccent,
  chartInk,
  chartPalette,
  chartSurface,
  chartUserOptionsForTools,
  mergeChartConfig,
} from '~/utils/chartTheme.js'

const props = defineProps({
  title: {
    type: String,
    default: 'Line chart',
  },
  subtitle: {
    type: String,
    default: '',
  },
  /**
   * @type {import('vue').PropType<Array<{ name: string, series: Array<number|null>, type: 'line'|'bar'|'plot', color?: string, useArea?: boolean }>>}
   */
  dataset: {
    type: Array,
    required: true,
  },
  /** X-axis labels */
  categories: {
    type: Array,
    default: () => [],
  },
  config: {
    type: Object,
    default: () => ({}),
  },
  /** Fallback plot height when not filling a parent */
  height: {
    type: Number,
    default: 360,
  },
  /** Fill parent widget height (dashboard). */
  fill: {
    type: Boolean,
    default: false,
  },
  /** Skip WidgetPanel when nested in DashboardWidget. */
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

const emit = defineEmits(['select'])

const hostEl = ref(null)
const measuredHeight = ref(0)
const ready = ref(false)

const fallbackHeight = computed(() => Math.max(240, Number(props.height) || 360))

const chartHeight = computed(() => {
  if (props.fill && measuredHeight.value > 0) {
    return Math.max(160, Math.floor(measuredHeight.value))
  }
  return fallbackHeight.value
})

const chartKey = computed(() =>
  [
    chartHeight.value,
    props.categories.length,
    (props.dataset || []).map((s) => s.name).join(','),
    props.showLegend,
    props.showSeriesIndicators,
    props.showTools,
  ].join(':'),
)

const manyCategories = computed(() => (props.categories || []).length > 8)

const userOptions = computed(() => chartUserOptionsForTools(props.showTools))

/** @type {ResizeObserver | null} */
let observer = null

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
    observer = new ResizeObserver(() => {
      measure()
    })
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

const baseConfig = computed(() => ({
  responsive: true,
  useCssAnimation: true,
  customPalette: chartPalette,
  userOptions: userOptions.value,
  events: {
    datapointClick: (payload) => {
      emit('select', payload)
    },
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
        axis: {
          yLabel: '',
          xLabel: '',
          fontSize: 13,
        },
        xAxisLabels: {
          show: true,
          color: chartInk,
          values: props.categories,
          fontSize: 12,
          rotation: manyCategories.value ? -35 : 0,
          yOffset: manyCategories.value ? 8 : 0,
        },
        yAxis: {
          color: chartInk,
          useNiceScale: true,
          commonScaleSteps: 6,
          scaleMin: null,
          scaleMax: null,
          fontSize: 13,
          labelWidth: 64,
          scaleValueOffsetX: 6,
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
      minimap: {
        show: false,
      },
    },
  },
  line: {
    radius: props.showSeriesIndicators ? 4 : 0,
    labels: {
      show: false,
    },
  },
  plot: {
    radius: props.showSeriesIndicators ? 4 : 0,
  },
  bar: {
    labels: {
      show: false,
    },
  },
}))

const mergedConfig = computed(() => mergeChartConfig(baseConfig.value, props.config))
</script>
