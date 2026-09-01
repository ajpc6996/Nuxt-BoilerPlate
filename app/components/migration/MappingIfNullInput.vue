<template>
  <div class="min-w-[9rem]">
    <select
      v-if="hint?.options?.length"
      :value="selectValue"
      class="w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[var(--ink)]"
      @change="onSelect($event.target.value)"
    >
      <option value="">
        — if null —
      </option>
      <option
        v-for="opt in hint.options"
        :key="String(opt.value)"
        :value="String(opt.value)"
      >
        {{ opt.label }}
      </option>
    </select>
    <input
      v-else
      :value="textValue"
      type="text"
      class="w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 font-mono text-[var(--ink)]"
      :placeholder="hint?.placeholder || 'if null…'"
      @change="onText($event.target.value)"
    >
    <p
      v-if="hint?.hint"
      class="mt-0.5 text-[10px] text-[var(--mute-soft)]"
    >
      {{ hint.hint }}
    </p>
  </div>
</template>

<script setup>
import {
  coerceHintValue,
  formatMappingValue,
  getDestinationFieldHint,
} from '~~/shared/destinationFieldHints.js'

const props = defineProps({
  modelValue: { type: [String, Number, Boolean], default: '' },
  destination: { type: String, default: '' },
  destinationSystemId: { type: String, default: '' },
  entityKey: { type: String, default: '' },
})

const emit = defineEmits(['update:modelValue'])

const hint = computed(() =>
  getDestinationFieldHint(props.destinationSystemId, props.entityKey, props.destination),
)

const textValue = computed(() => formatMappingValue(props.modelValue))

const selectValue = computed(() => {
  if (props.modelValue === '' || props.modelValue === undefined || props.modelValue === null) {
    return ''
  }
  return String(props.modelValue)
})

function onSelect(raw) {
  if (raw === '') {
    emit('update:modelValue', '')
    return
  }
  emit('update:modelValue', coerceHintValue(raw, hint.value))
}

function onText(raw) {
  const parsed = coerceHintValue(raw, hint.value)
  emit('update:modelValue', parsed === '' ? '' : parsed)
}
</script>
