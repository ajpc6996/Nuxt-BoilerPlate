<template>
  <div class="flex min-h-screen flex-col bg-[var(--surface)]">
    <header class="border-b border-[var(--border)] bg-[var(--surface-raised)]/90 backdrop-blur">
      <nav
        class="mx-auto flex max-w-6xl items-center justify-between px-6 py-4 lg:px-8"
        aria-label="App"
      >
        <NuxtLink
          to="/"
          class="font-display text-lg font-semibold tracking-tight text-[var(--ink)]"
        >
          {{ appName }}
        </NuxtLink>
        <div class="flex items-center gap-4 text-sm font-medium">
          <NuxtLink
            to="/login"
            class="text-[var(--mute)] transition-colors hover:text-[var(--accent-ink)]"
          >
            Login
          </NuxtLink>
          <NuxtLink
            to="/dashboard"
            class="text-[var(--mute)] transition-colors hover:text-[var(--accent-ink)]"
          >
            Dashboard
          </NuxtLink>
          <NuxtLink
            to="/grid"
            class="text-[var(--mute)] transition-colors hover:text-[var(--accent-ink)]"
          >
            Grid
          </NuxtLink>
        </div>
      </nav>
    </header>
    <main class="flex flex-1 flex-col">
      <slot />
    </main>
  </div>
</template>

<script setup>
const { appName } = useAppName()
</script>
