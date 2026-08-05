<template>
  <div
    class="pipeline-node relative min-w-[180px] rounded-lg border px-3 py-2.5 shadow-sm"
    :class="toneClass"
  >
    <Handle
      v-if="showTarget"
      id="in"
      type="target"
      :position="Position.Left"
      :connectable="true"
      class="pipeline-handle pipeline-handle--target"
    />
    <div class="flex items-center justify-between gap-2 pr-1">
      <p class="text-xs font-semibold uppercase tracking-wide text-[var(--mute)]">
        {{ label }}
      </p>
      <span
        v-if="badge"
        class="rounded bg-[var(--surface)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--accent-ink)]"
      >
        {{ badge }}
      </span>
    </div>
    <p class="mt-1 text-sm font-medium text-[var(--ink)]">
      {{ title }}
    </p>
    <p
      v-if="subtitle"
      class="mt-0.5 max-w-[200px] truncate text-xs text-[var(--mute)]"
    >
      {{ subtitle }}
    </p>
    <p class="mt-2 text-[10px] text-[var(--mute-soft)]">
      Double-click to configure
    </p>
    <Handle
      v-if="showSource"
      id="out"
      type="source"
      :position="Position.Right"
      :connectable="true"
      class="pipeline-handle pipeline-handle--source"
    />
  </div>
</template>

<script setup>
import { Handle, Position } from '@vue-flow/core'

const props = defineProps({
  label: { type: String, default: '' },
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },
  badge: { type: String, default: '' },
  tone: { type: String, default: 'default' },
  showTarget: { type: Boolean, default: true },
  showSource: { type: Boolean, default: true },
})

const toneClass = computed(() => {
  if (props.tone === 'retrieve') {
    return 'border-[var(--accent)] bg-[var(--accent-soft)]'
  }
  if (props.tone === 'ingest') {
    return 'border-emerald-500/50 bg-emerald-500/10'
  }
  if (props.tone === 'filter') {
    return 'border-[var(--border)] bg-[var(--surface-raised)]'
  }
  return 'border-[var(--border)] bg-[var(--surface-raised)]'
})
</script>

<style scoped>
.pipeline-handle {
  width: 14px !important;
  height: 14px !important;
  border: 2px solid var(--surface) !important;
  background: var(--accent) !important;
  z-index: 5;
}
.pipeline-handle--target {
  left: -7px !important;
}
.pipeline-handle--source {
  right: -7px !important;
}
</style>
