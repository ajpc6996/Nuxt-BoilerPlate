<template>
  <div class="mx-auto w-full max-w-6xl flex-1 px-6 py-10 lg:px-8">
    <div>
      <h1 class="font-display text-3xl font-semibold tracking-tight text-[var(--ink)]">
        Migrations
      </h1>
      <p class="mt-2 max-w-2xl text-[var(--mute)]">
        Multi-stage system migrations for
        <span class="text-[var(--accent-ink)]">{{ activeOrganization?.name || 'the active organization' }}</span>.
        Raw data lands in ingest; mapped rows dual-sink to ingest and outbound export.
      </p>
    </div>

    <AppListToolbar>
      <AppListFilter
        v-model="listFilter"
        placeholder="Filter migrations…"
      />
      <button
        type="button"
        class="btn-primary !px-4 !py-2"
        :disabled="!activeOrganization?.id"
        @click="openCreate"
      >
        Add
      </button>
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
      class="mt-8 overflow-x-auto"
    >
      <table class="min-w-full text-left text-sm">
        <thead class="border-b border-[var(--border)] text-[var(--mute)]">
          <tr>
            <th class="px-3 py-2 font-medium">Name</th>
            <th class="px-3 py-2 font-medium">Status</th>
            <th class="px-3 py-2 font-medium">Run mode</th>
            <th class="px-3 py-2 font-medium">Updated</th>
            <th class="px-3 py-2 font-medium" />
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in filtered"
            :key="row.id"
            class="border-b border-[var(--border-soft)]"
          >
            <td class="px-3 py-3 text-[var(--ink)]">{{ row.name }}</td>
            <td class="px-3 py-3 text-[var(--mute)]">{{ row.status }}</td>
            <td class="px-3 py-3 text-[var(--mute)]">{{ row.default_run_mode }}</td>
            <td class="px-3 py-3 text-[var(--mute)]">{{ formatDate(row.updated_at) }}</td>
            <td class="px-3 py-3">
              <NuxtLink
                :to="`/migrations/${row.id}`"
                class="text-[var(--accent-ink)] hover:underline"
              >
                Open
              </NuxtLink>
            </td>
          </tr>
          <tr v-if="!filtered.length">
            <td
              colspan="5"
              class="px-3 py-8 text-center text-[var(--mute)]"
            >
              No migration projects yet.
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div
      v-if="showCreate"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      @click.self="showCreate = false"
    >
      <form
        class="panel w-full max-w-md p-6"
        @submit.prevent="createProject"
      >
        <h2 class="font-display text-xl font-semibold text-[var(--ink)]">
          New migration
        </h2>
        <div class="mt-4 flex flex-col gap-1.5">
          <label class="text-sm font-medium text-[var(--ink)]">Name</label>
          <input
            v-model="createName"
            required
            class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)]"
          >
        </div>
        <div class="mt-4 flex flex-col gap-1.5">
          <label class="text-sm font-medium text-[var(--ink)]">Description</label>
          <textarea
            v-model="createDescription"
            rows="3"
            class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)]"
            placeholder="What are you migrating, from which system to which?"
          />
        </div>
        <div class="mt-6 flex justify-end gap-2">
          <button
            type="button"
            class="btn-secondary !px-4 !py-2"
            @click="showCreate = false"
          >
            Cancel
          </button>
          <button
            type="submit"
            class="btn-primary !px-4 !py-2"
            :disabled="creating"
          >
            Create
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
definePageMeta({
  layout: 'app',
  middleware: ['auth', 'admin'],
})

useHead({ title: 'Migrations' })

const { activeOrganization } = useOrganization()
const router = useRouter()

const listFilter = ref('')
const error = ref('')
const pending = ref(true)
const items = ref([])
const showCreate = ref(false)
const createName = ref('')
const createDescription = ref('')
const creating = ref(false)

const filtered = computed(() => {
  const q = listFilter.value.trim().toLowerCase()
  if (!q) return items.value
  return items.value.filter((row) =>
    [row.name, row.status, row.description].some((v) => String(v || '').toLowerCase().includes(q)),
  )
})

const formatDate = (value) => {
  if (!value) return '—'
  return new Date(value).toLocaleString()
}

const load = async () => {
  if (!activeOrganization.value?.id) {
    items.value = []
    pending.value = false
    return
  }
  pending.value = true
  error.value = ''
  try {
    const res = await $fetch('/api/migrations', {
      query: { organizationId: activeOrganization.value.id },
    })
    items.value = res.items || []
  }
  catch (err) {
    error.value = err?.data?.statusMessage || err?.message || 'Load failed'
  }
  finally {
    pending.value = false
  }
}

watch(() => activeOrganization.value?.id, load, { immediate: true })

const openCreate = () => {
  createName.value = ''
  createDescription.value = ''
  showCreate.value = true
}

const createProject = async () => {
  if (!activeOrganization.value?.id) return
  creating.value = true
  error.value = ''
  try {
    const res = await $fetch('/api/migrations', {
      method: 'POST',
      body: {
        organizationId: activeOrganization.value.id,
        name: createName.value,
        description: createDescription.value,
      },
    })
    showCreate.value = false
    await router.push(`/migrations/${res.item.id}`)
  }
  catch (err) {
    error.value = err?.data?.statusMessage || err?.message || 'Create failed'
  }
  finally {
    creating.value = false
  }
}
</script>
