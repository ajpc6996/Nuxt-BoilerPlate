<template>
  <div class="mx-auto w-full max-w-6xl flex-1 px-6 py-10 lg:px-8">
    <div>
      <h1 class="font-display text-3xl font-semibold tracking-tight text-[var(--ink)]">
        Reports
      </h1>
      <p class="mt-2 max-w-2xl text-[var(--mute)]">
        View reports you can access in
        <span class="text-[var(--accent-ink)]">{{ activeOrganization?.name || 'the active organization' }}</span>.
      </p>
    </div>

    <AppListToolbar>
      <AppListFilter
        v-model="listFilter"
        placeholder="Filter reports…"
      />
      <NuxtLink
        v-if="canConfigure"
        to="/reports/configure"
        class="btn-secondary !px-4 !py-2"
      >
        Configure
      </NuxtLink>
    </AppListToolbar>

    <p
      v-if="error"
      class="panel mt-6 border-[var(--danger)] px-4 py-3 text-sm text-[var(--danger)]"
    >
      {{ error }}
    </p>

    <div
      v-if="pending"
      class="mt-8 text-sm text-[var(--mute)]"
    >
      Loading…
    </div>

    <div
      v-else
      class="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      <NuxtLink
        v-for="item in filtered"
        :key="item.id"
        :to="`/reports/${item.id}`"
        class="panel p-5 transition hover:border-[var(--accent)]"
      >
        <h2 class="font-display text-xl font-semibold text-[var(--ink)]">
          {{ item.name }}
        </h2>
        <p class="mt-2 line-clamp-2 text-sm text-[var(--mute)]">
          {{ item.description || 'No description' }}
        </p>
        <p class="mt-3 text-[10px] uppercase tracking-wide text-[var(--mute-soft)]">
          {{ item.visibility }}
        </p>
      </NuxtLink>
      <p
        v-if="!filtered.length"
        class="col-span-full text-sm text-[var(--mute)]"
      >
        {{ items.length ? 'No reports match this filter.' : 'No reports available yet.' }}
      </p>
    </div>
  </div>
</template>

<script setup>
definePageMeta({
  layout: 'app',
  middleware: ['auth'],
})

useHead({ title: 'Reports' })

const { activeOrganization } = useOrganization()
const { allowsRoles } = usePermissions()
const authedFetch = useAuthedFetch()

const items = ref([])
const listFilter = ref('')
const pending = ref(false)
const error = ref('')

const canConfigure = computed(() => allowsRoles(['platform', 'orgAdmin']))

const filtered = computed(() => {
  const q = listFilter.value.trim().toLowerCase()
  if (!q) return items.value
  return items.value.filter((r) =>
    [r.name, r.description, r.visibility].join(' ').toLowerCase().includes(q),
  )
})

async function load() {
  if (!activeOrganization.value?.id) {
    items.value = []
    return
  }
  pending.value = true
  error.value = ''
  try {
    const res = await authedFetch('/api/reports', {
      query: { organizationId: activeOrganization.value.id },
    })
    items.value = res.items || []
  }
  catch (err) {
    error.value = err?.data?.statusMessage || err?.message || 'Failed to load reports'
    items.value = []
  }
  finally {
    pending.value = false
  }
}

watch(() => activeOrganization.value?.id, () => load(), { immediate: true })
</script>
