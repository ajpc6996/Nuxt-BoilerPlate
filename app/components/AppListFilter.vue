<template>
  <div class="relative w-full sm:w-64">
    <label class="sr-only">{{ label }}</label>
    <input
      :value="modelValue"
      type="search"
      :placeholder="placeholder"
      class="w-full rounded-md border border-[var(--border)] bg-[var(--surface-raised)] py-2 pl-3 pr-8 text-sm text-[var(--ink)] placeholder:text-[var(--mute-soft)]"
      @input="$emit('update:modelValue', $event.target.value)"
    >
    <button
      v-if="modelValue"
      type="button"
      class="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[var(--mute)] hover:text-[var(--ink)]"
      aria-label="Clear filter"
      @click="$emit('update:modelValue', '')"
    >
      ✕
    </button>
  </div>
</template>

<script setup>
defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: 'Filter…' },
  label: { type: String, default: 'Filter' },
})

defineEmits(['update:modelValue'])
</script>
