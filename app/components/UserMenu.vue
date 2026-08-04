<template>
  <div class="relative" ref="rootEl">
    <button
      v-if="!isAuthenticated"
      type="button"
      class="btn-primary !px-3 !py-1.5"
      @click="navigateTo('/login')"
    >
      Log in
    </button>

    <template v-else>
      <button
        type="button"
        class="inline-flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-white)] px-2.5 py-1.5 text-sm text-[var(--ink)] transition-colors hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]"
        :aria-expanded="open"
        @click="open = !open"
      >
        <span
          class="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--accent-soft)] text-xs font-semibold text-[var(--accent-ink)]"
        >
          {{ initials }}
        </span>
        <span class="hidden max-w-[9rem] truncate sm:inline">
          {{ displayName }}
        </span>
      </button>

      <div
        v-show="open"
        class="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-white)] shadow-[var(--shadow)]"
      >
        <div class="border-b border-[var(--border-soft)] px-3 py-2">
          <p class="truncate text-sm font-medium text-[var(--ink)]">{{ displayName }}</p>
          <p class="truncate text-xs text-[var(--mute)]">{{ profile?.email || user?.email }}</p>
        </div>
        <ul class="py-1 text-sm">
          <li>
            <NuxtLink
              to="/me"
              class="block px-3 py-2 text-[var(--ink)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent-ink)]"
              @click="open = false"
            >
              My User
            </NuxtLink>
          </li>
          <li>
            <NuxtLink
              to="/me/security"
              class="block px-3 py-2 text-[var(--ink)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent-ink)]"
              @click="open = false"
            >
              Security & MFA
            </NuxtLink>
          </li>
          <li v-if="canOpenAdministration">
            <NuxtLink
              to="/administration"
              class="block px-3 py-2 text-[var(--ink)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent-ink)]"
              @click="open = false"
            >
              Administration
            </NuxtLink>
          </li>
          <li v-if="canOpenPlatform">
            <NuxtLink
              to="/platform"
              class="block px-3 py-2 text-[var(--ink)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent-ink)]"
              @click="open = false"
            >
              Platform
            </NuxtLink>
          </li>
          <li>
            <button
              type="button"
              class="block w-full px-3 py-2 text-left text-[var(--danger)] hover:bg-[var(--accent-soft)]"
              @click="onLogout"
            >
              Log out
            </button>
          </li>
        </ul>
      </div>
    </template>
  </div>
</template>

<script setup>
const { isAuthenticated, user, profile, signOut } = useAuth()
const { canOpenAdministration, canOpenPlatform } = usePermissions()

const open = ref(false)
const rootEl = ref(null)

const displayName = computed(
  () => profile.value?.full_name || user.value?.email || 'Account',
)

const initials = computed(() => {
  const name = displayName.value.trim()
  const parts = name.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  }
  return name.slice(0, 2).toUpperCase()
})

const onLogout = async () => {
  open.value = false
  await signOut()
}

onMounted(() => {
  const onDocClick = (event) => {
    if (!rootEl.value?.contains(event.target)) {
      open.value = false
    }
  }
  document.addEventListener('click', onDocClick)
  onBeforeUnmount(() => document.removeEventListener('click', onDocClick))
})
</script>
