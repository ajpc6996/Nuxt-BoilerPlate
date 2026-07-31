<template>
  <Dialog
    :visible="visible"
    modal
    append-to="body"
    class="app-grid-row-editor"
    :base-z-index="2000"
    :style="{ width: 'min(480px, 92vw)' }"
    :header="modalTitle"
    :closable="true"
    :dismissable-mask="true"
    @update:visible="onVisibleUpdate"
    @hide="onHide"
  >
    <div v-if="!record" class="py-4 text-sm text-[var(--mute)]">
      No record selected.
    </div>

    <div v-else-if="loadingRecord" class="py-4 text-sm text-[var(--mute)]">
      Loading record…
    </div>

    <form
      v-else
      class="flex flex-col gap-5 pt-1"
      @submit.prevent="onSubmit"
    >
      <div class="text-sm text-[var(--mute)]">
        Editing record
        <span class="font-semibold text-[var(--ink)]">#{{ record.id }}</span>
      </div>

      <div class="flex flex-col gap-2">
        <label for="grid-edit-name" class="text-sm font-medium text-[var(--ink)]">Name</label>
        <InputText
          id="grid-edit-name"
          class="w-full"
          v-model="name"
          :invalid="!!errors.name"
        />
        <small class="text-[var(--danger)]">{{ errors.name }}</small>
      </div>

      <div class="flex flex-col gap-2">
        <label for="grid-edit-department" class="text-sm font-medium text-[var(--ink)]">Department</label>
        <Select
          input-id="grid-edit-department"
          class="w-full"
          v-model="department"
          :options="departmentOptions"
          :invalid="!!errors.department"
          placeholder="Select department"
        />
        <small class="text-[var(--danger)]">{{ errors.department }}</small>
      </div>

      <div class="flex flex-col gap-2">
        <label for="grid-edit-status" class="text-sm font-medium text-[var(--ink)]">Status</label>
        <Select
          input-id="grid-edit-status"
          class="w-full"
          v-model="status"
          :options="statusOptions"
          :invalid="!!errors.status"
          placeholder="Select status"
        />
        <small class="text-[var(--danger)]">{{ errors.status }}</small>
      </div>

      <div class="flex flex-col gap-2">
        <label for="grid-edit-amount" class="text-sm font-medium text-[var(--ink)]">Amount</label>
        <InputNumber
          input-id="grid-edit-amount"
          class="w-full"
          v-model="amount"
          :invalid="!!errors.amount"
          :min="0"
          :use-grouping="true"
        />
        <small class="text-[var(--danger)]">{{ errors.amount }}</small>
      </div>

      <Message v-if="submitError" severity="error" class="w-full">
        {{ submitError }}
      </Message>

      <div class="mt-2 flex items-center justify-end gap-2">
        <Button
          type="button"
          label="Cancel"
          severity="secondary"
          outlined
          :disabled="saving"
          @click="close"
        />
        <Button
          type="submit"
          label="Save"
          :loading="saving"
        />
      </div>
    </form>
  </Dialog>
</template>

<script setup>
import Dialog from 'openvue/dialog'
import InputText from 'openvue/inputtext'
import InputNumber from 'openvue/inputnumber'
import Select from 'openvue/select'
import Button from 'openvue/button'
import Message from 'openvue/message'
import { toTypedSchema } from '@vee-validate/yup'
import { useForm } from 'vee-validate'
import * as yup from 'yup'

const props = defineProps({
  /** Controls modal visibility (use with v-model:visible). */
  visible: {
    type: Boolean,
    default: false,
  },
  /** Row currently being edited. */
  record: {
    type: Object,
    default: null,
  },
  /** When true, shows a loading state inside the modal. */
  loadingRecord: {
    type: Boolean,
    default: false,
  },
  /** REST endpoint used as `${saveUrl}/${id}` for PUT. */
  saveUrl: {
    type: String,
    default: '/api/grid/items',
  },
  departmentOptions: {
    type: Array,
    default: () => ['Design', 'Engineering', 'Ops', 'Sales'],
  },
  statusOptions: {
    type: Array,
    default: () => ['Active', 'Paused', 'Done'],
  },
})

const emit = defineEmits(['update:visible', 'saved', 'error', 'close'])

const saving = ref(false)
const submitError = ref('')

const schema = toTypedSchema(
  yup.object({
    name: yup.string().trim().required('Name is required').min(2, 'Use at least 2 characters'),
    department: yup.string().required('Department is required'),
    status: yup.string().required('Status is required'),
    amount: yup
      .number()
      .typeError('Amount must be a number')
      .required('Amount is required')
      .min(0, 'Amount cannot be negative'),
  }),
)

const { errors, defineField, handleSubmit, resetForm } = useForm({
  validationSchema: schema,
  initialValues: {
    name: '',
    department: null,
    status: null,
    amount: null,
  },
})

const [name] = defineField('name')
const [department] = defineField('department')
const [status] = defineField('status')
const [amount] = defineField('amount')

const modalTitle = computed(() =>
  props.record?.id != null ? `Edit item #${props.record.id}` : 'Edit item',
)

/**
 * Sync form values whenever the modal opens with a record.
 */
watch(
  () => [props.visible, props.record, props.loadingRecord],
  ([isVisible, record, isLoading]) => {
    if (!isVisible || !record || isLoading) return

    submitError.value = ''
    resetForm({
      values: {
        name: record.name ?? '',
        department: record.department ?? null,
        status: record.status ?? null,
        amount: record.amount ?? null,
      },
    })
  },
  { immediate: true },
)

/**
 * @param {boolean} value
 */
const onVisibleUpdate = (value) => {
  emit('update:visible', value)
}

const close = () => {
  emit('update:visible', false)
}

const onHide = () => {
  emit('update:visible', false)
  emit('close')
}

const onSubmit = handleSubmit(async (values) => {
  if (!props.record?.id) return

  saving.value = true
  submitError.value = ''

  try {
    const saved = await $fetch(`${props.saveUrl}/${props.record.id}`, {
      method: 'PUT',
      body: {
        name: values.name,
        department: values.department,
        status: values.status,
        amount: values.amount,
      },
    })

    emit('saved', saved)
    emit('update:visible', false)
  } catch (error) {
    submitError.value = error?.data?.statusMessage || error?.message || 'Failed to save record'
    emit('error', error)
  } finally {
    saving.value = false
  }
})
</script>
