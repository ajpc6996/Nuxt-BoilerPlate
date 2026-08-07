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
      class="chart-host relative w-full"
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
    class="chart-host relative w-full"
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
  xyFillPadding,
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
const measuredWidth = ref(0)
const ready = ref(false)
const remountNonce = ref(0)

const fallbackHeight = computed(() => Math.max(240, Number(props.height) || 360))

/** Explicit height only when not using responsive fill (library ignores it when responsive). */
const chartHeight = computed(() => {
  if (props.fill && measuredHeight.value > 0) {
    return Math.max(160, measuredHeight.value)
  }
  return fallbackHeight.value
})

const chartKey = computed(() =>
  [
    remountNonce.value,
    measuredWidth.value,
    measuredHeight.value,
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

const baseConfig = computed(() => ({
  responsive: Boolean(props.fill),
  responsiveProportionalSizing: false,
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
        axis: {
          yLabel: '',
          xLabel: '',
          fontSize: 12,
        },
        xAxisLabels: {
          show: true,
          color: chartInk,
          values: props.categories,
          fontSize: 11,
          rotation: manyCategories.value ? -35 : 0,
          yOffset: manyCategories.value ? 6 : 0,
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
      minimap: {
        show: false,
      },
    },
  },
  line: {
    radius: props.showSeriesIndicators ? 3 : 0,
    labels: {
      show: false,
    },
  },
  plot: {
    radius: props.showSeriesIndicators ? 3 : 0,
  },
  bar: {
    labels: {
      show: false,
    },
  },
}))

const mergedConfig = computed(() => mergeChartConfig(baseConfig.value, props.config))
</script>

<style scoped>
.chart-host :deep(.vue-data-ui-component),
.chart-host :deep(.vue-ui-xy) {
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
