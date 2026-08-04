<template>
  <section class="panel flex flex-col overflow-hidden">
    <header
      v-if="title || $slots.actions"
      class="flex items-start justify-between gap-3 border-b border-[var(--border-soft)] px-5 py-4"
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
    <div class="flex-1 px-4 py-4 sm:px-5">
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
})
</script>
