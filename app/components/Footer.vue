<template>
  <footer
    id="contact"
    class="border-t border-[var(--border)] bg-[var(--surface-raised)] text-[var(--ink)]"
  >
    <div
      class="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-12 md:flex-row md:items-end md:justify-between lg:px-8"
    >
      <div>
        <p class="font-display text-2xl font-semibold tracking-tight">
          {{ appName }}
        </p>
        <p class="mt-2 max-w-sm text-sm text-[var(--mute)]">
          A modular Nuxt JavaScript starter with Tailwind and Dark Theme —
          ready to shape into your next product.
        </p>
      </div>

      <div class="flex flex-col gap-3 text-sm md:items-end">
        <nav aria-label="Footer" class="flex flex-wrap gap-6">
          <NuxtLink
            v-for="link in footerLinks"
            :key="link.to"
            :to="link.to"
            class="text-[var(--mute)] transition-colors hover:text-[var(--accent-ink)]"
          >
            {{ link.label }}
          </NuxtLink>
        </nav>
        <p class="text-xs text-[var(--mute-soft)]">
          © {{ currentYear }} {{ appName }}. All rights reserved.
        </p>
      </div>
    </div>
  </footer>
</template>

<script setup>
const { appName } = useAppName()
const currentYear = new Date().getFullYear()

const footerLinks = [
  { label: 'Features', to: '#features' },
  { label: 'About', to: '#about' },
  { label: 'Get started', to: '#get-started' },
]
</script>
