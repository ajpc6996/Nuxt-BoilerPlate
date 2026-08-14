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
        class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-sm text-[var(--ink)]"
        :value="model[field.key] ?? ''"
        :placeholder="field.secret ? '••••••••' : ''"
        @input="setValue(field.key, $event.target.value)"
      />

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
import { computed } from 'vue'
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
  omitKeys: {
    type: Array,
    default: () => [],
  },
})

const emit = defineEmits(['update:modelValue'])

const model = computed(() => props.modelValue || {})

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
