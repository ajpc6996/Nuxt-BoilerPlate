<template>
  <div class="panel flex flex-col gap-4 px-4 py-4">
    <div>
      <h3 class="font-display text-lg font-semibold text-[var(--ink)]">
        {{ title }}
      </h3>
      <p class="mt-1 text-sm text-[var(--mute)]">
        {{ subtitle }}
      </p>
    </div>

    <div
      v-if="inferencePrompt"
      class="rounded-md border border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-3 text-sm text-[var(--ink)]"
    >
      <p>
        Likely system: <strong>{{ inferencePrompt.label }}</strong>
        ({{ databaseLabel(inferencePrompt.database) }})
      </p>
      <p class="mt-1 text-xs text-[var(--mute)]">
        {{ inferencePrompt.notes }}
      </p>
      <div class="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          class="btn-primary !px-3 !py-1.5 text-xs"
          @click="acceptInference"
        >
          Use this
        </button>
        <button
          type="button"
          class="btn-secondary !px-3 !py-1.5 text-xs"
          @click="dismissInference"
        >
          Choose manually
        </button>
      </div>
    </div>

    <div class="flex flex-col gap-1.5">
      <label class="text-sm font-medium text-[var(--ink)]">System</label>
      <select
        :value="systemId"
        class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)]"
        @change="onSystemChange($event.target.value)"
      >
        <option
          v-for="sys in MIGRATION_SYSTEM_CATALOG"
          :key="sys.id"
          :value="sys.id"
        >
          {{ sys.label }} — {{ databaseLabel(sys.database) }}
        </option>
      </select>
      <p
        v-if="selectedSystem"
        class="text-xs text-[var(--mute)]"
      >
        {{ selectedSystem.notes }}
      </p>
      <p
        v-if="runnerStatus.message"
        class="text-xs"
        :class="runnerStatusClass"
      >
        {{ runnerStatus.message }}
      </p>
      <div
        v-if="showDriverAction"
        class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-sm"
      >
        <p class="text-[var(--ink)]">
          Driver required: <span class="font-mono text-[var(--accent-ink)]">{{ runnerStatus.driverKey }}</span>
        </p>
        <div class="mt-2 flex flex-wrap gap-2">
          <NuxtLink
            v-if="isPlatformAdmin"
            to="/administration/connector-drivers"
            class="btn-primary !px-3 !py-1.5 text-xs"
          >
            Install / enable driver
          </NuxtLink>
          <button
            v-if="driverDetails?.installInstructions"
            type="button"
            class="btn-secondary !px-3 !py-1.5 text-xs"
            @click="showInstructions = !showInstructions"
          >
            {{ showInstructions ? 'Hide' : 'Show' }} install steps
          </button>
        </div>
        <pre
          v-if="showInstructions && driverDetails?.installInstructions"
          class="mt-3 overflow-x-auto rounded border border-[var(--border-soft)] bg-[var(--surface-raised)] p-2 text-[10px] text-[var(--mute)]"
        >{{ driverDetails.installInstructions }}</pre>
      </div>
    </div>

    <div class="flex flex-col gap-1.5">
      <label class="text-sm font-medium text-[var(--ink)]">Connection</label>
      <div class="flex flex-wrap gap-2">
        <select
          :value="modelValue"
          class="min-w-[12rem] flex-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)]"
          @change="$emit('update:modelValue', $event.target.value)"
        >
          <option value="">— Select existing —</option>
          <option
            v-for="c in filteredConnections"
            :key="c.id"
            :value="c.id"
          >
            {{ c.name }}
          </option>
        </select>
        <button
          type="button"
          class="btn-secondary !px-3 !py-2 text-sm"
          @click="editorOpen = true"
        >
          Create new
        </button>
      </div>
      <p
        v-if="!filteredConnections.length"
        class="text-xs text-[var(--mute-soft)]"
      >
        No {{ direction }} connections yet — create one for {{ selectedSystem?.label || 'this system' }}.
      </p>
    </div>

    <MigrationConnectionEditor
      :open="editorOpen"
      :organization-id="organizationId"
      :direction="direction"
      :catalog="catalog"
      :registered-runners="registeredRunners"
      :capability-status="capabilityStatus"
      :system="selectedSystem"
      :suggested-name="suggestedConnectionName"
      @cancel="editorOpen = false"
      @created="onConnectionCreated"
    />
  </div>
</template>

<script setup>
import {
  MIGRATION_SYSTEM_CATALOG,
  databaseLabel,
  getMigrationSystem,
  inferMigrationSystems,
  inferMigrationEndpoints,
  resolveRunnerForSystem,
} from '~~/shared/migrationSystems.js'
import { normalizeConnectionDirection } from '~~/shared/connectionDirection.js'

const props = defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
  modelValue: { type: String, default: '' },
  systemId: { type: String, default: 'custom' },
  direction: { type: String, default: 'inbound' },
  connections: { type: Array, default: () => [] },
  catalog: { type: Array, default: () => [] },
  registeredRunners: { type: Array, default: () => [] },
  capabilityStatus: { type: Object, default: null },
  organizationId: { type: String, default: '' },
  inferenceText: { type: String, default: '' },
  role: { type: String, default: 'source' },
})

const emit = defineEmits(['update:modelValue', 'update:systemId', 'connection-created'])

const authStore = useAuthStore()
const isPlatformAdmin = computed(() => authStore.isPlatformAdmin)
const showInstructions = ref(false)

const editorOpen = ref(false)
const inferenceDismissed = ref(false)
const pendingInference = ref(null)

const selectedSystem = computed(() => getMigrationSystem(props.systemId))

const runnerStatus = computed(() =>
  resolveRunnerForSystem(selectedSystem.value, props.registeredRunners, props.capabilityStatus),
)

const driverDetails = computed(() =>
  props.capabilityStatus?.drivers?.find((d) => d.key === runnerStatus.value.driverKey) || null,
)

const showDriverAction = computed(() =>
  ['needs_install', 'needs_enable', 'fallback'].includes(runnerStatus.value.status)
  && runnerStatus.value.driverKey,
)

const runnerStatusClass = computed(() => {
  if (runnerStatus.value.status === 'missing_runner' || runnerStatus.value.status === 'needs_install') {
    return 'text-[var(--danger)]'
  }
  if (runnerStatus.value.status === 'needs_enable') return 'text-amber-300'
  return 'text-[var(--accent-ink)]'
})

const filteredConnections = computed(() =>
  (props.connections || []).filter((c) => normalizeConnectionDirection(c.direction) === props.direction),
)

const suggestedConnectionName = computed(() => {
  const role = props.direction === 'outbound' ? 'Destination' : 'Source'
  return selectedSystem.value?.id === 'custom'
    ? `${role} connection`
    : `${selectedSystem.value?.label || role} — ${props.direction === 'outbound' ? 'outbound' : 'inbound'}`
})

const inferencePrompt = computed(() => {
  if (inferenceDismissed.value || props.systemId !== 'custom') return null
  return pendingInference.value
})

function onSystemChange(id) {
  emit('update:systemId', id)
  inferenceDismissed.value = true
}

function acceptInference() {
  if (!pendingInference.value) return
  emit('update:systemId', pendingInference.value.id)
  inferenceDismissed.value = true
}

function dismissInference() {
  inferenceDismissed.value = true
  pendingInference.value = null
}

function onConnectionCreated(item) {
  editorOpen.value = false
  emit('update:modelValue', item.id)
  emit('connection-created', item)
}

watch(
  () => props.inferenceText,
  (text) => {
    if (props.systemId !== 'custom') return
    const endpoints = inferMigrationEndpoints(text)
    pendingInference.value = props.role === 'destination'
      ? endpoints.destination
      : endpoints.source
    inferenceDismissed.value = false
  },
  { immediate: true },
)
</script>
