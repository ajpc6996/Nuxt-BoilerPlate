<template>
  <WidgetPanel
    v-if="!bare"
    :title="title"
    :subtitle="subtitle"
  >
    <div class="min-h-[260px]">
      <VueUiDonut
        :key="`donut-${showLegend}-${showSeriesIndicators}`"
        :dataset="dataset"
        :config="mergedConfig"
      />
    </div>
  </WidgetPanel>
  <div
    v-else
    class="flex h-full min-h-[200px] w-full items-center justify-center"
  >
    <VueUiDonut
      :key="`donut-${showLegend}-${showSeriesIndicators}`"
      :dataset="dataset"
      :config="mergedConfig"
    />
  </div>
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
  chartUserOptionsForTools,
  mergeChartConfig,
} from '~/utils/chartTheme.js'

const props = defineProps({
  title: {
    type: String,
    default: 'Donut',
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

const userOptions = computed(() => chartUserOptionsForTools(props.showTools))

const baseConfig = computed(() => ({
  responsive: true,
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
          dataLabels: {
            show: props.showSeriesIndicators,
          },
          name: {
            show: props.showSeriesIndicators,
            color: chartInk,
            fontSize: 13,
          },
          percentage: {
            show: props.showSeriesIndicators,
            color: chartInk,
            fontSize: 13,
          },
          hollow: {
            show: true,
            total: {
              show: true,
              color: chartMute,
              text: 'Total',
              value: {
                color: chartInk,
              },
            },
            average: {
              show: false,
            },
          },
        },
      },
      legend: {
        show: props.showLegend,
        backgroundColor: chartSurface,
        color: chartInk,
      },
    },
  },
}))

const mergedConfig = computed(() => mergeChartConfig(baseConfig.value, props.config))
</script>
