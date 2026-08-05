<template>
  <div class="mx-auto w-full max-w-6xl flex-1 px-6 py-10 lg:px-8">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p class="text-xs uppercase tracking-wide text-[var(--mute)]">
          Dashboard
        </p>
        <h1 class="font-display text-3xl font-semibold tracking-tight text-[var(--ink)]">
          {{ dash?.name || 'Loading…' }}
        </h1>
        <p
          v-if="dash?.description"
          class="mt-2 max-w-2xl text-[var(--mute)]"
        >
          {{ dash.description }}
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <button
          v-if="focusLabel"
          type="button"
          class="btn-secondary !px-3 !py-1.5 text-sm"
          @click="clearFilters()"
        >
          Clear filters · {{ focusLabel }}
        </button>
        <NuxtLink
          to="/dashboards"
          class="btn-secondary !px-3 !py-1.5 text-sm"
        >
          Back
        </NuxtLink>
        <NuxtLink
          v-if="canConfigure"
          :to="`/dashboards/configure/${route.params.id}`"
          class="btn-primary !px-3 !py-1.5 text-sm"
        >
          Edit
        </NuxtLink>
      </div>
    </div>

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

    <ClientOnly v-else-if="dash">
      <div
        v-if="widgets.length"
        class="mt-8 grid gap-4"
        :style="gridTemplate"
      >
        <DashboardWidget
          v-for="w in widgets"
          :key="w.id"
          :widget="w"
          :organization-id="activeOrganization.id"
          :dashboard-id="dash.id"
          :filters="filterPayload"
          @filter="onWidgetFilter"
        />
      </div>
      <p
        v-else
        class="mt-8 text-sm text-[var(--mute)]"
      >
        This dashboard has no widgets yet.
        <NuxtLink
          v-if="canConfigure"
          :to="`/dashboards/configure/${dash.id}`"
          class="text-[var(--accent-ink)] underline"
        >
          Add widgets
        </NuxtLink>
      </p>
    </ClientOnly>
  </div>
</template>

<script setup>
definePageMeta({
  layout: 'app',
  middleware: ['auth'],
})

const route = useRoute()
const { activeOrganization } = useOrganization()
const { allowsRoles } = usePermissions()
const authedFetch = useAuthedFetch()
const {
  filterPayload,
  focusLabel,
  setFilter,
  clearFilters,
} = useDashboardFilters()

const dash = ref(null)
const pending = ref(false)
const error = ref('')

const canConfigure = computed(() => allowsRoles(['platform', 'orgAdmin']))
const widgets = computed(() => dash.value?.widgets || [])

const gridTemplate = computed(() => ({
  gridTemplateColumns: `repeat(${dash.value?.layout?.cols || 12}, minmax(0, 1fr))`,
  gridAutoRows: 'minmax(4.5rem, auto)',
}))

useHead(() => ({ title: dash.value?.name || 'Dashboard' }))

function onWidgetFilter(payload) {
  setFilter(payload)
}

async function load() {
  clearFilters()
  if (!activeOrganization.value?.id || !route.params.id) {
    dash.value = null
    return
  }
  pending.value = true
  error.value = ''
  try {
    const res = await authedFetch(`/api/dashboards/${route.params.id}`, {
      query: { organizationId: activeOrganization.value.id },
    })
    dash.value = res.item
  }
  catch (err) {
    error.value = err?.data?.statusMessage || err?.message || 'Failed to load dashboard'
    dash.value = null
  }
  finally {
    pending.value = false
  }
}

watch(
  () => [activeOrganization.value?.id, route.params.id],
  () => load(),
  { immediate: true },
)
</script>
