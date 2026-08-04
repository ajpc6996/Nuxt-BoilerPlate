<template>
  <div class="mx-auto w-full max-w-6xl flex-1 px-6 py-10 lg:px-8">
    <div>
      <h1 class="font-display text-3xl font-semibold tracking-tight text-[var(--ink)]">
        Connector types
      </h1>
      <p class="mt-2 max-w-2xl text-[var(--mute)]">
        Platform catalog of source blueprints. Each type defines the form schema and server runner.
        MFA required.
      </p>
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

    <div
      v-else
      class="mt-8 space-y-4"
    >
      <article
        v-for="item in items"
        :key="item.id"
        class="panel px-5 py-4"
      >
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 class="font-display text-lg font-semibold text-[var(--ink)]">
              {{ item.name }}
            </h2>
            <p class="mt-1 text-sm text-[var(--mute)]">
              <span class="font-mono text-[var(--accent-ink)]">{{ item.key }}</span>
              · {{ item.category }} · auth {{ item.auth_mode }} · runner
              <span class="font-mono">{{ item.runner_key }}</span>
            </p>
            <p
              v-if="item.description"
              class="mt-2 text-sm text-[var(--mute)]"
            >
              {{ item.description }}
            </p>
          </div>
          <label class="inline-flex items-center gap-2 text-sm text-[var(--ink)]">
            <input
              type="checkbox"
              class="h-4 w-4 accent-[var(--accent)]"
              :checked="item.is_enabled"
              :disabled="savingId === item.id"
              @change="toggleEnabled(item, $event.target.checked)"
            >
            Enabled
          </label>
        </div>
        <details class="mt-3">
          <summary class="cursor-pointer text-sm text-[var(--accent-ink)]">
            View schemas
          </summary>
          <div class="mt-2 grid gap-3 lg:grid-cols-2">
            <pre class="overflow-auto rounded-md bg-[var(--surface)] p-3 text-xs text-[var(--mute)]">{{ pretty(item.config_schema) }}</pre>
            <pre class="overflow-auto rounded-md bg-[var(--surface)] p-3 text-xs text-[var(--mute)]">{{ pretty(item.credential_schema) }}</pre>
          </div>
        </details>
      </article>
    </div>
  </div>
</template>

<script setup>
definePageMeta({
  layout: 'app',
  middleware: ['auth', 'platform-admin'],
})

useHead({ title: 'Connector types' })

const authedFetch = useAuthedFetch()
const items = ref([])
const pending = ref(true)
const error = ref('')
const savingId = ref(null)

function pretty(value) {
  try {
    return JSON.stringify(value ?? {}, null, 2)
  }
  catch {
    return String(value)
  }
}

async function load() {
  pending.value = true
  error.value = ''
  try {
    const res = await authedFetch('/api/connector-types')
    items.value = res.items || []
  }
  catch (err) {
    error.value = err?.data?.statusMessage || err?.message || 'Failed to load connector types'
  }
  finally {
    pending.value = false
  }
}

/**
 * @param {Record<string, unknown>} item
 * @param {boolean} enabled
 */
async function toggleEnabled(item, enabled) {
  savingId.value = item.id
  error.value = ''
  try {
    const res = await authedFetch(`/api/connector-types/${item.id}`, {
      method: 'PUT',
      body: { is_enabled: enabled },
    })
    const idx = items.value.findIndex((row) => row.id === item.id)
    if (idx >= 0) items.value[idx] = res.item
  }
  catch (err) {
    error.value = err?.data?.statusMessage || err?.message || 'Update failed'
  }
  finally {
    savingId.value = null
  }
}

onMounted(load)
</script>
