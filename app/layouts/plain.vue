<template>
  <div class="flex min-h-screen flex-col bg-[var(--surface)]">
    <header class="border-b border-[var(--border)] bg-[var(--surface-raised)]/90 backdrop-blur">
      <nav
        class="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4 lg:px-8"
        aria-label="App"
      >
        <div class="flex items-center gap-6">
          <NuxtLink
            to="/"
            class="font-display text-lg font-semibold tracking-tight text-[var(--ink)]"
          >
            {{ appName }}
          </NuxtLink>
          <div class="hidden items-center gap-4 text-sm font-medium md:flex">
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
            <NuxtLink
              v-if="canOpenAdministration"
              to="/administration"
              class="text-[var(--mute)] transition-colors hover:text-[var(--accent-ink)]"
            >
              Administration
            </NuxtLink>
            <NuxtLink
              v-if="canOpenPlatform"
              to="/platform"
              class="text-[var(--mute)] transition-colors hover:text-[var(--accent-ink)]"
            >
              Platform
            </NuxtLink>
          </div>
        </div>

        <div class="flex items-center gap-3">
          <ClientOnly>
            <OrgSwitcher />
            <UserMenu />
          </ClientOnly>
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
const { canOpenAdministration, canOpenPlatform } = usePermissions()
</script>
