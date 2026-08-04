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
        v-else-if="field.enum?.length"
        :id="`schema-${field.key}`"
        class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)]"
        :value="model[field.key] ?? ''"
        @change="setValue(field.key, $event.target.value)"
      >
        <option value="" disabled>Select…</option>
        <option
          v-for="opt in field.enum"
          :key="opt"
          :value="opt"
        >
          {{ opt }}
        </option>
      </select>

      <textarea
        v-else-if="field.multiline"
        :id="`schema-${field.key}`"
        rows="6"
        class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-sm text-[var(--ink)]"
        :value="model[field.key] ?? ''"
        :placeholder="field.secret ? '••••••••' : ''"
        @input="setValue(field.key, $event.target.value)"
      />

      <input
        v-else-if="field.type === 'integer' || field.type === 'number'"
        :id="`schema-${field.key}`"
        type="number"
        class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)]"
        :value="model[field.key] ?? ''"
        @input="setValue(field.key, $event.target.value === '' ? null : Number($event.target.value))"
      >

      <input
        v-else
        :id="`schema-${field.key}`"
        :type="field.secret ? 'password' : 'text'"
        class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)]"
        :value="model[field.key] ?? ''"
        :placeholder="field.secret ? (hasExistingSecrets ? 'Leave blank to keep existing' : '') : ''"
        @input="setValue(field.key, $event.target.value)"
      >
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

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
      return {
        key,
        title,
        description: def.description || '',
        type,
        enum: Array.isArray(def.enum) ? def.enum : null,
        required: required.has(key),
        multiline,
        secret: props.secret,
      }
    })
})
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
