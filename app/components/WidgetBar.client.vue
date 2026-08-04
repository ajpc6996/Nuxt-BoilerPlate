<template>
  <WidgetPanel
    :title="title"
    :subtitle="subtitle"
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
    <div class="min-h-[280px]">
      <VueUiVerticalBar
        :dataset="activeDataset"
        :config="mergedConfig"
      />
    </div>
  </WidgetPanel>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import WidgetPanel from '~/components/WidgetPanel.vue'
import { VueUiVerticalBar } from 'vue-data-ui'
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
    default: 'Bar chart',
  },
  subtitle: {
    type: String,
    default: '',
  },
  /**
   * Items may include `children` for drill-down.
   * @type {import('vue').PropType<Array<{ name: string, value: number|null, color?: string, children?: Array<{ name: string, value: number|null }> }>>}
   */
  dataset: {
    type: Array,
    required: true,
  },
  config: {
    type: Object,
    default: () => ({}),
  },
})

const emit = defineEmits(['select', 'drill'])

const drilledParent = ref(null)
const childDataset = ref([])

watch(
  () => props.dataset,
  () => {
    drilledParent.value = null
    childDataset.value = []
  },
)

const activeDataset = computed(() => {
  if (drilledParent.value) {
    return childDataset.value
  }
  // Omit children so vue-data-ui does not expand natively; we own drill UX.
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

  const parent = props.dataset.find((item) => item.name === name)
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
  userOptions: chartUserOptionsOff(),
  events: {
    datapointClick: handleDatapointClick,
  },
  style: {
    fontFamily: 'DM Sans, system-ui, sans-serif',
    chart: {
      backgroundColor: chartSurface,
      color: chartInk,
      layout: {
        bars: {
          sort: 'desc',
          useGradient: true,
          borderRadius: 6,
          underlayerColor: '#14171c',
          dataLabels: {
            color: chartInk,
            value: {
              show: true,
            },
            percentage: {
              show: true,
            },
          },
          nameLabels: {
            color: chartMute,
          },
        },
        separators: {
          show: true,
          color: '#2f3742',
        },
      },
      legend: {
        show: false,
        backgroundColor: chartSurface,
        color: chartMute,
      },
    },
  },
}))

const mergedConfig = computed(() => mergeChartConfig(baseConfig.value, props.config))

function resetDrill() {
  drilledParent.value = null
  childDataset.value = []
  emit('drill', null)
}
</script>
