<template>
  <div
    ref="rootEl"
    class="relative flex w-full min-w-[10rem] items-center gap-0.5"
  >
    <button
      type="button"
      class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-[var(--border)] bg-[var(--surface)] text-[var(--mute)] hover:border-[var(--accent)] hover:text-[var(--accent-ink)]"
      :aria-label="selectLabel"
      :aria-expanded="menuOpen"
      :title="selectLabel"
      @click.stop="toggleMenu"
    >
      <svg
        class="h-3.5 w-3.5 transition-transform"
        :class="menuOpen ? 'rotate-180' : ''"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          fill-rule="evenodd"
          d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
          clip-rule="evenodd"
        />
      </svg>
    </button>
    <input
      ref="inputEl"
      :value="modelValue"
      :placeholder="inputPlaceholder"
      class="min-w-0 flex-1 rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 font-mono text-[var(--ink)]"
      autocomplete="off"
      @input="onType($event.target.value)"
      @keydown.escape="menuOpen = false"
    >
    <div
      v-if="menuOpen"
      class="absolute left-0 top-full z-30 mt-1 max-h-56 w-full min-w-[12rem] overflow-y-auto rounded-md border border-[var(--border)] bg-[var(--surface-raised)] py-1 shadow-lg"
      role="listbox"
    >
      <button
        type="button"
        class="block w-full px-3 py-1.5 text-left text-xs text-[var(--mute)] hover:bg-[var(--accent-soft)] hover:text-[var(--ink)]"
        role="option"
        @click="pick('')"
      >
        Clear
      </button>
      <button
        type="button"
        class="block w-full px-3 py-1.5 text-left text-xs text-[var(--ink)] hover:bg-[var(--accent-soft)]"
        role="option"
        @click="pickCustom"
      >
        Custom…
      </button>
      <button
        v-for="opt in options"
        :key="opt"
        type="button"
        class="block w-full px-3 py-1.5 text-left font-mono text-xs text-[var(--ink)] hover:bg-[var(--accent-soft)]"
        :class="isSelected(opt) ? 'bg-[var(--accent-soft)]' : ''"
        role="option"
        @click="pick(opt)"
      >
        {{ opt }}
      </button>
      <p
        v-if="!options.length"
        class="px-3 py-2 text-xs text-[var(--mute-soft)]"
      >
        No known fields yet.
      </p>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  modelValue: { type: String, default: '' },
  options: { type: Array, default: () => [] },
  inputPlaceholder: { type: String, default: 'or type field name' },
  selectLabel: { type: String, default: 'Select field' },
})

const emit = defineEmits(['update:modelValue'])

const rootEl = ref(null)
const inputEl = ref(null)
const menuOpen = ref(false)

function toggleMenu() {
  menuOpen.value = !menuOpen.value
}

/**
 * @param {string} opt
 */
function isSelected(opt) {
  const value = String(props.modelValue || '').trim()
  if (!value) return false
  if (value.includes(',')) {
    return value.split(',').map((s) => s.trim()).includes(opt)
  }
  return value === opt
}

/**
 * @param {string} chosen
 */
function pick(chosen) {
  menuOpen.value = false
  emit('update:modelValue', chosen)
}

function pickCustom() {
  menuOpen.value = false
  nextTick(() => inputEl.value?.focus())
}

/**
 * @param {string} raw
 */
function onType(raw) {
  emit('update:modelValue', String(raw || ''))
}

/**
 * @param {MouseEvent} event
 */
function onDocClick(event) {
  if (!menuOpen.value || !rootEl.value) return
  if (!rootEl.value.contains(/** @type {Node} */ (event.target))) {
    menuOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', onDocClick)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick)
})
</script>
