<template>
  <div class="mx-auto w-full max-w-6xl flex-1 px-6 py-10 lg:px-8">
    <div>
      <h1 class="font-display text-3xl font-semibold tracking-tight text-[var(--ink)]">
        Configure Dashboards
      </h1>
      <p class="mt-2 max-w-2xl text-[var(--mute)]">
        Create and edit dashboards for
        <span class="text-[var(--accent-ink)]">{{ activeOrganization?.name || 'the active organization' }}</span>.
        Org Admins see all dashboards.
      </p>
    </div>

    <AppListToolbar>
      <AppListFilter
        v-model="listFilter"
        placeholder="Filter dashboards…"
      />
      <button
        type="button"
        class="btn-primary !px-4 !py-2"
        :disabled="!activeOrganization?.id"
        @click="openCreate"
      >
        Add
      </button>
      <NuxtLink
        to="/dashboards"
        class="btn-secondary !px-4 !py-2"
      >
        View
      </NuxtLink>
    </AppListToolbar>

    <p
      v-if="error"
      class="panel mt-6 border-[var(--danger)] px-4 py-3 text-sm text-[var(--danger)]"
    >
      {{ error }}
    </p>
    <p
      v-if="notice"
      class="panel mt-6 border-[var(--accent)] bg-[var(--accent-soft)] px-4 py-3 text-sm text-[var(--ink)]"
    >
      {{ notice }}
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
            <th class="px-3 py-2 font-medium">Visibility</th>
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
            <td class="px-3 py-3 text-[var(--mute)]">{{ row.visibility }}</td>
            <td class="px-3 py-3 text-[var(--mute)]">{{ formatDate(row.updated_at) }}</td>
            <td class="px-3 py-3">
              <div class="flex flex-wrap gap-2">
                <NuxtLink
                  :to="`/dashboards/configure/${row.id}`"
                  class="btn-secondary !px-2 !py-1 text-xs"
                >
                  Edit
                </NuxtLink>
                <NuxtLink
                  :to="`/dashboards/${row.id}`"
                  class="btn-secondary !px-2 !py-1 text-xs"
                >
                  View
                </NuxtLink>
                <button
                  type="button"
                  class="text-xs text-[var(--danger)] hover:underline"
                  @click="remove(row)"
                >
                  Delete
                </button>
              </div>
            </td>
          </tr>
          <tr v-if="!filtered.length">
            <td
              colspan="4"
              class="px-3 py-8 text-center text-[var(--mute)]"
            >
              {{ items.length ? 'No dashboards match this filter.' : 'No dashboards yet.' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div
      v-if="wizardOpen"
      class="fixed inset-0 z-[60] flex items-center justify-center bg-[var(--modal-scrim)] p-4"
      @click.self="wizardOpen = false"
    >
      <div class="panel w-full max-w-md px-6 py-5">
        <h2 class="font-display text-xl font-semibold text-[var(--ink)]">
          New dashboard
        </h2>
        <div class="mt-4 space-y-3">
          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium text-[var(--mute)]">Name</label>
            <input
              v-model="wizard.name"
              type="text"
              class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)]"
            >
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium text-[var(--mute)]">Visibility</label>
            <select
              v-model="wizard.visibility"
              class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)]"
            >
              <option value="private">Private (owner + admins)</option>
              <option value="role">Limited to roles</option>
              <option value="public">Public (all org members)</option>
            </select>
          </div>
          <p
            v-if="wizardError"
            class="text-sm text-[var(--danger)]"
          >
            {{ wizardError }}
          </p>
        </div>
        <div class="mt-6 flex justify-end gap-2">
          <button
            type="button"
            class="btn-secondary !px-4 !py-2"
            @click="wizardOpen = false"
          >
            Cancel
          </button>
          <button
            type="button"
            class="btn-primary !px-4 !py-2"
            :disabled="creating"
            @click="createDashboard"
          >
            {{ creating ? 'Creating…' : 'Create' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
definePageMeta({
  layout: 'app',
  middleware: ['auth', 'admin'],
})

useHead({ title: 'Configure Dashboards' })

const { activeOrganization } = useOrganization()
const authedFetch = useAuthedFetch()
const { confirm: appConfirm } = useAppConfirm()
const router = useRouter()

const items = ref([])
const listFilter = ref('')
const pending = ref(false)
const error = ref('')
const notice = ref('')
const wizardOpen = ref(false)
const wizardError = ref('')
const creating = ref(false)
const wizard = reactive({
  name: '',
  visibility: 'private',
})

const filtered = computed(() => {
  const q = listFilter.value.trim().toLowerCase()
  if (!q) return items.value
  return items.value.filter((d) =>
    [d.name, d.description, d.visibility].join(' ').toLowerCase().includes(q),
  )
})

function formatDate(value) {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleString()
  }
  catch {
    return value
  }
}

function openCreate() {
  wizard.name = ''
  wizard.visibility = 'private'
  wizardError.value = ''
  wizardOpen.value = true
}

async function createDashboard() {
  wizardError.value = ''
  if (!wizard.name.trim()) {
    wizardError.value = 'Name is required'
    return
  }
  creating.value = true
  try {
    const res = await authedFetch('/api/dashboards', {
      method: 'POST',
      body: {
        organizationId: activeOrganization.value.id,
        name: wizard.name.trim(),
        visibility: wizard.visibility,
      },
    })
    wizardOpen.value = false
    await router.push(`/dashboards/configure/${res.item.id}`)
  }
  catch (err) {
    wizardError.value = err?.data?.statusMessage || err?.message || 'Create failed'
  }
  finally {
    creating.value = false
  }
}

async function remove(row) {
  const ok = await appConfirm({
    title: 'Delete dashboard?',
    message: `Delete “${row.name}” and all of its widgets?`,
    confirmLabel: 'Delete',
    danger: true,
  })
  if (!ok) return
  error.value = ''
  try {
    await authedFetch(`/api/dashboards/${row.id}`, {
      method: 'DELETE',
      query: { organizationId: activeOrganization.value.id },
    })
    notice.value = 'Dashboard deleted'
    await load()
  }
  catch (err) {
    error.value = err?.data?.statusMessage || err?.message || 'Delete failed'
  }
}

async function load() {
  if (!activeOrganization.value?.id) {
    items.value = []
    return
  }
  pending.value = true
  error.value = ''
  try {
    const res = await authedFetch('/api/dashboards', {
      query: { organizationId: activeOrganization.value.id },
    })
    items.value = res.items || []
  }
  catch (err) {
    error.value = err?.data?.statusMessage || err?.message || 'Failed to load'
    items.value = []
  }
  finally {
    pending.value = false
  }
}

watch(() => activeOrganization.value?.id, () => load(), { immediate: true })
</script>
