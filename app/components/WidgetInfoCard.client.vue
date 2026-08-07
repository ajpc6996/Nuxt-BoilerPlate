<template>
  <button
    type="button"
    class="group w-full text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
    :class="[
      bare
        ? 'rounded-md border border-transparent px-3 py-2 hover:border-[var(--accent)]'
        : 'panel px-5 py-4 hover:border-[var(--accent)]',
      fill ? 'flex h-full min-h-0 flex-col' : '',
      centered ? 'items-center justify-center text-center' : '',
      active ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : '',
    ]"
    @click="emit('select', { id, label, value, prefix, suffix })"
  >
    <p
      v-if="label"
      class="text-xs font-medium uppercase tracking-wide text-[var(--mute)]"
    >
      {{ label }}
    </p>
    <p
      class="font-display font-semibold tracking-tight text-[var(--ink)]"
      :class="[
        label ? 'mt-2 text-3xl' : 'text-4xl sm:text-5xl',
        centered ? '' : '',
      ]"
    >
      <span
        v-if="prefix"
        class="text-lg text-[var(--mute)]"
      >{{ prefix }}</span>{{ displayValue }}
      <span
        v-if="suffix"
        class="ml-1 text-base font-medium text-[var(--mute)]"
      >{{ suffix }}</span>
    </p>
    <p
      v-if="delta != null"
      class="mt-1 text-sm"
      :class="delta >= 0 ? 'text-emerald-400' : 'text-[var(--danger)]'"
    >
      {{ delta >= 0 ? '+' : '' }}{{ delta }}% vs prior
    </p>
    <div
      v-if="sparkline?.length"
      class="mt-3 h-12 w-full max-w-xs"
    >
      <ClientOnly>
        <VueUiSparkline
          :dataset="sparkline"
          :config="sparkConfig"
        />
      </ClientOnly>
    </div>
  </button>
</template>

<script setup>
import { computed } from 'vue'
import { VueUiSparkline } from 'vue-data-ui'
import { chartAccent } from '~/utils/chartTheme.js'

const props = defineProps({
  id: {
    type: String,
    required: true,
  },
  label: {
    type: String,
    default: '',
  },
  value: {
    type: [Number, String],
    required: true,
  },
  prefix: {
    type: String,
    default: '',
  },
  suffix: {
    type: String,
    default: '',
  },
  delta: {
    type: Number,
    default: null,
  },
  /** @type {import('vue').PropType<Array<{ period: string|number, value: number|null }>>} */
  sparkline: {
    type: Array,
    default: null,
  },
  active: {
    type: Boolean,
    default: false,
  },
  format: {
    type: String,
    default: 'number',
  },
  /** Center value in the available area (dashboard KPI). */
  centered: {
    type: Boolean,
    default: false,
  },
  /** Stretch to parent height. */
  fill: {
    type: Boolean,
    default: false,
  },
  /** Skip outer panel chrome when nested in DashboardWidget. */
  bare: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['select'])

const displayValue = computed(() => {
  if (typeof props.value === 'string') {
    return props.value
  }
  if (props.format === 'compact') {
    return new Intl.NumberFormat('en', {
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(props.value)
  }
  return new Intl.NumberFormat('en').format(props.value)
})

const sparkConfig = {
  responsive: true,
  type: 'line',
  style: {
    backgroundColor: 'transparent',
    fontFamily: 'DM Sans, system-ui, sans-serif',
    animation: { show: true },
    dataLabel: { show: false },
    title: { show: false },
    line: {
      color: chartAccent,
      strokeWidth: 2,
      smooth: true,
    },
    area: {
      show: true,
      color: chartAccent,
      opacity: 18,
    },
    plot: { show: false },
    tooltip: { show: false },
  },
}
</script>
