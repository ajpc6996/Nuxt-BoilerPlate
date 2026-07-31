<template>
  <div class="flex min-h-screen flex-col bg-[var(--color-mist)]">
    <header class="border-b border-[var(--color-ink)]/10 bg-white/70 backdrop-blur">
      <nav
        class="mx-auto flex max-w-6xl items-center justify-between px-6 py-4 lg:px-8"
        aria-label="App"
      >
        <NuxtLink
          to="/"
          class="font-display text-lg font-semibold tracking-tight text-[var(--color-ink)]"
        >
          Northline
        </NuxtLink>
        <div class="flex items-center gap-4 text-sm font-medium">
          <NuxtLink
            to="/login"
            class="text-[var(--color-ink)]/70 transition-colors hover:text-[var(--color-ink)]"
          >
            Login
          </NuxtLink>
          <NuxtLink
            to="/dashboard"
            class="text-[var(--color-ink)]/70 transition-colors hover:text-[var(--color-ink)]"
          >
            Dashboard
          </NuxtLink>
        </div>
      </nav>
    </header>
    <main class="flex flex-1 flex-col">
      <slot />
    </main>
  </div>
</template>
