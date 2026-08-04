<template>
  <button
    type="button"
    class="panel group w-full px-5 py-4 text-left transition-colors hover:border-[var(--accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
    :class="{ 'border-[var(--accent)] bg-[var(--accent-soft)]': active }"
    @click="emit('select', { id, label, value, prefix, suffix })"
  >
    <p class="text-xs font-medium uppercase tracking-wide text-[var(--mute)]">
      {{ label }}
    </p>
    <p class="mt-2 font-display text-3xl font-semibold tracking-tight text-[var(--ink)]">
      <span v-if="prefix" class="text-lg text-[var(--mute)]">{{ prefix }}</span>{{ displayValue }}
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
      class="mt-3 h-12"
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
    required: true,
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
