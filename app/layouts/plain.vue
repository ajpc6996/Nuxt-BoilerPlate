<template>
  <div class="flex min-h-screen flex-col bg-[var(--surface)]">
    <header class="border-b border-[var(--border)] bg-[var(--surface-raised)]/90 backdrop-blur">
      <nav
        class="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4 lg:px-8"
        aria-label="Auth"
      >
        <NuxtLink
          to="/login"
          class="flex items-center gap-2.5"
        >
          <span
            class="flex h-8 w-8 items-center justify-center overflow-hidden rounded-md border border-[var(--border)] bg-[var(--surface-white)]"
          >
            <img
              v-if="logoUrl"
              :src="logoUrl"
              alt=""
              class="h-full w-full object-contain"
            >
            <span v-else class="font-display text-sm font-semibold text-[var(--accent-ink)]">
              {{ monogram }}
            </span>
          </span>
          <span class="font-display text-lg font-semibold tracking-tight text-[var(--ink)]">
            {{ appName }}
          </span>
        </NuxtLink>
      </nav>
    </header>
    <main class="flex flex-1 flex-col">
      <slot />
    </main>
  </div>
</template>

<script setup>
const { appName, logoUrl, monogram } = useAppName()
</script>
