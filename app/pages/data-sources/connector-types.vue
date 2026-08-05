<template>
  <div class="mx-auto w-full max-w-6xl flex-1 px-6 py-10 lg:px-8">
    <div>
      <h1 class="font-display text-3xl font-semibold tracking-tight text-[var(--ink)]">
        Connector types
      </h1>
      <p class="mt-2 max-w-2xl text-[var(--mute)]">
        Platform catalog of source blueprints. Define schemas manually or generate a draft with an LLM, then review before publishing.
      </p>
    </div>

    <AppListToolbar>
      <AppListFilter
        v-model="listFilter"
        placeholder="Filter connector types…"
      />
      <button
        type="button"
        class="btn-primary !px-4 !py-2"
        @click="openGenerate"
      >
        Add
      </button>
      <NuxtLink
        to="/data-sources"
        class="btn-secondary !px-4 !py-2"
      >
        Back
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
      class="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
    >
      <article
        v-for="item in filteredItems"
        :key="item.id"
        class="panel flex flex-col px-3 py-3"
      >
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <h2 class="truncate font-display text-base font-semibold text-[var(--ink)]">
              {{ item.name }}
            </h2>
            <p class="mt-0.5 truncate font-mono text-[10px] text-[var(--accent-ink)]">
              {{ item.key }}
            </p>
            <p class="mt-1 text-[11px] text-[var(--mute)]">
              {{ item.category }} · {{ item.auth_mode }}
              <span
                v-if="!item.is_system"
                class="ml-1 rounded bg-[var(--accent-soft)] px-1 py-0.5 text-[10px]"
              >custom</span>
            </p>
          </div>
          <label class="inline-flex shrink-0 items-center gap-1 text-[11px] text-[var(--ink)]">
            <input
              type="checkbox"
              class="h-3.5 w-3.5 accent-[var(--accent)]"
              :checked="item.is_enabled"
              :disabled="savingId === item.id"
              @change="toggleEnabled(item, $event.target.checked)"
            >
            On
          </label>
        </div>
        <p
          v-if="item.description"
          class="mt-2 line-clamp-2 text-xs text-[var(--mute)]"
        >
          {{ item.description }}
        </p>
        <p class="mt-2 font-mono text-[10px] text-[var(--mute-soft)]">
          {{ item.runner_key }}
        </p>
        <details class="mt-2">
          <summary class="cursor-pointer text-xs text-[var(--accent-ink)]">
            Schemas
          </summary>
          <div class="mt-2 space-y-2">
            <div>
              <p class="mb-0.5 text-[10px] font-medium text-[var(--mute)]">Connection</p>
              <pre class="max-h-28 overflow-auto rounded-md bg-[var(--surface)] p-2 text-[10px] text-[var(--mute)]">{{ pretty(item.connection_schema) }}</pre>
            </div>
            <div>
              <p class="mb-0.5 text-[10px] font-medium text-[var(--mute)]">Source</p>
              <pre class="max-h-28 overflow-auto rounded-md bg-[var(--surface)] p-2 text-[10px] text-[var(--mute)]">{{ pretty(item.config_schema) }}</pre>
            </div>
            <div>
              <p class="mb-0.5 text-[10px] font-medium text-[var(--mute)]">Credentials</p>
              <pre class="max-h-28 overflow-auto rounded-md bg-[var(--surface)] p-2 text-[10px] text-[var(--mute)]">{{ pretty(item.credential_schema) }}</pre>
            </div>
          </div>
          <p
            v-if="item.generation_notes"
            class="mt-2 text-xs text-[var(--mute)]"
          >
            <span class="font-medium text-[var(--ink)]">Notes:</span>
            {{ item.generation_notes }}
          </p>
        </details>
      </article>
      <p
        v-if="!filteredItems.length"
        class="col-span-full py-8 text-center text-sm text-[var(--mute)]"
      >
        {{ items.length ? 'No connector types match this filter.' : 'No connector types yet.' }}
      </p>
    </div>

    <div
      v-if="wizardOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-[var(--modal-scrim)] p-4"
      @click.self="wizardOpen = false"
    >
      <div class="panel max-h-[90vh] w-full max-w-2xl overflow-y-auto px-6 py-5">
        <h2 class="font-display text-xl font-semibold text-[var(--ink)]">
          {{ proposed ? 'Review generated type' : 'Generate connector type' }}
        </h2>

        <div
          v-if="!proposed"
          class="mt-4 space-y-4"
        >
          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium text-[var(--mute)]">Describe the API or data source</label>
            <textarea
              v-model="gen.description"
              rows="5"
              class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)]"
              placeholder="e.g. REST sports API with bearer token, list teams then players per team, cursor paging via next URL…"
            />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium text-[var(--mute)]">Docs URL (optional)</label>
            <input
              v-model="gen.docsUrl"
              type="url"
              class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)]"
            >
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium text-[var(--mute)]">Sample curl / request (optional)</label>
            <textarea
              v-model="gen.sampleCurl"
              rows="4"
              class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-sm text-[var(--ink)]"
            />
          </div>
        </div>

        <div
          v-else
          class="mt-4 space-y-3"
        >
          <div class="grid gap-3 sm:grid-cols-2">
            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium text-[var(--mute)]">Name</label>
              <input
                v-model="proposed.name"
                class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)]"
              >
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium text-[var(--mute)]">Key</label>
              <input
                v-model="proposed.key"
                class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-sm text-[var(--ink)]"
              >
            </div>
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium text-[var(--mute)]">Description</label>
            <textarea
              v-model="proposed.description"
              rows="3"
              class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)]"
            />
          </div>
          <p class="text-sm text-[var(--mute)]">
            Runner <span class="font-mono text-[var(--accent-ink)]">{{ proposed.runner_key }}</span>
            · auth <span class="font-mono">{{ proposed.auth_mode }}</span>
            · paging {{ proposed.capabilities?.paging ? 'yes' : 'no' }}
            · token renewal {{ proposed.capabilities?.tokenRenewal ? 'yes' : 'no' }}
          </p>
          <details>
            <summary class="cursor-pointer text-sm text-[var(--accent-ink)]">Schemas JSON</summary>
            <pre class="mt-2 max-h-64 overflow-auto rounded-md bg-[var(--surface)] p-3 text-xs text-[var(--mute)]">{{ pretty({
              connection_schema: proposed.connection_schema,
              config_schema: proposed.config_schema,
              credential_schema: proposed.credential_schema,
              capabilities: proposed.capabilities,
            }) }}</pre>
          </details>
          <p
            v-if="proposed.generation_notes"
            class="text-sm text-[var(--mute)]"
          >
            {{ proposed.generation_notes }}
          </p>
        </div>

        <div class="mt-6 flex justify-end gap-2">
          <button
            type="button"
            class="btn-secondary !px-4 !py-2"
            @click="closeWizard"
          >
            Cancel
          </button>
          <button
            v-if="!proposed"
            type="button"
            class="btn-primary !px-4 !py-2"
            :disabled="generating"
            @click="runGenerate"
          >
            {{ generating ? 'Generating…' : 'Generate draft' }}
          </button>
          <template v-else>
            <button
              type="button"
              class="btn-secondary !px-4 !py-2"
              :disabled="generating || saving"
              @click="proposed = null"
            >
              Back
            </button>
            <button
              type="button"
              class="btn-primary !px-4 !py-2"
              :disabled="saving"
              @click="publishType"
            >
              {{ saving ? 'Saving…' : 'Publish type' }}
            </button>
          </template>
        </div>
      </div>
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
const listFilter = ref('')
const pending = ref(true)
const error = ref('')
const notice = ref('')
const savingId = ref(null)
const wizardOpen = ref(false)
const generating = ref(false)
const saving = ref(false)
const proposed = ref(null)

const filteredItems = computed(() => {
  const q = listFilter.value.trim().toLowerCase()
  if (!q) return items.value
  return items.value.filter((item) => {
    const hay = [
      item.name,
      item.key,
      item.category,
      item.auth_mode,
      item.runner_key,
      item.description,
    ].map((v) => String(v || '').toLowerCase()).join(' ')
    return hay.includes(q)
  })
})

const gen = reactive({
  description: '',
  docsUrl: '',
  sampleCurl: '',
})

function pretty(value) {
  try {
    return JSON.stringify(value ?? {}, null, 2)
  }
  catch {
    return String(value)
  }
}

function openGenerate() {
  proposed.value = null
  gen.description = ''
  gen.docsUrl = ''
  gen.sampleCurl = ''
  wizardOpen.value = true
}

function closeWizard() {
  wizardOpen.value = false
  proposed.value = null
}

async function runGenerate() {
  generating.value = true
  error.value = ''
  try {
    const res = await authedFetch('/api/connector-types/generate', {
      method: 'POST',
      body: {
        description: gen.description,
        docsUrl: gen.docsUrl || undefined,
        sampleCurl: gen.sampleCurl || undefined,
      },
    })
    proposed.value = res.proposed
  }
  catch (err) {
    error.value = err?.data?.statusMessage || err?.message || 'Generation failed'
  }
  finally {
    generating.value = false
  }
}

async function publishType() {
  if (!proposed.value) return
  saving.value = true
  error.value = ''
  notice.value = ''
  try {
    await authedFetch('/api/connector-types', {
      method: 'POST',
      body: proposed.value,
    })
    notice.value = `Published connector type “${proposed.value.name}”`
    closeWizard()
    await load()
  }
  catch (err) {
    error.value = err?.data?.statusMessage || err?.message || 'Publish failed'
  }
  finally {
    saving.value = false
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
