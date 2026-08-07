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
      :class="fill ? 'h-full min-h-0' : 'min-h-[260px]'"
    >
      <VueUiDonut
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
    :class="fill ? 'h-full min-h-0' : 'min-h-[200px]'"
  >
    <VueUiDonut
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
import { VueUiDonut } from 'vue-data-ui'
import {
  chartInk,
  chartPalette,
  chartSurface,
  chartUserOptionsForTools,
  donutRadiusRatio,
  mergeChartConfig,
} from '~/utils/chartTheme.js'

const props = defineProps({
  title: {
    type: String,
    default: 'Pie',
  },
  subtitle: {
    type: String,
    default: '',
  },
  /** @type {import('vue').PropType<Array<{ name: string, values: number[], color?: string }>>} */
  dataset: {
    type: Array,
    required: true,
  },
  config: {
    type: Object,
    default: () => ({}),
  },
  bare: {
    type: Boolean,
    default: false,
  },
  fill: {
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

/** @type {ResizeObserver | null} */
let observer = null

const userOptions = computed(() => chartUserOptionsForTools(props.showTools))

const chartKey = computed(() =>
  [
    remountNonce.value,
    measuredWidth.value,
    measuredHeight.value,
    props.showLegend,
    props.showSeriesIndicators,
    props.showTools,
  ].join(':'),
)

function measure() {
  if (!hostEl.value) return
  const h = hostEl.value.clientHeight
  const w = hostEl.value.clientWidth
  if (h > 0 && w > 0) {
    measuredHeight.value = Math.max(1, Math.round(h / 4) * 4)
    measuredWidth.value = Math.max(1, Math.round(w / 4) * 4)
    ready.value = true
    return true
  }
  return false
}

/**
 * @param {number} attempts
 */
async function measureWithRetry(attempts = 12) {
  if (measure()) return
  if (attempts <= 0) {
    ready.value = true
    return
  }
  await nextTick()
  await new Promise((resolve) => requestAnimationFrame(resolve))
  await measureWithRetry(attempts - 1)
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
  await measureWithRetry()
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
    ready.value = false
    await nextTick()
    await measureWithRetry()
    bindObserver()
  },
)

watch(
  () => [props.fill, props.bare],
  async () => {
    await nextTick()
    await measureWithRetry()
    bindObserver()
  },
)

const baseConfig = computed(() => {
  const labelsOn = props.showSeriesIndicators
  return {
    responsive: true,
    autoSize: true,
    pie: true,
    useCssAnimation: true,
    customPalette: chartPalette,
    useBlurOnHover: true,
    userOptions: userOptions.value,
    events: {
      datapointClick: ({ datapoint }) => {
        emit('select', { datapoint })
      },
    },
    style: {
      fontFamily: 'DM Sans, system-ui, sans-serif',
      chart: {
        backgroundColor: chartSurface,
        color: chartInk,
        useGradient: true,
        userOptions: userOptions.value,
        layout: {
          labels: {
            hollow: {
              show: false,
            },
            dataLabels: {
              show: labelsOn,
            },
            name: {
              show: labelsOn,
              color: chartInk,
              fontSize: 12,
            },
            percentage: {
              show: labelsOn,
              color: chartInk,
              fontSize: 12,
            },
          },
          donut: {
            radiusRatio: donutRadiusRatio({
              showSeriesIndicators: labelsOn,
              pie: true,
            }),
          },
        },
        legend: {
          show: props.showLegend,
          backgroundColor: chartSurface,
          color: chartInk,
        },
      },
    },
  }
})

const mergedConfig = computed(() => mergeChartConfig(baseConfig.value, props.config))
</script>

<style scoped>
.chart-host :deep(.vue-data-ui-component),
.chart-host :deep(.vue-ui-donut) {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
