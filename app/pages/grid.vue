<template>
  <div class="mx-auto w-full max-w-6xl flex-1 px-6 py-12 lg:px-8">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="font-display text-3xl font-semibold tracking-tight text-[var(--ink)] sm:text-4xl">
          Data grid
        </h1>
        <p class="mt-2 max-w-2xl text-[var(--mute)]">
          AG Grid Community + OpenVue modal editor (VeeValidate) with REST save/reload.
        </p>
      </div>

      <div class="flex gap-2">
        <button
          type="button"
          class="rounded-md px-4 py-2 text-sm font-semibold transition-colors"
          :class="
            activeMode === 'local'
              ? 'btn-primary !px-4 !py-2'
              : 'btn-secondary !px-4 !py-2'
          "
          @click="activeMode = 'local'"
        >
          Local
        </button>
        <button
          type="button"
          class="rounded-md px-4 py-2 text-sm font-semibold transition-colors"
          :class="
            activeMode === 'rest'
              ? 'btn-primary !px-4 !py-2'
              : 'btn-secondary !px-4 !py-2'
          "
          @click="activeMode = 'rest'"
        >
          REST (lazy)
        </button>
      </div>
    </div>

    <div class="mt-6 flex flex-wrap items-end gap-3">
      <Button
        type="button"
        label="Edit selected row"
        severity="secondary"
        outlined
        @click="editSelectedRow"
      />

      <div class="flex items-end gap-2">
        <div class="flex flex-col gap-1">
          <label for="row-index" class="text-xs font-medium text-[var(--mute)]">
            Row index
          </label>
          <InputNumber
            input-id="row-index"
            v-model="rowIndexToEdit"
            :min="0"
            :use-grouping="false"
            class="w-28"
          />
        </div>
        <Button
          type="button"
          label="Edit by index"
          severity="secondary"
          outlined
          @click="editByIndex"
        />
      </div>

      <div class="flex items-end gap-2">
        <div class="flex flex-col gap-1">
          <label for="record-id" class="text-xs font-medium text-[var(--mute)]">
            Record id
          </label>
          <InputNumber
            input-id="record-id"
            v-model="recordIdToEdit"
            :min="1"
            :use-grouping="false"
            class="w-28"
          />
        </div>
        <Button
          type="button"
          label="Edit by id (REST)"
          @click="editById"
        />
      </div>
    </div>

    <p class="mt-4 text-sm text-[var(--mute)]">
      Click <strong class="text-[var(--ink)]">Edit</strong> in a row (Vue cell renderer), or use the toolbar actions above.
    </p>

    <p v-if="statusNote" class="mt-2 text-sm text-[var(--accent-ink)]">
      {{ statusNote }}
    </p>

    <div class="panel mt-4 h-[540px] overflow-hidden p-2">
      <AppDataGrid
        ref="gridRef"
        :key="activeMode"
        :column-defs="columnDefs"
        :adapter="activeAdapter"
        :default-col-def="defaultColDef"
        :grid-options="gridOptions"
        height="100%"
        :pagination="activeMode === 'local'"
        :pagination-page-size="10"
        @edit-row="openEditorForRow"
        @loaded="onGridLoaded"
        @error="onGridError"
      />
    </div>

    <ClientOnly>
      <AppGridRowEditor
        v-model:visible="editorVisible"
        :record="editingRecord"
        :loading-record="editorLoading"
        save-url="/api/grid/items"
        @saved="onEditorSaved"
        @error="onEditorError"
      />
    </ClientOnly>
  </div>
</template>

<script setup>
import Button from 'openvue/button'
import InputNumber from 'openvue/inputnumber'
import GridEditButtonCell from '~/components/grid/GridEditButtonCell.vue'

definePageMeta({
  layout: 'plain',
})

useHead({
  title: 'Data Grid',
})

const activeMode = ref('rest')
const gridRef = ref(null)
const rowIndexToEdit = ref(0)
const recordIdToEdit = ref(1)
const statusNote = ref('Mock API ready: GET/PUT /api/grid/items')
const localRows = ref([])

const editorVisible = ref(false)
const editorLoading = ref(false)
const editingRecord = ref(null)

/**
 * Escape text used inside HTML cell renderers.
 * @param {unknown} value
 */
const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')

/**
 * Custom status pill — HTML renderer (no Vue runtime template compiler).
 * @param {object} params
 */
const statusCellRenderer = (params) => {
  const value = params.value || ''
  // Dark Theme status pills (Sintrex Dark surfaces)
  let background = 'rgba(155, 167, 181, 0.16)'
  let color = '#9aa7b5'

  if (value === 'Active') {
    background = 'rgba(22, 163, 74, 0.18)'
    color = '#86efac'
  } else if (value === 'Paused') {
    background = 'rgba(240, 160, 96, 0.18)'
    color = '#f0a060'
  } else if (value === 'Done') {
    background = 'rgba(0, 194, 199, 0.16)'
    color = '#7eeaee'
  }

  return `
    <span style="display:inline-flex;border-radius:6px;padding:2px 8px;font-size:12px;font-weight:600;background:${background};color:${color};">
      ${escapeHtml(value)}
    </span>
  `
}

/**
 * @param {object|null|undefined} row
 */
const openEditorForRow = (row) => {
  if (!row?.id) {
    statusNote.value = 'Cannot edit this row — missing id.'
    return
  }

  editorLoading.value = false
  editingRecord.value = { ...row }
  editorVisible.value = true
  statusNote.value = `Editing item #${row.id}`
}

const columnDefs = [
  {
    headerName: 'Actions',
    colId: 'actions',
    maxWidth: 110,
    minWidth: 90,
    flex: 0,
    sortable: false,
    filter: false,
    editable: false,
    suppressNavigable: true,
    cellRenderer: GridEditButtonCell,
  },
  { field: 'id', headerName: 'ID', maxWidth: 100, editable: false },
  { field: 'name', headerName: 'Name' },
  { field: 'department', headerName: 'Department' },
  {
    field: 'status',
    headerName: 'Status',
    cellRenderer: statusCellRenderer,
  },
  {
    field: 'amount',
    headerName: 'Amount',
    valueFormatter: (params) =>
      params.value == null ? '' : `$${Number(params.value).toLocaleString()}`,
  },
]

const defaultColDef = {
  editable: false,
}

const gridOptions = {
  rowSelection: {
    mode: 'singleRow',
    checkboxes: false,
    enableClickSelection: true,
  },
}

const localAdapter = createLocalDataAdapter(async () => {
  const response = await $fetch('/api/grid/items', {
    query: {
      startRow: 0,
      endRow: 40,
    },
  })

  localRows.value = response.rows || []
  return localRows.value
})

const restAdapter = createRestDataAdapter({
  url: '/api/grid/items',
  blockSize: 40,
})

const activeAdapter = computed(() =>
  activeMode.value === 'local' ? localAdapter : restAdapter,
)

const onGridLoaded = (payload) => {
  if (payload?.mode === 'local') {
    statusNote.value = `Loaded ${payload.rowCount} local rows from mock API.`
  } else {
    statusNote.value = 'REST datasource ready — click Edit on a row to open the modal.'
  }
}

const onGridError = (error) => {
  statusNote.value = error?.message || 'Grid failed to load data.'
}

const editSelectedRow = () => {
  const api = gridRef.value?.getApi?.()
  const selected = api?.getSelectedRows?.() || []

  if (!selected.length) {
    statusNote.value = 'Select a row first, then click Edit selected row.'
    return
  }

  openEditorForRow(selected[0])
}

const editByIndex = () => {
  const api = gridRef.value?.getApi?.()
  if (!api) {
    statusNote.value = 'Grid is not ready yet.'
    return
  }

  const node = api.getDisplayedRowAtIndex?.(Number(rowIndexToEdit.value ?? 0))
  openEditorForRow(node?.data)
}

const editById = async () => {
  if (!recordIdToEdit.value) {
    statusNote.value = 'Enter a record id to load from the API.'
    return
  }

  editorVisible.value = true
  editorLoading.value = true
  editingRecord.value = { id: recordIdToEdit.value }
  statusNote.value = `Loading item #${recordIdToEdit.value}…`

  try {
    const row = await $fetch(`/api/grid/items/${recordIdToEdit.value}`)
    editingRecord.value = row
    statusNote.value = `Editing item #${row.id}`
  } catch (error) {
    editorVisible.value = false
    editingRecord.value = null
    statusNote.value = error?.data?.statusMessage || error?.message || 'Failed to load record.'
  } finally {
    editorLoading.value = false
  }
}

/**
 * @param {object} saved
 */
const onEditorSaved = (saved) => {
  const index = localRows.value.findIndex((row) => row.id === saved.id)
  if (index !== -1) {
    localRows.value[index] = { ...saved }
  }

  const updated = gridRef.value?.applyRowUpdate?.(saved)
  editingRecord.value = null
  statusNote.value = updated
    ? `Saved item #${saved.id} and updated the grid row.`
    : `Saved item #${saved.id}. Reload the grid if the row is not currently loaded.`
}

const onEditorError = (error) => {
  statusNote.value = error?.data?.statusMessage || error?.message || 'Editor request failed.'
}
</script>
