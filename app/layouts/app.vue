<template>
  <div class="flex min-h-screen flex-col bg-[var(--surface)] text-[var(--ink)]">
    <AppHeader />
    <div class="relative flex min-h-0 flex-1">
      <!-- Mobile backdrop when menu is open -->
      <button
        v-if="mobileOpen"
        type="button"
        class="absolute inset-0 z-20 bg-black/50 lg:hidden"
        aria-label="Close menu"
        @click="closeMobile"
      />

      <div
        class="z-30 transition-transform duration-200 lg:relative lg:translate-x-0"
        :class="mobileOpen || !isMobile
          ? 'translate-x-0'
          : 'absolute inset-y-0 left-0 -translate-x-full lg:translate-x-0'"
      >
        <AppSidebar class="h-[calc(100vh-3.5rem)]" />
      </div>

      <main class="min-w-0 flex-1 overflow-auto">
        <slot />
      </main>
    </div>
  </div>
</template>

<script setup>
const { initSidebar, collapsed, setCollapsed, pinned } = useAppNav()

const isMobile = ref(false)
const mobileOpen = computed(() => isMobile.value && !collapsed.value)

const syncViewport = () => {
  isMobile.value = window.innerWidth < 1024
  // Desktop default stays pinned/expanded from localStorage
  if (!isMobile.value && pinned.value) {
    setCollapsed(false)
  }
}

const closeMobile = () => {
  if (isMobile.value) setCollapsed(true)
}

onMounted(() => {
  initSidebar()
  syncViewport()
  // Mobile starts collapsed (drawer closed) unless already expanded
  if (window.innerWidth < 1024) {
    setCollapsed(true)
  }
  window.addEventListener('resize', syncViewport)
  onBeforeUnmount(() => window.removeEventListener('resize', syncViewport))
})
</script>
