<template>
  <aside
    class="flex shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface-raised)] transition-[width] duration-200"
    :class="railCollapsed ? 'w-[4.25rem]' : 'w-64'"
  >
    <div class="flex items-center gap-2 border-b border-[var(--border-soft)] px-3 py-3">
      <div v-if="!railCollapsed" class="relative min-w-0 flex-1">
        <label for="nav-search" class="sr-only">Search menu</label>
        <input
          id="nav-search"
          v-model="searchQuery"
          type="search"
          placeholder="Search menu…"
          class="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--mute-soft)] focus:border-[var(--accent)]"
        >
      </div>
      <button
        type="button"
        class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[var(--border)] text-[var(--mute)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent-ink)]"
        :title="pinned ? 'Unpin menu' : 'Pin menu open'"
        :aria-pressed="pinned"
        @click="togglePinned"
      >
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path
            v-if="pinned"
            d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"
          />
          <path
            v-else
            d="M14 4v7.2L16.2 14H18v2h-5.2V22h-1.6v-6H6v-2h1.8L10 11.2V4h4zm-1.5 1.5h-1v5.6l-.4.4L9.4 14h5.2l-1.7-2.5-.4-.4V5.5z"
          />
        </svg>
      </button>
      <button
        type="button"
        class="hidden h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[var(--border)] text-[var(--mute)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent-ink)] lg:inline-flex"
        :title="railCollapsed ? 'Expand menu' : 'Collapse menu'"
        @click="toggleCollapsed"
      >
        <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.5"
            :d="railCollapsed ? 'M9 5l7 7-7 7' : 'M15 19l-7-7 7-7'"
          />
        </svg>
      </button>
    </div>

    <nav class="flex-1 overflow-y-auto px-2 py-3" aria-label="Application">
      <div
        v-for="group in filteredGroups"
        :key="group.id"
        class="mb-3"
      >
        <div
          v-if="!railCollapsed"
          class="flex w-full items-center gap-0.5"
        >
          <button
            type="button"
            class="min-w-0 flex-1 rounded-md px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--mute-soft)] hover:text-[var(--accent-ink)]"
            :title="group.to ? `Open ${group.label}` : group.label"
            @click="onGroupLabelClick(group)"
            @dblclick.prevent="onGroupToggle(group)"
          >
            <span class="truncate">{{ group.label }}</span>
          </button>
          <button
            type="button"
            class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--mute-soft)] hover:bg-[var(--accent-soft)]/50 hover:text-[var(--accent-ink)]"
            :title="isGroupOpen(group.id) ? 'Collapse' : 'Expand'"
            :aria-expanded="isGroupOpen(group.id)"
            @click.stop="onGroupToggle(group)"
          >
            <svg
              class="h-3.5 w-3.5 transition-transform"
              :class="isGroupOpen(group.id) ? 'rotate-90' : ''"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
        <p
          v-else
          class="px-1 pb-1 text-center text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--mute-soft)]"
          :title="group.label"
        >
          {{ group.label.slice(0, 1) }}
        </p>

        <ul v-show="railCollapsed || isGroupOpen(group.id)" class="mt-1 space-y-0.5">
          <li v-for="item in group.children" :key="item.id">
            <NuxtLink
              :to="item.to"
              class="flex items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colors"
              :class="isActive(item.to)
                ? 'bg-[var(--accent-soft)] font-medium text-[var(--accent-ink)]'
                : 'text-[var(--ink)] hover:bg-[var(--accent-soft)]/60 hover:text-[var(--accent-ink)]'"
              :title="item.label"
              @click="onNavigate"
            >
              <span
                class="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-[var(--surface-white)] text-[0.65rem] font-semibold text-[var(--mute)]"
              >
                {{ item.label.slice(0, 1) }}
              </span>
              <span v-if="!railCollapsed" class="truncate">{{ item.label }}</span>
            </NuxtLink>
          </li>
        </ul>
      </div>

      <p
        v-if="!filteredGroups.length"
        class="px-2 py-4 text-sm text-[var(--mute)]"
      >
        No matching menu items.
      </p>
    </nav>
  </aside>
</template>

<script setup>
const route = useRoute()
const {
  pinned,
  collapsed,
  searchQuery,
  filteredGroups,
  togglePinned,
  toggleCollapsed,
  isGroupOpen,
  toggleGroup,
  openGroupHub,
  setCollapsed,
} = useAppNav()

/** Collapsed narrow rail vs full labels */
const railCollapsed = computed(() => collapsed.value)

/** @type {ReturnType<typeof setTimeout> | null} */
let labelClickTimer = null

/**
 * True when `to` is the best (longest) nav match for the current path.
 * Prevents parent hubs like `/dashboards` lighting up under `/dashboards/configure`.
 * @param {string} to
 */
const isActive = (to) => {
  if (to === '/') return route.path === '/'
  const path = route.path
  if (path !== to && !path.startsWith(`${to}/`)) return false

  const siblings = filteredGroups.value.flatMap((group) =>
    (group.children || []).map((item) => item.to),
  )
  const hasMoreSpecific = siblings.some((other) => {
    if (!other || other === to || other.length <= to.length) return false
    return path === other || path.startsWith(`${other}/`)
  })
  return !hasMoreSpecific
}

const onNavigate = () => {
  // On small screens, collapse after navigation unless pinned
  if (import.meta.client && window.innerWidth < 1024 && !pinned.value) {
    setCollapsed(true)
  }
}

/**
 * Single click → hub. Double-click is handled separately (expand/collapse).
 * @param {{ id: string, to?: string, label?: string }} group
 */
function onGroupLabelClick(group) {
  if (labelClickTimer) {
    clearTimeout(labelClickTimer)
    labelClickTimer = null
    return
  }
  labelClickTimer = setTimeout(async () => {
    labelClickTimer = null
    await openGroupHub(group)
    onNavigate()
  }, 250)
}

/**
 * Arrow click or label double-click → expand / collapse only.
 * @param {{ id: string }} group
 */
function onGroupToggle(group) {
  if (labelClickTimer) {
    clearTimeout(labelClickTimer)
    labelClickTimer = null
  }
  toggleGroup(group.id)
}
</script>
