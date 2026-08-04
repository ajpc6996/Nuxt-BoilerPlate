<template>
  <WidgetPanel
    :title="title"
    :subtitle="subtitle"
  >
    <div class="min-h-[260px]">
      <VueUiDonut
        :dataset="dataset"
        :config="mergedConfig"
      />
    </div>
  </WidgetPanel>
</template>

<script setup>
import { computed } from 'vue'
import WidgetPanel from '~/components/WidgetPanel.vue'
import { VueUiDonut } from 'vue-data-ui'
import {
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
})

const emit = defineEmits(['select'])

const baseConfig = {
  responsive: true,
  pie: true,
  useCssAnimation: true,
  customPalette: chartPalette,
  useBlurOnHover: true,
  userOptions: chartUserOptionsOff(),
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
      layout: {
        labels: {
          hollow: {
            show: false,
          },
          name: {
            color: chartMute,
          },
          percentage: {
            color: chartInk,
          },
        },
      },
      legend: {
        backgroundColor: chartSurface,
        color: chartMute,
      },
    },
  },
}

const mergedConfig = computed(() => mergeChartConfig(baseConfig, props.config))
</script>
