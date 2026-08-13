<template>
  <div class="mx-auto w-full max-w-6xl flex-1 px-6 py-10 lg:px-8">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="font-display text-3xl font-semibold tracking-tight text-[var(--ink)] sm:text-4xl">
          Widgets
        </h1>
        <p class="mt-2 max-w-2xl text-[var(--mute)]">
          Sample dashboard using MIT
          <a
            class="text-[var(--accent-ink)] underline-offset-2 hover:underline"
            href="https://vue-data-ui.graphieros.com/"
            target="_blank"
            rel="noreferrer"
          >vue-data-ui</a>
          — KPI cards, donut, pie, polar area, gauge, bar drill-down, and line chart.
        </p>
      </div>
      <button
        v-if="focusLabel"
        type="button"
        class="btn-secondary !px-3 !py-1.5 text-sm"
        @click="clearFocus"
      >
        Clear filter · {{ focusLabel }}
      </button>
    </div>

    <div
      v-if="focusDetail"
      class="panel mt-6 border-[var(--accent)] bg-[var(--accent-soft)] px-5 py-3 text-sm text-[var(--ink)]"
    >
      <span class="font-medium text-[var(--accent-ink)]">Drill focus:</span>
      {{ focusDetail }}
    </div>

    <div class="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <WidgetInfoCard
        v-for="card in kpiCards"
        :key="card.id"
        v-bind="card"
        :active="focusMetric === card.id"
        @select="onKpiSelect"
      />
    </div>

    <div class="mt-6 grid gap-6 lg:grid-cols-2">
      <WidgetDonut
        title="Traffic by channel"
        subtitle="Click a slice to filter the trend"
        :dataset="donutDataset"
        @select="onDonutSelect"
      />

      <WidgetGauge
        title="System health"
        subtitle="Composite score across services"
        :dataset="gaugeDataset"
      />
    </div>

    <div class="mt-6 grid gap-6 lg:grid-cols-2">
      <WidgetPie
        title="Ticket mix"
        subtitle="Open tickets by priority"
        :dataset="pieDataset"
        @select="onPieSelect"
      />

      <WidgetPolar
        title="Share by channel"
        subtitle="Polar area · relative magnitude by channel"
        :dataset="polarDataset"
        @select="onPolarSelect"
      />
    </div>

    <div class="mt-6 grid gap-6 lg:grid-cols-2">
      <WidgetBar
        title="Revenue by region"
        subtitle="Click a region to drill into countries"
        :dataset="barDataset"
        @drill="onBarDrill"
        @select="onBarSelect"
      />
    </div>

    <div class="mt-6">
      <WidgetLine
        :title="lineTitle"
        subtitle="Weekly series — click an X index on the chart"
        :dataset="lineDataset"
        :categories="weekLabels"
        @select="onLineSelect"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { chartPalette } from '~/utils/chartTheme.js'
import WidgetInfoCard from '~/components/WidgetInfoCard.client.vue'
import WidgetDonut from '~/components/WidgetDonut.client.vue'
import WidgetGauge from '~/components/WidgetGauge.client.vue'
import WidgetPie from '~/components/WidgetPie.client.vue'
import WidgetPolar from '~/components/WidgetPolar.client.vue'
import WidgetBar from '~/components/WidgetBar.client.vue'
import WidgetLine from '~/components/WidgetLine.client.vue'

definePageMeta({
  layout: 'app',
  middleware: 'auth',
})

useHead({
  title: 'Widgets',
})

const weekLabels = ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8', 'W9', 'W10', 'W11', 'W12']

const channelSeries = {
  Organic: [42, 48, 51, 55, 52, 61, 64, 70, 68, 74, 79, 82],
  Paid: [28, 30, 33, 31, 36, 38, 41, 39, 44, 47, 49, 53],
  Referral: [18, 17, 19, 22, 21, 24, 26, 25, 28, 30, 29, 32],
  Partner: [12, 14, 13, 15, 16, 18, 17, 19, 21, 20, 22, 24],
}

const kpiCards = [
  {
    id: 'revenue',
    label: 'Revenue',
    value: 248600,
    prefix: '$',
    format: 'compact',
    delta: 12.4,
    sparkline: weekLabels.map((period, i) => ({
      period,
      value: 18 + i * 1.4 + (i % 3) * 2,
    })),
  },
  {
    id: 'users',
    label: 'Active users',
    value: 18420,
    format: 'compact',
    delta: 6.1,
    sparkline: weekLabels.map((period, i) => ({
      period,
      value: 120 + i * 8 + (i % 4) * 5,
    })),
  },
  {
    id: 'tickets',
    label: 'Open tickets',
    value: 137,
    delta: -8.2,
    sparkline: weekLabels.map((period, i) => ({
      period,
      value: 160 - i * 3 + (i % 5),
    })),
  },
  {
    id: 'uptime',
    label: 'Uptime',
    value: 99.97,
    suffix: '%',
    delta: 0.02,
    sparkline: weekLabels.map((period, i) => ({
      period,
      value: 99.9 + (i % 3) * 0.02,
    })),
  },
]

const donutDataset = [
  { name: 'Organic', values: [820], color: chartPalette[0] },
  { name: 'Paid', values: [540], color: chartPalette[1] },
  { name: 'Referral', values: [310], color: chartPalette[2] },
  { name: 'Partner', values: [190], color: chartPalette[3] },
]

const pieDataset = [
  { name: 'Critical', values: [18], color: '#dc2626' },
  { name: 'Major', values: [41], color: '#ea580c' },
  { name: 'Minor', values: [52], color: '#ca8a04' },
  { name: 'None', values: [26], color: '#16a34a' },
]

const polarDataset = [
  { name: 'Organic', values: [820], color: chartPalette[0] },
  { name: 'Paid', values: [540], color: chartPalette[1] },
  { name: 'Referral', values: [310], color: chartPalette[2] },
  { name: 'Partner', values: [190], color: chartPalette[3] },
  { name: 'Direct', values: [420], color: chartPalette[4] },
]

const gaugeDataset = {
  value: 86,
  series: [
    { from: 0, to: 50, color: '#dc2626', name: 'Risk' },
    { from: 50, to: 75, color: '#ca8a04', name: 'Watch' },
    { from: 75, to: 100, color: '#16a34a', name: 'Healthy' },
  ],
}

const barDataset = [
  {
    name: 'Americas',
    value: 92000,
    color: chartPalette[0],
    children: [
      { name: 'United States', value: 61000 },
      { name: 'Canada', value: 18000 },
      { name: 'Brazil', value: 13000 },
    ],
  },
  {
    name: 'EMEA',
    value: 78000,
    color: chartPalette[2],
    children: [
      { name: 'Germany', value: 28000 },
      { name: 'UK', value: 25000 },
      { name: 'France', value: 25000 },
    ],
  },
  {
    name: 'APAC',
    value: 64000,
    color: chartPalette[3],
    children: [
      { name: 'Japan', value: 24000 },
      { name: 'Australia', value: 21000 },
      { name: 'Singapore', value: 19000 },
    ],
  },
  {
    name: 'Other',
    value: 14600,
    color: chartPalette[7],
    children: [
      { name: 'LATAM other', value: 8200 },
      { name: 'MEA', value: 6400 },
    ],
  },
]

const focusMetric = ref(null)
const focusChannel = ref(null)
const focusDetail = ref('')

const focusLabel = computed(() => {
  if (focusChannel.value) {
    return focusChannel.value
  }
  if (focusMetric.value) {
    return kpiCards.find((c) => c.id === focusMetric.value)?.label || focusMetric.value
  }
  return ''
})

const lineTitle = computed(() => {
  if (focusChannel.value) {
    return `Weekly trend · ${focusChannel.value}`
  }
  return 'Weekly trend · all channels'
})

const lineDataset = computed(() => {
  if (focusChannel.value && channelSeries[focusChannel.value]) {
    return [
      {
        name: focusChannel.value,
        type: 'line',
        useArea: true,
        smooth: true,
        color: chartPalette[0],
        series: channelSeries[focusChannel.value],
      },
    ]
  }

  return Object.entries(channelSeries).map(([name, series], index) => ({
    name,
    type: 'line',
    useArea: index === 0,
    smooth: true,
    color: chartPalette[index % chartPalette.length],
    series,
  }))
})

/**
 * @param {{ id: string, label: string, value: number|string }} payload
 */
function onKpiSelect(payload) {
  focusMetric.value = payload.id
  focusDetail.value = `${payload.label}: ${payload.prefix || ''}${payload.value}${payload.suffix || ''}`
}

/**
 * @param {{ datapoint?: { name?: string, value?: number }, index?: number }} payload
 */
function onDonutSelect(payload) {
  const name = payload?.datapoint?.name
  if (!name) {
    return
  }
  focusChannel.value = name
  focusDetail.value = `Channel “${name}” · ${payload.datapoint.value ?? '—'} sessions (trend filtered)`
}

/**
 * @param {{ datapoint?: { name?: string, value?: number } }} payload
 */
function onPieSelect(payload) {
  const name = payload?.datapoint?.name
  if (!name) {
    return
  }
  focusDetail.value = `Priority “${name}” · ${payload.datapoint.value ?? '—'} tickets`
}

/**
 * @param {{ datapoint?: { name?: string, value?: number } }} payload
 */
function onPolarSelect(payload) {
  const name = payload?.datapoint?.name
  if (!name) {
    return
  }
  focusDetail.value = `Polar channel “${name}” · ${payload.datapoint.value ?? '—'} sessions`
}

/**
 * @param {{ parent: string, children: unknown[] } | null} payload
 */
function onBarDrill(payload) {
  if (!payload) {
    focusDetail.value = 'Region drill reset'
    return
  }
  focusDetail.value = `Drilled into ${payload.parent} (${payload.children.length} countries)`
}

/**
 * @param {unknown} payload
 */
function onBarSelect(payload) {
  const name = payload?.name || payload?.datapoint?.name
  if (name) {
    focusDetail.value = `Selected bar: ${name}`
  }
}

/**
 * @param {unknown} payload
 */
function onLineSelect(payload) {
  const index = payload?.index ?? payload?.datapointIndex
  if (index == null) {
    return
  }
  focusDetail.value = `Week ${weekLabels[index] || index + 1} selected on trend`
}

function clearFocus() {
  focusMetric.value = null
  focusChannel.value = null
  focusDetail.value = ''
}
</script>
