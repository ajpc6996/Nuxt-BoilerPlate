<template>
  <header class="absolute inset-x-0 top-0 z-50">
    <nav
      class="mx-auto flex max-w-6xl items-center justify-between px-6 py-5 lg:px-8"
      aria-label="Primary"
    >
      <NuxtLink
        to="/"
        class="font-display text-xl font-semibold tracking-tight text-white transition-opacity hover:opacity-80"
      >
        Northline
      </NuxtLink>

      <ul class="hidden items-center gap-8 md:flex">
        <li v-for="link in navLinks" :key="link.to">
          <NuxtLink
            :to="link.to"
            class="text-sm font-medium text-white/85 transition-colors hover:text-white"
          >
            {{ link.label }}
          </NuxtLink>
        </li>
      </ul>

      <div class="hidden md:block">
        <NuxtLink
          to="#get-started"
          class="rounded-md bg-white px-4 py-2 text-sm font-semibold text-[var(--color-ink)] transition-colors hover:bg-[var(--color-sand)]"
        >
          Get started
        </NuxtLink>
      </div>

      <button
        type="button"
        class="inline-flex items-center justify-center rounded-md p-2 text-white md:hidden"
        :aria-expanded="mobileOpen"
        aria-controls="mobile-menu"
        @click="mobileOpen = !mobileOpen"
      >
        <span class="sr-only">Toggle menu</span>
        <svg
          v-if="!mobileOpen"
          class="h-6 w-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.5"
            d="M4 7h16M4 12h16M4 17h16"
          />
        </svg>
        <svg
          v-else
          class="h-6 w-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.5"
            d="M6 6l12 12M18 6L6 18"
          />
        </svg>
      </button>
    </nav>

    <div
      v-show="mobileOpen"
      id="mobile-menu"
      class="border-t border-white/10 bg-[var(--color-ink)]/95 px-6 py-4 backdrop-blur md:hidden"
    >
      <ul class="flex flex-col gap-4">
        <li v-for="link in navLinks" :key="link.to">
          <NuxtLink
            :to="link.to"
            class="block text-sm font-medium text-white/90"
            @click="mobileOpen = false"
          >
            {{ link.label }}
          </NuxtLink>
        </li>
        <li>
          <NuxtLink
            to="#get-started"
            class="inline-flex rounded-md bg-white px-4 py-2 text-sm font-semibold text-[var(--color-ink)]"
            @click="mobileOpen = false"
          >
            Get started
          </NuxtLink>
        </li>
      </ul>
    </div>
  </header>
</template>

<script setup>
const mobileOpen = ref(false)

const navLinks = [
  { label: 'Features', to: '#features' },
  { label: 'About', to: '#about' },
  { label: 'Contact', to: '#contact' },
]
</script>
