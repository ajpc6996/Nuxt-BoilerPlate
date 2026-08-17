<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 flex items-center justify-center bg-[var(--modal-scrim)] p-4"
    @click.self="$emit('cancel')"
  >
    <form
      class="panel max-h-[90vh] w-full max-w-xl overflow-y-auto px-6 py-5"
      autocomplete="off"
      @submit.prevent="save"
    >
      <h2 class="font-display text-xl font-semibold text-[var(--ink)]">
        New {{ direction === 'outbound' ? 'outbound' : 'inbound' }} connection
      </h2>
      <p
        v-if="system"
        class="mt-1 text-sm text-[var(--mute)]"
      >
        For {{ system.label }} · {{ databaseLabel(system.database) }}
      </p>

      <div class="mt-4 space-y-4">
        <div class="flex flex-col gap-1">
          <label class="text-xs font-medium text-[var(--mute)]">Name</label>
          <input
            v-model="form.name"
            type="text"
            required
            autocomplete="off"
            class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)]"
          >
        </div>

        <div class="flex flex-col gap-1">
          <label class="text-xs font-medium text-[var(--mute)]">Connector type</label>
          <select
            v-model="form.connectorTypeId"
            class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)]"
            required
            @change="onTypeChange"
          >
            <option value="" disabled>Select type…</option>
            <option
              v-for="t in catalog"
              :key="t.id"
              :value="t.id"
            >
              {{ t.name }} ({{ t.runner_key }})
            </option>
          </select>
          <p
            v-if="runnerHint"
            class="text-xs text-[var(--mute-soft)]"
          >
            {{ runnerHint }}
          </p>
        </div>

        <div v-if="selectedType && hasConnectionFields">
          <h3 class="mb-2 text-sm font-semibold text-[var(--ink)]">Connection settings</h3>
          <SchemaFormFields
            :schema="selectedType.connection_schema"
            :model="form.config"
            :omit-keys="authFieldOmitKeys"
            @update:model="form.config = $event"
          />
        </div>

        <div v-if="selectedType && showCredentialFields">
          <h3 class="mb-2 text-sm font-semibold text-[var(--ink)]">Credentials</h3>
          <SchemaFormFields
            :schema="selectedType.credential_schema"
            :model="form.credentials"
            secret
            @update:model="form.credentials = $event"
          />
        </div>
      </div>

      <p
        v-if="localError"
        class="mt-4 text-sm text-[var(--danger)]"
      >
        {{ localError }}
      </p>

      <div class="mt-6 flex justify-end gap-2">
        <button
          type="button"
          class="btn-secondary !px-4 !py-2"
          @click="$emit('cancel')"
        >
          Cancel
        </button>
        <button
          type="submit"
          class="btn-primary !px-4 !py-2"
          :disabled="saving"
        >
          {{ saving ? 'Creating…' : 'Create connection' }}
        </button>
      </div>
    </form>
  </div>
</template>

<script setup>
import {
  databaseLabel,
  pickConnectorTypeForSystem,
  resolveRunnerForSystem,
} from '~~/shared/migrationSystems.js'

const props = defineProps({
  open: { type: Boolean, default: false },
  organizationId: { type: String, default: '' },
  direction: { type: String, default: 'inbound' },
  catalog: { type: Array, default: () => [] },
  registeredRunners: { type: Array, default: () => [] },
  capabilityStatus: { type: Object, default: null },
  system: { type: Object, default: null },
  suggestedName: { type: String, default: '' },
})

const emit = defineEmits(['cancel', 'created'])

const authedFetch = useAuthedFetch()

const saving = ref(false)
const localError = ref('')

const form = reactive({
  name: '',
  connectorTypeId: '',
  config: {},
  credentials: {},
})

const selectedType = computed(() =>
  props.catalog.find((t) => t.id === form.connectorTypeId) || null,
)

const runnerHint = computed(() => {
  if (!props.system) return ''
  const resolved = resolveRunnerForSystem(props.system, props.registeredRunners, props.capabilityStatus)
  return resolved.message || `Suggested runner: ${resolved.runner}`
})

const hasConnectionFields = computed(() =>
  Boolean(Object.keys(selectedType.value?.connection_schema?.properties || {}).length),
)

const hasCredentialFields = computed(() =>
  Boolean(Object.keys(selectedType.value?.credential_schema?.properties || {}).length),
)

const effectiveAuthMode = computed(() => {
  const fromType = String(selectedType.value?.auth_mode || '').trim().toLowerCase()
  if (fromType === 'none') return 'none'
  return hasCredentialFields.value ? 'api_key' : 'none'
})

const showCredentialFields = computed(() =>
  hasCredentialFields.value && effectiveAuthMode.value !== 'none',
)

const authFieldOmitKeys = computed(() =>
  effectiveAuthMode.value === 'none' ? ['authHeader', 'authPrefix'] : [],
)

function defaultsFromSchema(schema) {
  const out = {}
  const properties = schema?.properties || {}
  Object.entries(properties).forEach(([key, def]) => {
    if (def.default !== undefined) out[key] = def.default
  })
  return out
}

function onTypeChange() {
  form.config = defaultsFromSchema(selectedType.value?.connection_schema)
  form.credentials = {}
}

function applySystemDefaults() {
  const picked = pickConnectorTypeForSystem(
    props.system || { connectorTypeKey: 'rest_generic', preferredRunner: 'rest_generic', fallbackRunner: 'rest_generic' },
    props.registeredRunners,
    props.catalog,
    props.capabilityStatus,
  )
  form.connectorTypeId = picked?.id || props.catalog[0]?.id || ''
  form.name = props.suggestedName || (props.system ? `${props.system.label} connection` : '')
  form.config = defaultsFromSchema(selectedType.value?.connection_schema)
  form.credentials = {}
}

watch(
  () => [props.open, props.system?.id, props.suggestedName],
  () => {
    if (!props.open) return
    localError.value = ''
    applySystemDefaults()
  },
  { immediate: true },
)

async function save() {
  if (!props.organizationId) return
  saving.value = true
  localError.value = ''
  try {
    const res = await authedFetch('/api/connections', {
      method: 'POST',
      body: {
        organizationId: props.organizationId,
        connectorTypeId: form.connectorTypeId,
        name: form.name,
        direction: props.direction,
        config: form.config,
        credentials: form.credentials,
      },
    })
    emit('created', res.item)
  }
  catch (err) {
    localError.value = err?.data?.statusMessage || err?.message || 'Create failed'
  }
  finally {
    saving.value = false
  }
}
</script>
