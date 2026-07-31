<template>
  <div class="app-data-grid w-full" :style="{ height }">
    <div
      v-if="statusMessage"
      class="mb-2 text-sm"
      :class="error ? 'text-[var(--danger)]' : 'text-[var(--mute)]'"
    >
      {{ statusMessage }}
    </div>

    <AgGridVue
      class="w-full"
      :style="{ height: '100%', width: '100%' }"
      :theme="resolvedTheme"
      :column-defs="columnDefs"
      :default-col-def="mergedDefaultColDef"
      :row-data="isLocal ? rowData : undefined"
      :row-model-type="rowModelType"
      :datasource="isLocal ? undefined : datasource || undefined"
      :cache-block-size="cacheBlockSize"
      :max-blocks-in-cache="maxBlocksInCache"
      :pagination="isLocal ? pagination : false"
      :pagination-page-size="paginationPageSize"
      :animate-rows="true"
      :get-row-id="isLocal ? getRowId : undefined"
      :context="mergedContext"
      :components="mergedComponents"
      :grid-options="safeGridOptions"
      @grid-ready="onGridReady"
      @cell-value-changed="onCellValueChanged"
    />
  </div>
</template>

<script setup>
import { AgGridVue } from 'ag-grid-vue3'
import GridEditButtonCell from '~/components/grid/GridEditButtonCell.vue'
import { agGridDarkTheme } from '~/utils/agGridDarkTheme'

const props = defineProps({
  /** AG Grid column definitions (supports custom cellRenderer / cellEditor). */
  columnDefs: {
    type: Array,
    required: true,
  },
  /**
   * Data adapter from createLocalDataAdapter() or createRestDataAdapter().
   */
  adapter: {
    type: Object,
    required: true,
  },
  defaultColDef: {
    type: Object,
    default: () => ({}),
  },
  /** Extra AG Grid grid options merged onto the component. */
  gridOptions: {
    type: Object,
    default: () => ({}),
  },
  /** Extra AG Grid context merged with built-in edit helpers. */
  context: {
    type: Object,
    default: () => ({}),
  },
  /** Extra Vue components for cell renderers/editors. */
  components: {
    type: Object,
    default: () => ({}),
  },
  height: {
    type: String,
    default: '480px',
  },
  theme: {
    type: Object,
    default: null,
  },
  pagination: {
    type: Boolean,
    default: false,
  },
  paginationPageSize: {
    type: Number,
    default: 20,
  },
  maxBlocksInCache: {
    type: Number,
    default: 10,
  },
})

const emit = defineEmits([
  'grid-ready',
  'edit-row',
  'cell-value-changed',
  'error',
  'loaded',
])

const gridApi = shallowRef(null)
const rowData = ref([])
const datasource = shallowRef(null)
const loading = ref(true)
const error = ref('')

const isLocal = computed(() => props.adapter?.mode === 'local')
const rowModelType = computed(() => (isLocal.value ? 'clientSide' : 'infinite'))
const cacheBlockSize = computed(() => props.adapter?.blockSize || 50)
const resolvedTheme = computed(() => props.theme || agGridDarkTheme)

const mergedDefaultColDef = computed(() => ({
  sortable: true,
  filter: true,
  resizable: true,
  flex: 1,
  minWidth: 120,
  ...props.defaultColDef,
}))

const mergedComponents = computed(() => ({
  GridEditButtonCell,
  ...(props.components || {}),
}))

const mergedContext = computed(() => ({
  ...(props.context || {}),
  onEditRow: (row) => {
    emit('edit-row', row)
    if (typeof props.context?.onEditRow === 'function') {
      props.context.onEditRow(row)
    }
  },
}))

/**
 * Pass as :grid-options (not v-bind) so nested on* handlers stay intact.
 */
const safeGridOptions = computed(() => {
  const options = { ...(props.gridOptions || {}) }
  delete options.getRowId
  delete options.context
  delete options.components
  return options
})

const statusMessage = computed(() => {
  if (error.value) return error.value
  if (loading.value) return 'Loading grid data…'
  return ''
})

/**
 * @param {{ data?: { id?: string|number } }} params
 */
const getRowId = (params) => {
  if (params?.data?.id == null) return undefined
  return String(params.data.id)
}

const onGridReady = (event) => {
  gridApi.value = event.api
  emit('grid-ready', event)

  if (!isLocal.value && datasource.value) {
    event.api.setGridOption('datasource', datasource.value)
  }

  requestAnimationFrame(() => {
    event.api.sizeColumnsToFit?.()
  })
}

const onCellValueChanged = (event) => {
  emit('cell-value-changed', event)
}

const loadFromAdapter = async () => {
  loading.value = true
  error.value = ''

  try {
    if (!props.adapter?.mode) {
      throw new Error('AppDataGrid requires a local or rest adapter')
    }

    if (props.adapter.mode === 'local') {
      const rows = await props.adapter.load()
      rowData.value = Array.isArray(rows) ? rows : []
      datasource.value = null
      emit('loaded', { mode: 'local', rowCount: rowData.value.length })
    } else if (props.adapter.mode === 'rest') {
      rowData.value = []
      datasource.value = props.adapter.createDatasource()
      if (gridApi.value) {
        gridApi.value.setGridOption('datasource', datasource.value)
      }
      emit('loaded', { mode: 'rest' })
    } else {
      throw new Error(`Unknown adapter mode: ${props.adapter.mode}`)
    }
  } catch (err) {
    error.value = err?.message || 'Failed to load grid data'
    emit('error', err)
  } finally {
    loading.value = false
  }
}

watch(
  () => props.adapter,
  () => {
    loadFromAdapter()
  },
  { immediate: true },
)

/**
 * @param {object} row
 * @returns {boolean}
 */
const applyRowUpdate = (row) => {
  if (isLocal.value && row?.id != null) {
    const index = rowData.value.findIndex((item) => item.id === row.id)
    if (index !== -1) {
      rowData.value[index] = { ...row }
    }
  }

  return applyGridRowUpdate(gridApi.value, row)
}

defineExpose({
  getApi: () => gridApi.value,
  reload: loadFromAdapter,
  applyRowUpdate,
})
</script>
