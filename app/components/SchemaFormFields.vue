<template>
  <div class="space-y-4">
    <div
      v-for="field in fields"
      :key="field.key"
      class="flex flex-col gap-1"
    >
      <label
        :for="`schema-${field.key}`"
        class="text-xs font-medium text-[var(--mute)]"
      >
        {{ field.title }}
        <span
          v-if="field.required"
          class="text-[var(--danger)]"
        >*</span>
      </label>
      <p
        v-if="field.description"
        class="text-xs text-[var(--mute-soft)]"
      >
        {{ field.description }}
      </p>

      <label
        v-if="field.type === 'boolean'"
        class="flex items-center gap-2 text-sm text-[var(--ink)]"
      >
        <input
          :id="`schema-${field.key}`"
          type="checkbox"
          :checked="Boolean(model[field.key])"
          @change="setValue(field.key, $event.target.checked)"
        >
        Enable
      </label>

      <select
        v-else-if="field.options?.length"
        :id="`schema-${field.key}`"
        :name="field.inputName"
        autocomplete="off"
        class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)]"
        :value="model[field.key] ?? ''"
        @change="setValue(field.key, $event.target.value)"
      >
        <option value="">{{ field.optionalSelect ? 'None (default)' : 'Select…' }}</option>
        <option
          v-for="opt in field.options"
          :key="opt.value"
          :value="opt.value"
        >
          {{ opt.label }}
        </option>
      </select>

      <textarea
        v-else-if="field.multiline"
        :id="`schema-${field.key}`"
        :name="field.inputName"
        autocomplete="off"
        rows="6"
        class="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-sm text-[var(--ink)]"
        :value="fieldDisplayValue(field)"
        :placeholder="field.secret ? '••••••••' : ''"
        @input="onFieldInput(field, $event.target.value)"
      />

      <div
        v-else-if="field.secret && revealable"
        class="flex items-center gap-2"
      >
        <input
          :id="`schema-${field.key}`"
          :name="field.inputName"
          :type="fieldRevealType(field)"
          :autocomplete="field.autocomplete"
          data-lpignore="true"
          data-1p-ignore="true"
          class="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)]"
          :value="fieldDisplayValue(field)"
          :placeholder="field.placeholder"
          @input="onFieldInput(field, $event.target.value)"
        >
        <button
          v-if="canRevealField(field)"
          type="button"
          class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[var(--border)] text-[var(--mute)] hover:border-[var(--accent)] hover:text-[var(--accent-ink)]"
          :title="isRevealed(field.key) ? 'Hide stored value' : 'Show stored value'"
          :aria-label="isRevealed(field.key) ? 'Hide stored value' : 'Show stored value'"
          @click="toggleReveal(field.key)"
        >
          <svg
            v-if="isRevealed(field.key)"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.75"
            class="h-4 w-4"
            aria-hidden="true"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88"
            />
          </svg>
          <svg
            v-else
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.75"
            class="h-4 w-4"
            aria-hidden="true"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M2.036 12.322a1 1 0 0 1 0-.644C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.01 9.963 7.178.07.207.07.431 0 .644C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.01-9.964-7.178Z"
            />
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
            />
          </svg>
        </button>
      </div>

      <input
        v-else-if="field.type === 'integer' || field.type === 'number'"
        :id="`schema-${field.key}`"
        :name="field.inputName"
        type="number"
        autocomplete="off"
        class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)]"
        :value="model[field.key] ?? ''"
        @input="setValue(field.key, $event.target.value === '' ? null : Number($event.target.value))"
      >

      <input
        v-else
        :id="`schema-${field.key}`"
        :name="field.inputName"
        :type="field.inputType"
        :autocomplete="field.autocomplete"
        data-lpignore="true"
        data-1p-ignore="true"
        class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)]"
        :value="model[field.key] ?? ''"
        :placeholder="field.placeholder"
        @input="setValue(field.key, $event.target.value)"
      >
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import {
  AWS_REGIONS,
  isAwsRegionFieldKey,
  isUrlFieldKey,
} from '~~/shared/awsRegions.js'

const props = defineProps({
  schema: {
    type: Object,
    default: () => ({}),
  },
  modelValue: {
    type: Object,
    default: () => ({}),
  },
  secret: {
    type: Boolean,
    default: false,
  },
  hasExistingSecrets: {
    type: Boolean,
    default: false,
  },
  revealable: {
    type: Boolean,
    default: false,
  },
  storedValues: {
    type: Object,
    default: () => ({}),
  },
  omitKeys: {
    type: Array,
    default: () => [],
  },
})

const emit = defineEmits(['update:modelValue'])

const model = computed(() => props.modelValue || {})
const revealedKeys = ref(new Set())

watch(
  () => props.storedValues,
  () => {
    revealedKeys.value = new Set()
  },
)

/**
 * @param {{ key: string }} field
 */
function canRevealField(field) {
  if (!props.secret || !props.revealable) return false
  const stored = props.storedValues?.[field.key]
  return stored != null && String(stored).trim() !== ''
}

/**
 * @param {string} key
 */
function isRevealed(key) {
  return revealedKeys.value.has(key)
}

/**
 * @param {{ key: string, inputType: string }} field
 */
function fieldRevealType(field) {
  if (!props.secret) return field.inputType
  return isRevealed(field.key) ? 'text' : 'password'
}

/**
 * @param {{ key: string }} field
 */
function fieldDisplayValue(field) {
  const typed = model.value[field.key]
  if (typed != null && String(typed) !== '') return typed
  if (isRevealed(field.key) && props.storedValues?.[field.key] != null) {
    return String(props.storedValues[field.key])
  }
  return ''
}

/**
 * @param {{ key: string }} field
 * @param {string} value
 */
function onFieldInput(field, value) {
  if (isRevealed(field.key)) {
    const next = new Set(revealedKeys.value)
    next.delete(field.key)
    revealedKeys.value = next
  }
  setValue(field.key, value)
}

/**
 * @param {string} key
 */
function toggleReveal(key) {
  const next = new Set(revealedKeys.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  revealedKeys.value = next
}

const fields = computed(() => {
  const properties = props.schema?.properties || {}
  const required = new Set(props.schema?.required || [])
  const omit = new Set(props.omitKeys || [])
  return Object.entries(properties)
    .filter(([key]) => !omit.has(key))
    .map(([key, def]) => {
      const title = def.title || key
      const type = def.type || 'string'
      const multiline = props.secret
        ? false
        : key.toLowerCase().includes('json')
          || key.toLowerCase().includes('csv')
          || key.toLowerCase().includes('inline')
          || Boolean(def.multiline)
      const options = resolveSelectOptions(key, def)
      const urlish = isUrlFieldKey(key)
      const format = String(def.format || '').toLowerCase()
      const treatAsEmail = format === 'email' && !urlish && /email|username|user/i.test(key)
      let inputType = 'text'
      if (props.secret) inputType = 'password'
      else if (treatAsEmail) inputType = 'email'
      let autocomplete = 'off'
      if (props.secret) autocomplete = 'new-password'
      let placeholder = ''
      if (props.secret) {
        placeholder = props.hasExistingSecrets ? 'Leave blank to keep existing' : ''
      }
      else if (urlish) {
        placeholder = 'https://…'
      }
      return {
        key,
        title,
        description: def.description || '',
        type,
        options,
        optionalSelect: Boolean(options?.length && !required.has(key)),
        required: required.has(key),
        multiline,
        secret: props.secret,
        inputType,
        autocomplete,
        inputName: `zorro-${props.secret ? 'secret' : 'cfg'}-${key}`,
        placeholder,
      }
    })
})

/**
 * @param {string} key
 * @param {Record<string, unknown>} def
 * @returns {Array<{ value: string, label: string }> | null}
 */
function resolveSelectOptions(key, def) {
  const fromEnum = Array.isArray(def.enum)
    ? def.enum.map((v) => {
      const value = String(v)
      const known = AWS_REGIONS.find((r) => r.value === value)
      return { value, label: known?.label || value }
    })
    : []
  const fromOneOf = Array.isArray(def.oneOf)
    ? def.oneOf
      .filter((item) => item && item.const != null)
      .map((item) => ({
        value: String(item.const),
        label: String(item.title || item.const),
      }))
    : []
  const listed = fromEnum.length ? fromEnum : fromOneOf
  if (listed.length) return listed
  if (isAwsRegionFieldKey(key)) return AWS_REGIONS
  return null
}

/**
 * @param {string} key
 * @param {unknown} value
 */
function setValue(key, value) {
  emit('update:modelValue', {
    ...model.value,
    [key]: value,
  })
}
</script>
