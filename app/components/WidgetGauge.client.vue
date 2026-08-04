<template>
  <WidgetPanel
    :title="title"
    :subtitle="subtitle"
  >
    <div class="mx-auto min-h-[240px] max-w-md">
      <VueUiGauge
        :dataset="dataset"
        :config="mergedConfig"
      />
    </div>
  </WidgetPanel>
</template>

<script setup>
import { computed } from 'vue'
import WidgetPanel from '~/components/WidgetPanel.vue'
import { VueUiGauge } from 'vue-data-ui'
import {
  chartAccent,
  chartInk,
  chartMute,
  chartPalette,
  chartSurface,
  chartUserOptionsOff,
  mergeChartConfig,
} from '~/utils/chartTheme.js'

const props = defineProps({
  title: {
    type: String,
    default: 'Gauge',
  },
  subtitle: {
    type: String,
    default: '',
  },
  /**
   * Gauge dataset: { value, base?, series: [{ from, to, color?, name? }] }
   * @type {import('vue').PropType<{ value: number, base?: number, series: Array<{ from: number, to: number, color?: string, name?: string }> }>}
   */
  dataset: {
    type: Object,
    required: true,
  },
  config: {
    type: Object,
    default: () => ({}),
  },
})

const baseConfig = {
  responsive: true,
  customPalette: chartPalette,
  userOptions: chartUserOptionsOff(),
  style: {
    fontFamily: 'DM Sans, system-ui, sans-serif',
    chart: {
      backgroundColor: chartSurface,
      color: chartInk,
      animation: {
        use: true,
        speed: 1.2,
      },
      layout: {
        track: {
          size: 18,
          useGradient: true,
        },
        markers: {
          show: true,
          color: chartMute,
        },
        segmentNames: {
          show: true,
          color: chartMute,
          useSerieColor: true,
        },
        pointer: {
          show: true,
          type: 'rounded',
          useRatingColor: true,
          circle: {
            color: chartSurface,
            stroke: chartAccent,
          },
        },
      },
      legend: {
        show: true,
        color: chartInk,
        useRatingColor: true,
        suffix: '',
      },
    },
  },
}

const mergedConfig = computed(() => mergeChartConfig(baseConfig, props.config))
</script>
