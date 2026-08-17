<template>
  <div class="mx-auto w-full max-w-6xl flex-1 px-6 py-10 lg:px-8">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <NuxtLink
          to="/migrations"
          class="text-sm text-[var(--accent-ink)] hover:underline"
        >
          ← Migrations
        </NuxtLink>
        <h1 class="mt-2 font-display text-3xl font-semibold tracking-tight text-[var(--ink)]">
          {{ project?.name || 'Migration' }}
        </h1>
        <p
          v-if="project?.description"
          class="mt-2 max-w-2xl text-sm text-[var(--mute)]"
        >
          {{ project.description }}
        </p>
        <p class="mt-1 text-xs text-[var(--mute-soft)]">
          Status: {{ project?.status || '—' }} · Hybrid model: raw ingest + mapped dual-sink export
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="btn-secondary !px-3 !py-2 text-sm"
          :disabled="saving"
          @click="saveProject"
        >
          Save
        </button>
        <button
          type="button"
          class="btn-primary !px-3 !py-2 text-sm"
          :disabled="materializing"
          @click="materialize"
        >
          Materialize flows
        </button>
      </div>
    </div>

    <div class="mt-6 flex flex-wrap gap-2 border-b border-[var(--border)] pb-2">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        type="button"
        class="rounded-md px-3 py-1.5 text-sm transition"
        :class="activeTab === tab.id
          ? 'bg-[var(--accent-soft)] text-[var(--accent-ink)]'
          : 'text-[var(--mute)] hover:text-[var(--ink)]'"
        @click="activeTab = tab.id"
      >
        {{ tab.label }}
      </button>
    </div>

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
      v-else-if="project"
      class="mt-8"
    >
      <!-- Setup -->
      <section v-show="activeTab === 'setup'" class="flex max-w-2xl flex-col gap-4">
        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium text-[var(--ink)]">Source connection (inbound)</label>
          <select
            v-model="form.sourceConnectionId"
            class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)]"
          >
            <option value="">— Select —</option>
            <option
              v-for="c in inboundConnections"
              :key="c.id"
              :value="c.id"
            >
              {{ c.name }}
            </option>
          </select>
        </div>
        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium text-[var(--ink)]">Destination connection (outbound)</label>
          <select
            v-model="form.destinationConnectionId"
            class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)]"
          >
            <option value="">— Select —</option>
            <option
              v-for="c in outboundConnections"
              :key="c.id"
              :value="c.id"
            >
              {{ c.name }}
            </option>
          </select>
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <div class="flex flex-col gap-1.5">
            <label class="text-sm font-medium text-[var(--ink)]">Default run mode</label>
            <select
              v-model="form.defaultRunMode"
              class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
            >
              <option value="sample">Sample (test, no write on sample)</option>
              <option value="pilot">Pilot (limited run)</option>
              <option value="full">Full</option>
            </select>
          </div>
          <div class="flex flex-col gap-1.5">
            <label class="text-sm font-medium text-[var(--ink)]">Sample limit</label>
            <input
              v-model.number="form.sampleLimit"
              type="number"
              min="1"
              max="500"
              class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
            >
          </div>
        </div>
      </section>

      <!-- Plan -->
      <section v-show="activeTab === 'plan'" class="flex flex-col gap-4">
        <div class="panel px-4 py-4">
          <h2 class="font-display text-lg font-semibold text-[var(--ink)]">
            AI migration plan
          </h2>
          <p class="mt-1 text-sm text-[var(--mute)]">
            Proposes extract → transform (dual-sink) → validate stages per entity.
          </p>
          <button
            type="button"
            class="btn-primary mt-4 !px-4 !py-2 text-sm"
            :disabled="proposing"
            @click="proposePlan"
          >
            {{ proposing ? 'Generating…' : 'Generate plan with AI' }}
          </button>
          <p
            v-if="planNotes"
            class="mt-4 whitespace-pre-wrap text-sm text-[var(--mute)]"
          >
            {{ planNotes }}
          </p>
        </div>

        <div class="overflow-x-auto">
          <table class="min-w-full text-left text-sm">
            <thead class="border-b border-[var(--border)] text-[var(--mute)]">
              <tr>
                <th class="px-3 py-2">#</th>
                <th class="px-3 py-2">Stage</th>
                <th class="px-3 py-2">Type</th>
                <th class="px-3 py-2">Entity</th>
                <th class="px-3 py-2">Status</th>
                <th class="px-3 py-2">Data flow</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(stage, idx) in stages"
                :key="stage.id"
                class="border-b border-[var(--border-soft)]"
              >
                <td class="px-3 py-2 text-[var(--mute)]">{{ idx + 1 }}</td>
                <td class="px-3 py-2 text-[var(--ink)]">
                  <div>{{ stage.name }}</div>
                  <div
                    v-if="stage.description"
                    class="text-xs text-[var(--mute)]"
                  >
                    {{ stage.description }}
                  </div>
                </td>
                <td class="px-3 py-2 text-[var(--mute)]">{{ stage.stage_type }}</td>
                <td class="px-3 py-2 font-mono text-xs text-[var(--accent-ink)]">
                  {{ stage.entity_key || '—' }}
                </td>
                <td class="px-3 py-2 text-[var(--mute)]">{{ stage.status }}</td>
                <td class="px-3 py-2">
                  <NuxtLink
                    v-if="stage.data_source_id"
                    :to="`/data-sources/sources?edit=${stage.data_source_id}`"
                    class="text-[var(--accent-ink)] hover:underline"
                  >
                    Open flow
                  </NuxtLink>
                  <span v-else class="text-[var(--mute-soft)]">—</span>
                </td>
              </tr>
              <tr v-if="!stages.length">
                <td
                  colspan="6"
                  class="px-3 py-6 text-center text-[var(--mute)]"
                >
                  No stages yet. Generate a plan or add stages manually.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Mapping -->
      <section v-show="activeTab === 'mapping'" class="flex flex-col gap-6">
        <div
          v-for="stage in transformStages"
          :key="stage.id"
          class="panel px-4 py-4"
        >
          <details open>
            <summary class="cursor-pointer font-display text-lg font-semibold text-[var(--ink)]">
              {{ stage.name }}
              <span class="ml-2 font-mono text-xs font-normal text-[var(--accent-ink)]">
                {{ stage.entity_key }}
              </span>
            </summary>
            <div class="mt-4">
              <MigrationFieldMapping
                :model-value="stage.config?.fieldMappings || []"
                :source-fields="entitySourceFields(stage.entity_key)"
                :destination-fields="entityDestFields(stage.entity_key)"
                @update:model-value="(val) => updateStageMappings(stage, val)"
              />
              <button
                type="button"
                class="btn-secondary mt-4 !px-3 !py-1.5 text-xs"
                @click="saveStage(stage)"
              >
                Save mappings
              </button>
            </div>
          </details>
        </div>
        <p
          v-if="!transformStages.length"
          class="text-sm text-[var(--mute)]"
        >
          No transform stages. Generate a plan first.
        </p>
      </section>

      <!-- Run -->
      <section v-show="activeTab === 'run'" class="flex flex-col gap-4">
        <div class="panel px-4 py-4">
          <h2 class="font-display text-lg font-semibold text-[var(--ink)]">
            Run migration
          </h2>
          <p class="mt-1 text-sm text-[var(--mute)]">
            Sample uses test mode (preview rows). Pilot and full write to ingest and export via dual-sink.
          </p>
          <div class="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              class="btn-secondary !px-4 !py-2 text-sm"
              :disabled="running"
              @click="runMigration('sample')"
            >
              Sample run
            </button>
            <button
              type="button"
              class="btn-secondary !px-4 !py-2 text-sm"
              :disabled="running"
              @click="runMigration('pilot')"
            >
              Pilot run
            </button>
            <button
              type="button"
              class="btn-primary !px-4 !py-2 text-sm"
              :disabled="running"
              @click="confirmFullRun"
            >
              Full run
            </button>
          </div>
        </div>

        <div
          v-if="runs.length"
          class="overflow-x-auto"
        >
          <table class="min-w-full text-left text-sm">
            <thead class="border-b border-[var(--border)] text-[var(--mute)]">
              <tr>
                <th class="px-3 py-2">Started</th>
                <th class="px-3 py-2">Mode</th>
                <th class="px-3 py-2">Status</th>
                <th class="px-3 py-2">Error</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="run in runs"
                :key="run.id"
                class="border-b border-[var(--border-soft)]"
              >
                <td class="px-3 py-2 text-[var(--mute)]">{{ formatDate(run.started_at) }}</td>
                <td class="px-3 py-2">{{ run.run_mode }}</td>
                <td class="px-3 py-2">{{ run.status }}</td>
                <td class="px-3 py-2 text-[var(--danger)]">{{ run.last_error || '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
definePageMeta({
  layout: 'app',
  middleware: ['auth', 'admin'],
})

const route = useRoute()
const { activeOrganization } = useOrganization()
const { confirm } = useAppConfirm()

const projectId = computed(() => String(route.params.id || ''))

const tabs = [
  { id: 'setup', label: 'Setup' },
  { id: 'plan', label: 'Plan' },
  { id: 'mapping', label: 'Mapping' },
  { id: 'run', label: 'Run' },
]

const activeTab = ref('setup')
const pending = ref(true)
const error = ref('')
const notice = ref('')
const project = ref(null)
const stages = ref([])
const runs = ref([])
const connections = ref([])

const saving = ref(false)
const proposing = ref(false)
const materializing = ref(false)
const running = ref(false)

const form = reactive({
  sourceConnectionId: '',
  destinationConnectionId: '',
  defaultRunMode: 'sample',
  sampleLimit: 25,
})

const planNotes = computed(() => {
  const cfg = project.value?.plan_config
  if (!cfg || typeof cfg !== 'object') return ''
  return cfg.aiNotes || cfg.sourceSummary || ''
})

const inboundConnections = computed(() =>
  connections.value.filter((c) => c.direction === 'inbound'),
)
const outboundConnections = computed(() =>
  connections.value.filter((c) => c.direction === 'outbound'),
)
const transformStages = computed(() =>
  stages.value.filter((s) => s.stage_type === 'transform'),
)

const entitiesCatalog = computed(() => {
  const cfg = project.value?.plan_config
  return Array.isArray(cfg?.entities) ? cfg.entities : []
})

const entitySourceFields = (entityKey) => {
  const ent = entitiesCatalog.value.find((e) => e.key === entityKey)
  return ent?.sourceFields || []
}

const entityDestFields = (entityKey) => {
  const ent = entitiesCatalog.value.find((e) => e.key === entityKey)
  return ent?.destinationFields || []
}

const formatDate = (value) => {
  if (!value) return '—'
  return new Date(value).toLocaleString()
}

const loadConnections = async () => {
  if (!activeOrganization.value?.id) return
  try {
    const res = await $fetch('/api/connections', {
      query: { organizationId: activeOrganization.value.id },
    })
    connections.value = res.items || []
  }
  catch {
    connections.value = []
  }
}

const load = async () => {
  if (!activeOrganization.value?.id || !projectId.value) return
  pending.value = true
  error.value = ''
  try {
    const res = await $fetch(`/api/migrations/${projectId.value}`, {
      query: { organizationId: activeOrganization.value.id },
    })
    project.value = res.item
    stages.value = res.stages || []
    runs.value = res.runs || []
    form.sourceConnectionId = res.item.source_connection_id || ''
    form.destinationConnectionId = res.item.destination_connection_id || ''
    form.defaultRunMode = res.item.default_run_mode || 'sample'
    form.sampleLimit = res.item.sample_limit || 25
  }
  catch (err) {
    error.value = err?.data?.statusMessage || err?.message || 'Load failed'
  }
  finally {
    pending.value = false
  }
}

watch([() => activeOrganization.value?.id, projectId], () => {
  loadConnections()
  load()
}, { immediate: true })

useHead(() => ({ title: project.value?.name ? `${project.value.name} · Migration` : 'Migration' }))

const saveProject = async () => {
  if (!activeOrganization.value?.id) return
  saving.value = true
  error.value = ''
  notice.value = ''
  try {
    const res = await $fetch(`/api/migrations/${projectId.value}`, {
      method: 'PUT',
      body: {
        organizationId: activeOrganization.value.id,
        sourceConnectionId: form.sourceConnectionId || null,
        destinationConnectionId: form.destinationConnectionId || null,
        defaultRunMode: form.defaultRunMode,
        sampleLimit: form.sampleLimit,
      },
    })
    project.value = res.item
    notice.value = 'Project saved.'
  }
  catch (err) {
    error.value = err?.data?.statusMessage || err?.message || 'Save failed'
  }
  finally {
    saving.value = false
  }
}

const proposePlan = async () => {
  if (!activeOrganization.value?.id) return
  proposing.value = true
  error.value = ''
  notice.value = ''
  try {
    await saveProject()
    const res = await $fetch(`/api/migrations/${projectId.value}/apply-plan`, {
      method: 'POST',
      body: { organizationId: activeOrganization.value.id },
    })
    project.value = res.item
    stages.value = res.stages || []
    notice.value = 'AI plan applied. Review stages and mappings, then materialize.'
    activeTab.value = 'plan'
  }
  catch (err) {
    error.value = err?.data?.statusMessage || err?.message || 'Plan generation failed'
  }
  finally {
    proposing.value = false
  }
}

const materialize = async () => {
  if (!activeOrganization.value?.id) return
  materializing.value = true
  error.value = ''
  notice.value = ''
  try {
    await saveProject()
    await $fetch(`/api/migrations/${projectId.value}/materialize`, {
      method: 'POST',
      body: { organizationId: activeOrganization.value.id },
    })
    await load()
    notice.value = 'Data flows created/updated for each stage.'
  }
  catch (err) {
    error.value = err?.data?.statusMessage || err?.message || 'Materialize failed'
  }
  finally {
    materializing.value = false
  }
}

const updateStageMappings = (stage, mappings) => {
  stage.config = { ...(stage.config || {}), fieldMappings: mappings }
}

const saveStage = async (stage) => {
  if (!activeOrganization.value?.id) return
  error.value = ''
  try {
    const res = await $fetch(`/api/migrations/${projectId.value}/stages/${stage.id}`, {
      method: 'PUT',
      body: {
        organizationId: activeOrganization.value.id,
        config: stage.config,
      },
    })
    const idx = stages.value.findIndex((s) => s.id === stage.id)
    if (idx >= 0) stages.value[idx] = res.item
    notice.value = `Mappings saved for ${stage.name}.`
  }
  catch (err) {
    error.value = err?.data?.statusMessage || err?.message || 'Save stage failed'
  }
}

const runMigration = async (runMode) => {
  if (!activeOrganization.value?.id) return
  running.value = true
  error.value = ''
  notice.value = ''
  try {
    const res = await $fetch(`/api/migrations/${projectId.value}/run`, {
      method: 'POST',
      body: {
        organizationId: activeOrganization.value.id,
        runMode,
      },
    })
    notice.value = `${runMode} run completed (${res.stageResults?.length || 0} stages).`
    await load()
  }
  catch (err) {
    error.value = err?.data?.statusMessage || err?.message || 'Run failed'
    await load()
  }
  finally {
    running.value = false
  }
}

const confirmFullRun = async () => {
  const ok = await confirm({
    title: 'Full migration run?',
    message: 'This will execute all materialized stages in production run mode, writing to ingest and outbound export.',
    confirmLabel: 'Run full migration',
    danger: true,
  })
  if (!ok) return
  await runMigration('full')
}
</script>
