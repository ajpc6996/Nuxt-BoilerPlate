<template>
  <section
    class="panel flex min-h-0 flex-col overflow-hidden"
    :class="fill ? 'h-full' : ''"
  >
    <header
      v-if="title || $slots.actions"
      class="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--border-soft)] px-5 py-4"
    >
      <div class="min-w-0">
        <h2
          v-if="title"
          class="font-display text-base font-semibold tracking-tight text-[var(--ink)]"
        >
          {{ title }}
        </h2>
        <p
          v-if="subtitle"
          class="mt-0.5 text-sm text-[var(--mute)]"
        >
          {{ subtitle }}
        </p>
      </div>
      <div
        v-if="$slots.actions"
        class="shrink-0"
      >
        <slot name="actions" />
      </div>
    </header>
    <div
      class="min-h-0 flex-1"
      :class="compact ? 'p-2 sm:p-3' : 'px-4 py-4 sm:px-5'"
    >
      <slot />
    </div>
  </section>
</template>

<script setup>
defineProps({
  title: {
    type: String,
    default: '',
  },
  subtitle: {
    type: String,
    default: '',
  },
  /** Stretch to parent height (dashboard widgets). */
  fill: {
    type: Boolean,
    default: false,
  },
  /** Tighter padding when chrome is outside the panel. */
  compact: {
    type: Boolean,
    default: false,
  },
})
</script>
