<template>
  <div
    class="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[var(--modal-scrim)] p-4"
    @click.self="onClose"
  >
    <form
      class="panel my-8 w-full max-w-4xl overflow-hidden px-6 py-5"
      @submit.prevent="onSave"
    >
      <h2 class="font-display text-xl font-semibold text-[var(--ink)]">
        {{ heading }}
      </h2>
      <p class="mt-1 text-sm text-[var(--mute)]">
        {{ isExtract
          ? 'Extraction reads the source table/query into ingest. Use the real table name (e.g. Users).'
          : 'Mapping transforms ingest rows and dual-sinks to the destination. Use the same entity key as the extract stage.' }}
      </p>

      <div class="mt-4 grid gap-4 sm:grid-cols-2">
        <label class="flex flex-col gap-1.5 text-sm">
          <span class="font-medium text-[var(--ink)]">Entity key</span>
          <input
            v-model="draft.entityKey"
            type="text"
            required
            class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-[var(--ink)]"
            placeholder="users"
            @input="onEntityKeyInput"
          >
          <span class="text-xs text-[var(--mute-soft)]">
            Shared with the matching extract/map pair (links ingest tables and Data Flows).
          </span>
        </label>
        <label class="flex flex-col gap-1.5 text-sm">
          <span class="font-medium text-[var(--ink)]">Step name</span>
          <input
            v-model="draft.name"
            type="text"
            required
            class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[var(--ink)]"
            @input="nameTouched = true"
          >
        </label>
        <label class="flex flex-col gap-1.5 text-sm">
          <span class="font-medium text-[var(--ink)]">Source table</span>
          <input
            v-model="draft.sourceEntity"
            type="text"
            :required="isExtract"
            class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-[var(--ink)]"
            placeholder="Users"
          >
          <span class="text-xs text-[var(--mute-soft)]">
            Real source identifier (schema.table or table). Required on extract.
          </span>
        </label>
        <label
          v-if="!isExtract"
          class="flex flex-col gap-1.5 text-sm"
        >
          <span class="font-medium text-[var(--ink)]">Destination table</span>
          <input
            v-model="draft.destinationEntity"
            type="text"
            required
            class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-[var(--ink)]"
            placeholder="users"
          >
        </label>
        <label class="sm:col-span-2 flex flex-col gap-1.5 text-sm">
          <span class="font-medium text-[var(--ink)]">Description</span>
          <textarea
            v-model="draft.description"
            rows="2"
            class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[var(--ink)]"
          />
        </label>
      </div>

      <p
        v-if="!isExtract && !hasExtractPair"
        class="mt-3 rounded-md border border-[var(--danger)] px-3 py-2 text-sm text-[var(--danger)]"
      >
        No extract stage uses this entity key yet. Add an extraction with the same key before materializing, or mapping will be blocked.
      </p>

      <div
        v-if="!isExtract"
        class="mt-6"
      >
        <h3 class="text-sm font-semibold text-[var(--ink)]">
          Field mappings
        </h3>
        <div class="mt-3">
          <MigrationFieldMapping
            :model-value="draft.fieldMappings"
            :source-fields="sourceFields"
            :destination-fields="destinationFields"
            :source-field-types="sourceFieldTypes"
            :destination-field-types="destinationFieldTypes"
            :destination-system-id="destinationSystemId"
            :entity-key="draft.entityKey"
            @update:model-value="draft.fieldMappings = $event"
            @known-fields="onKnownFields"
          />
        </div>
      </div>

      <div class="mt-6 flex justify-end gap-2">
        <button
          type="button"
          class="btn-secondary !px-4 !py-2"
          :disabled="saving"
          @click="onClose"
        >
          Cancel
        </button>
        <button
          type="submit"
          class="btn-primary !px-4 !py-2"
          :disabled="saving"
        >
          {{ saving ? 'Saving…' : (draft.id ? 'Save step' : 'Add step') }}
        </button>
      </div>
    </form>
  </div>
</template>

<script setup>
import { cleanEntityKey, migrationFlowName } from '~~/shared/migration.js'
import MigrationFieldMapping from '~/components/migration/MigrationFieldMapping.vue'

const props = defineProps({
  draft: { type: Object, required: true },
  saving: { type: Boolean, default: false },
  sourceFields: { type: Array, default: () => [] },
  destinationFields: { type: Array, default: () => [] },
  sourceFieldTypes: { type: Object, default: () => ({}) },
  destinationFieldTypes: { type: Object, default: () => ({}) },
  destinationSystemId: { type: String, default: '' },
  hasExtractPair: { type: Boolean, default: true },
})

const emit = defineEmits(['close', 'save', 'known-fields'])

const nameTouched = ref(Boolean(props.draft?.id))

const isExtract = computed(() => String(props.draft?.stageType || '') === 'extract')

const heading = computed(() => {
  const kind = isExtract.value ? 'extraction' : 'mapping'
  return props.draft?.id ? `Edit ${kind}` : `Add ${kind}`
})

function defaultName(entityKey) {
  return migrationFlowName({
    stageType: props.draft.stageType,
    entityKey: cleanEntityKey(entityKey) || entityKey,
  })
}

function onEntityKeyInput() {
  if (nameTouched.value) return
  props.draft.name = defaultName(props.draft.entityKey)
}

function onKnownFields(payload) {
  const d = props.draft
  if (!d) return
  d.knownSourceFields = payload?.sourceFields || []
  d.knownDestinationFields = payload?.destinationFields || []
  d.knownSourceFieldTypes = payload?.sourceFieldTypes || {}
  d.knownDestinationFieldTypes = payload?.destinationFieldTypes || {}
  emit('known-fields', payload)
}

function onSave() {
  emit('save')
}

function onClose() {
  emit('close')
}
</script>
