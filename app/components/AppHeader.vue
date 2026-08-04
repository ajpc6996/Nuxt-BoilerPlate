<template>
  <header
    class="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-[var(--border)] bg-[var(--surface-raised)] px-4 lg:px-5"
  >
    <div class="flex min-w-0 items-center gap-3">
      <button
        type="button"
        class="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[var(--border)] text-[var(--ink)] transition-colors hover:border-[var(--accent)] hover:bg-[var(--accent-soft)] lg:hidden"
        aria-label="Toggle menu"
        @click="toggleCollapsed"
      >
        <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>

      <NuxtLink to="/" class="flex min-w-0 items-center gap-2.5" :aria-label="appName">
        <span
          class="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-[var(--border)] bg-[var(--surface-white)]"
        >
          <img
            v-if="logoUrl"
            :src="logoUrl"
            alt=""
            class="h-full w-full object-contain"
          >
          <span
            v-else
            class="font-display text-sm font-semibold text-[var(--accent-ink)]"
          >
            {{ monogram }}
          </span>
        </span>
        <span class="font-display truncate text-lg font-semibold tracking-tight text-[var(--ink)]">
          {{ appName }}
        </span>
      </NuxtLink>
    </div>

    <div class="flex items-center gap-3">
      <ClientOnly>
        <OrgSwitcher />
        <UserMenu />
      </ClientOnly>
    </div>
  </header>
</template>

<script setup>
const { appName, logoUrl, monogram } = useAppName()
const { toggleCollapsed } = useAppNav()
</script>
