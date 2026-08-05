<template>
  <div class="flex shrink-0 flex-col border-t border-[var(--border)] bg-[var(--surface-raised)]">
    <div
      class="h-1.5 shrink-0 cursor-row-resize bg-[var(--border)]/60 hover:bg-[var(--accent)]/40"
      title="Drag to resize"
      @mousedown="onDragStart"
    />
    <div class="flex items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-1.5">
      <button
        type="button"
        class="flex items-center gap-2 text-xs font-medium text-[var(--ink)]"
        @click="$emit('toggle')"
      >
        <span class="font-mono text-[var(--mute)]">{{ collapsed ? '▸' : '▾' }}</span>
        Output / debug
        <span
          v-if="busy"
          class="text-[var(--accent-ink)]"
        >· busy</span>
      </button>
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="text-xs text-[var(--mute)] hover:text-[var(--ink)]"
          @click="$emit('clear')"
        >
          Clear
        </button>
      </div>
    </div>

    <div
      v-show="!collapsed"
      class="min-h-0 overflow-auto px-3 py-2"
      :style="{ height: `${panelHeight}px` }"
    >
      <p
        v-if="error"
        class="mb-2 whitespace-pre-wrap text-sm text-[var(--danger)]"
      >
        {{ error }}
      </p>
      <p
        v-if="summary"
        class="mb-2 text-sm text-[var(--ink)]"
      >
        {{ summary }}
      </p>
      <div
        v-if="busy"
        class="mb-2 flex items-center gap-2 text-sm text-[var(--mute)]"
      >
        <span class="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
        {{ busyLabel || 'Working…' }}
      </div>
      <pre
        v-if="body"
        class="overflow-auto rounded-md bg-[var(--surface)] p-3 text-xs text-[var(--mute)]"
      >{{ body }}</pre>
      <p
        v-else-if="!busy && !error && !summary"
        class="text-xs text-[var(--mute)]"
      >
        Run Test or Run to see results here.
      </p>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  collapsed: { type: Boolean, default: false },
  panelHeight: { type: Number, default: 220 },
  error: { type: String, default: '' },
  summary: { type: String, default: '' },
  body: { type: String, default: '' },
  busy: { type: Boolean, default: false },
  busyLabel: { type: String, default: '' },
})

const emit = defineEmits(['toggle', 'clear', 'resize'])

/**
 * @param {MouseEvent} event
 */
function onDragStart(event) {
  if (event.button !== 0) return
  event.preventDefault()
  const startY = event.clientY
  const startHeight = props.panelHeight

  const onMove = (e) => {
    const next = Math.min(480, Math.max(120, startHeight + (startY - e.clientY)))
    emit('resize', next)
  }
  const onUp = () => {
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}
</script>
