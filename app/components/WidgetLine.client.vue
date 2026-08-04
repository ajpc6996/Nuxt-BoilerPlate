<template>
  <WidgetPanel
    :title="title"
    :subtitle="subtitle"
  >
    <div class="min-h-[300px]">
      <VueUiXy
        :dataset="dataset"
        :config="mergedConfig"
      />
    </div>
  </WidgetPanel>
</template>

<script setup>
import { computed } from 'vue'
import WidgetPanel from '~/components/WidgetPanel.vue'
import { VueUiXy } from 'vue-data-ui'
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
})

const emit = defineEmits(['select'])

const baseConfig = {
  responsive: true,
  useCssAnimation: true,
  customPalette: chartPalette,
  userOptions: chartUserOptionsOff(),
  events: {
    datapointClick: (payload) => {
      emit('select', payload)
    },
  },
  chart: {
    fontFamily: 'DM Sans, system-ui, sans-serif',
    backgroundColor: chartSurface,
    color: chartInk,
    height: 300,
    grid: {
      stroke: '#2f3742',
      showVerticalLines: false,
      labels: {
        color: chartMute,
        xAxisLabels: {
          color: chartMute,
          values: props.categories,
        },
        yAxis: {
          color: chartMute,
        },
      },
    },
    labels: {
      fontSize: 11,
      color: chartMute,
    },
    legend: {
      color: chartMute,
      backgroundColor: chartSurface,
    },
    tooltip: {
      backgroundColor: '#14171c',
      color: chartInk,
      borderColor: '#2f3742',
    },
    highlighter: {
      color: chartAccent,
      opacity: 8,
    },
  },
}

const mergedConfig = computed(() => {
  const withCats = mergeChartConfig(baseConfig, {
    chart: {
      grid: {
        labels: {
          xAxisLabels: {
            values: props.categories,
          },
        },
      },
    },
  })
  return mergeChartConfig(withCats, props.config)
})
</script>
