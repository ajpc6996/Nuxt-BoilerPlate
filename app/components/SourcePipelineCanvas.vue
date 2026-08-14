<template>
  <div class="flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-[var(--border)]">
    <div class="shrink-0 border-b border-[var(--border)] bg-[var(--surface)] px-3 py-2">
      <div class="flex flex-wrap items-center gap-2">
        <div class="flex flex-wrap items-center gap-1">
          <button
            v-for="cat in paletteCategories"
            :key="cat.id"
            type="button"
            class="rounded-md px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors"
            :class="paletteCategory === cat.id
              ? 'bg-[var(--accent-soft)] text-[var(--accent-ink)]'
              : 'text-[var(--mute)] hover:bg-[var(--surface-raised)] hover:text-[var(--ink)]'"
            @click="paletteCategory = cat.id"
          >
            {{ cat.label }}
          </button>
        </div>

        <button
          v-if="selectedEdgeId"
          type="button"
          class="rounded-md border border-[var(--danger)] px-3 py-1.5 text-xs text-[var(--danger)]"
          @click="removeSelectedEdge"
        >
          Remove link
        </button>

        <div class="ml-auto flex flex-wrap items-center gap-3">
          <p
            v-if="isLayoutLocked"
            class="text-xs text-[var(--mute)]"
          >
            Layout is locked
          </p>
          <button
            type="button"
            class="rounded-md border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-1.5 text-sm text-[var(--ink)] hover:border-[var(--accent)]"
            @click="toggleLayoutLock"
          >
            {{ isLayoutLocked ? 'Unlock layout' : 'Lock layout' }}
          </button>
          <button
            type="button"
            class="rounded-md border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-1.5 text-sm text-[var(--ink)] hover:border-[var(--accent)]"
            :class="isLayoutLocked ? 'opacity-60' : ''"
            :title="isLayoutLocked ? 'Layout is locked — unlock to rearrange' : 'Rearrange nodes automatically'"
            @click="autoLayout"
          >
            Auto layout
          </button>
          <label class="flex items-center gap-2 text-xs text-[var(--ink)]">
            <input
              v-model="debugEnabled"
              type="checkbox"
              class="h-3.5 w-3.5 accent-[var(--accent)]"
            >
            Detailed debugging
          </label>
        </div>
      </div>

      <div class="mt-2 flex flex-wrap items-center gap-2 border-t border-[var(--border-soft)] pt-2">
        <template v-if="paletteCategory === 'sources'">
          <button
            type="button"
            class="rounded-md border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-1.5 text-sm text-[var(--ink)] hover:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40"
            :disabled="!isMergeCanvas"
            :title="isMergeCanvas ? 'Fetch an existing source' : 'Fetch is available on Merge sources'"
            draggable="true"
            @dragstart="onPaletteDrag($event, 'fetch')"
            @click="isMergeCanvas && addFetchNode()"
          >
            + Fetch
          </button>
          <button
            type="button"
            class="rounded-md border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-1.5 text-sm text-[var(--ink)] hover:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40"
            :disabled="!isMergeCanvas"
            :title="isMergeCanvas ? 'Join two inbound inputs' : 'Merge is available on Merge sources'"
            draggable="true"
            @dragstart="onPaletteDrag($event, 'merge')"
            @click="isMergeCanvas && addMergeNode()"
          >
            + Merge
          </button>
          <p
            v-if="!isMergeCanvas"
            class="text-[10px] text-[var(--mute-soft)]"
          >
            Fetch / Merge need a Merge source template
          </p>
        </template>

        <template v-else-if="paletteCategory === 'operators'">
          <button
            type="button"
            class="rounded-md border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-1.5 text-sm text-[var(--ink)] hover:border-[var(--accent)]"
            draggable="true"
            @dragstart="onPaletteDrag($event, 'filter')"
            @click="addFilterNode()"
          >
            + Filter
          </button>
          <button
            type="button"
            class="rounded-md border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-1.5 text-sm text-[var(--ink)] hover:border-[var(--accent)]"
            draggable="true"
            @dragstart="onPaletteDrag($event, 'transform')"
            @click="addTransformNode()"
          >
            + Transform
          </button>
        </template>

        <template v-else-if="paletteCategory === 'storage'">
          <button
            type="button"
            class="rounded-md border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-1.5 text-sm text-[var(--ink)] hover:border-[var(--accent)]"
            draggable="true"
            @dragstart="onPaletteDrag($event, 'ingest')"
            @click="addIngestNode()"
          >
            + Ingest
          </button>
          <button
            type="button"
            class="rounded-md border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-1.5 text-sm text-[var(--ink)] hover:border-[var(--accent)]"
            draggable="true"
            @dragstart="onPaletteDrag($event, 'export')"
            @click="addExportNode()"
          >
            + Export
          </button>
        </template>

        <template v-else-if="paletteCategory === 'actions'">
          <p class="text-xs text-[var(--mute-soft)]">
            Actions — coming soon
          </p>
        </template>
      </div>
    </div>

    <div class="relative flex min-h-0 flex-1">
      <div
        class="relative min-w-0 flex-1 bg-[var(--surface)]"
        @dragover.prevent
        @drop.prevent="onCanvasDrop"
      >
        <VueFlow
          id="source-pipeline-canvas"
          v-model:nodes="nodes"
          v-model:edges="edges"
          :node-types="nodeTypes"
          :default-edge-options="defaultEdgeOptions"
          :default-viewport="defaultViewport"
          :min-zoom="0.2"
          :max-zoom="2"
          :nodes-connectable="!isLayoutLocked"
          :nodes-draggable="!isLayoutLocked"
          :elements-selectable="!isLayoutLocked"
          :edges-updatable="!isLayoutLocked"
          :delete-key-code="['Backspace', 'Delete']"
          :connection-mode="ConnectionMode.Loose"
          :is-valid-connection="isValidConnection"
          :fit-view-on-init="false"
          class="source-pipeline-flow h-full w-full"
          @init="onFlowInit"
          @nodes-initialized="onNodesInitialized"
          @connect="onConnect"
          @nodes-change="onNodesChange"
          @edges-change="onEdgesChange"
          @node-double-click="onNodeDoubleClick"
          @edge-click="onEdgeClick"
          @pane-click="onPaneClick"
        >
          <Background
            :gap="20"
            :size="1"
            pattern-color="rgba(255,255,255,0.06)"
          />
          <Controls @interaction-change="onControlsInteractionChange" />
          <MiniMap
            pannable
            zoomable
            :mask-color="'rgba(0,0,0,0.45)'"
          />
        </VueFlow>
      </div>

      <aside
        v-if="configOpen && selectedNode"
        class="absolute inset-y-0 right-0 z-20 flex w-full max-w-md flex-col border-l border-[var(--border)] bg-[var(--surface-raised)] shadow-xl sm:w-[28rem]"
      >
        <div class="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <h3 class="text-sm font-semibold text-[var(--ink)]">
            {{ configTitle }}
          </h3>
          <button
            type="button"
            class="text-sm text-[var(--mute)] hover:text-[var(--ink)]"
            @click="closeConfig"
          >
            Close
          </button>
        </div>
        <div class="flex-1 overflow-y-auto p-4">
          <slot
            name="node-config"
            :node="selectedNode"
            :close="closeConfig"
            :update-filter="patchSelectedOperator"
            :remove-filter="removeSelectedOperator"
            :update-transform="patchSelectedOperator"
            :remove-transform="removeSelectedOperator"
            :update-fetch="patchSelectedOperator"
            :remove-fetch="removeSelectedOperator"
            :update-merge="patchSelectedOperator"
            :remove-merge="removeSelectedOperator"
            :update-ingest="patchSelectedOperator"
            :remove-ingest="removeSelectedOperator"
            :update-export="patchSelectedOperator"
            :remove-export="removeSelectedOperator"
          />
        </div>
      </aside>
    </div>
  </div>
</template>

<script setup>
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'
import {
  VueFlow,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  ConnectionMode,
  MarkerType,
  useVueFlow,
} from '@vue-flow/core'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/controls/dist/style.css'
import '@vue-flow/minimap/dist/style.css'

import {
  createDefaultPipeline,
  isMergePipeline,
  normalizePipeline,
} from '~~/shared/pipelineDefaults.js'
import { layoutPipelineNodes } from '~~/shared/pipelineLayout.js'
import RetrieveNode from '~/components/pipeline/RetrieveNode.vue'
import FetchNode from '~/components/pipeline/FetchNode.vue'
import MergeNode from '~/components/pipeline/MergeNode.vue'
import FilterNode from '~/components/pipeline/FilterNode.vue'
import TransformNode from '~/components/pipeline/TransformNode.vue'
import IngestNode from '~/components/pipeline/IngestNode.vue'
import ExportNode from '~/components/pipeline/ExportNode.vue'

const FLOW_ID = 'source-pipeline-canvas'
/** Default zoom is 75% of Vue Flow's usual 1.0. */
const DEFAULT_ZOOM = 0.75
const defaultViewport = { x: 0, y: 0, zoom: DEFAULT_ZOOM }

/** @type {null | ((opts?: Record<string, unknown>) => void)} */
let fitViewFn = null

const { setInteractive } = useVueFlow({ id: FLOW_ID })

const props = defineProps({
  modelValue: {
    type: Object,
    default: () => createDefaultPipeline(),
  },
  destinationTable: {
    type: String,
    default: '',
  },
  /** When true (e.g. test/run busy), layout stays locked regardless of toggle. */
  locked: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['update:modelValue', 'edit-node'])

const { alert: appAlert } = useAppConfirm()

const nodeTypes = {
  retrieve: markRaw(RetrieveNode),
  fetch: markRaw(FetchNode),
  merge: markRaw(MergeNode),
  filter: markRaw(FilterNode),
  transform: markRaw(TransformNode),
  ingest: markRaw(IngestNode),
  export: markRaw(ExportNode),
}

const defaultEdgeOptions = {
  animated: true,
  selectable: true,
  updatable: true,
  style: { stroke: 'var(--accent)', strokeWidth: 2.5 },
  markerEnd: {
    type: MarkerType.ArrowClosed,
    color: 'var(--accent)',
  },
}

const nodes = ref([])
const edges = ref([])
const selectedNodeId = ref(null)
const selectedEdgeId = ref(null)
const configOpen = ref(false)
const syncing = ref(false)
const paletteCategory = ref('operators')
const paletteCategories = [
  { id: 'sources', label: 'Data sources' },
  { id: 'operators', label: 'Operators' },
  { id: 'storage', label: 'Storage' },
  { id: 'actions', label: 'Actions' },
]
/** User toggle — starts locked so positions are not rearranged by accident. */
const layoutLocked = ref(true)
let lastEmitted = ''
let lastPipelineKind = ''
/** Avoid feedback loops between Controls setInteractive and our lock state. */
let syncingInteractive = false

const selectedNode = computed(() =>
  nodes.value.find((n) => n.id === selectedNodeId.value) || null,
)

const isMergeCanvas = computed(() => isMergePipeline({ nodes: nodes.value }))

const isLayoutLocked = computed(() => Boolean(props.locked) || layoutLocked.value)

watch(
  isLayoutLocked,
  (locked) => {
    syncingInteractive = true
    try {
      setInteractive(!locked)
    }
    catch {
      // Vue Flow store may not be ready before first mount
    }
    nextTick(() => {
      syncingInteractive = false
    })
  },
  { immediate: true },
)

const configTitle = computed(() => {
  const t = selectedNode.value?.type
  if (t === 'retrieve') return 'Retrieve'
  if (t === 'fetch') return 'Fetch'
  if (t === 'merge') return 'Merge'
  if (t === 'filter') return 'Filter'
  if (t === 'transform') return 'Transform'
  if (t === 'ingest') return 'Ingest'
  if (t === 'export') return 'Export / Temp Stage'
  return 'Configure'
})

const debugEnabled = computed({
  get: () => Boolean(props.modelValue?.debug),
  set: (v) => emitPipeline({ debug: Boolean(v) }),
})

function pipelineSnapshot(nodesList, edgesList, debug) {
  return JSON.stringify({
    version: 1,
    debug: Boolean(debug),
    nodes: (nodesList || []).map((n) => ({
      id: n.id,
      type: n.type,
      position: { x: n.position?.x || 0, y: n.position?.y || 0 },
      data: { ...(n.data || {}) },
    })),
    edges: (edgesList || []).map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle || null,
      targetHandle: e.targetHandle || null,
    })),
  })
}

function applyFromProps(val) {
  const p = normalizePipeline(val)
  const snap = pipelineSnapshot(p.nodes, p.edges, p.debug)
  if (snap === lastEmitted) return
  nodes.value = p.nodes.map((n) => ({
    ...n,
    connectable: true,
    data: {
      ...n.data,
      destinationTable: props.destinationTable,
    },
  }))
  edges.value = p.edges.map((e) => ({
    ...e,
    selectable: true,
    updatable: true,
  }))
  lastEmitted = snap
}

watch(
  () => props.modelValue,
  (val) => {
    if (syncing.value) return
    applyFromProps(val)
    const kind = isMergePipeline(val) ? 'merge' : 'retrieve'
    if (kind !== lastPipelineKind) {
      lastPipelineKind = kind
      paletteCategory.value = kind === 'merge' ? 'sources' : 'operators'
    }
  },
  { immediate: true, deep: true },
)

watch(
  () => props.destinationTable,
  (t) => {
    nodes.value = nodes.value.map((n) => {
      if (n.type !== 'ingest') return n
      return { ...n, data: { ...n.data, destinationTable: t } }
    })
  },
)

function emitPipeline(partial = {}) {
  const payload = {
    version: 1,
    kind: isMergePipeline({ nodes: nodes.value }) ? 'merge' : 'retrieve',
    debug: partial.debug != null ? partial.debug : Boolean(props.modelValue?.debug),
    nodes: nodes.value.map((n) => ({
      id: n.id,
      type: n.type,
      position: { ...n.position },
      data: { ...(n.data || {}) },
    })),
    edges: edges.value.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle || null,
      targetHandle: e.targetHandle || null,
    })),
  }
  lastEmitted = pipelineSnapshot(payload.nodes, payload.edges, payload.debug)
  syncing.value = true
  emit('update:modelValue', payload)
  nextTick(() => {
    syncing.value = false
  })
}

/**
 * @param {import('@vue-flow/core').NodeChange[]} changes
 */
function onNodesChange(changes) {
  // While locked, ignore drag/position updates so layout cannot shift.
  const nextChanges = isLayoutLocked.value
    ? changes.filter((c) => c.type !== 'position')
    : changes
  if (!nextChanges.length) return

  nodes.value = applyNodeChanges(nextChanges, nodes.value)
  const meaningful = nextChanges.some((c) =>
    c.type === 'position' || c.type === 'remove' || c.type === 'add' || c.type === 'dimensions',
  )
  // Only persist after drag end / structural change
  const persist = nextChanges.some((c) =>
    c.type === 'remove'
    || c.type === 'add'
    || (c.type === 'position' && c.dragging === false),
  )
  if (persist || (meaningful && nextChanges.some((c) => c.type === 'remove'))) {
    emitPipeline()
  }
}

/**
 * @param {import('@vue-flow/core').EdgeChange[]} changes
 */
function onEdgesChange(changes) {
  edges.value = applyEdgeChanges(changes, edges.value)
  if (changes.some((c) => c.type === 'remove' || c.type === 'add' || c.type === 'select')) {
    const removed = changes.some((c) => c.type === 'remove' && c.id === selectedEdgeId.value)
    if (removed) selectedEdgeId.value = null
    if (changes.some((c) => c.type === 'remove' || c.type === 'add')) {
      emitPipeline()
    }
  }
}

/**
 * @param {import('@vue-flow/core').Connection} connection
 */
function isValidConnection(connection) {
  if (!connection.source || !connection.target) return false
  if (connection.source === connection.target) return false
  const sourceNode = nodes.value.find((n) => n.id === connection.source)
  const targetNode = nodes.value.find((n) => n.id === connection.target)
  if (!sourceNode || !targetNode) return false
  if (sourceNode.type === 'ingest' || sourceNode.type === 'export') return false
  if (targetNode.type === 'retrieve' || targetNode.type === 'fetch') return false
  return true
}

/**
 * @param {import('@vue-flow/core').Connection} params
 */
function onConnect(params) {
  if (!isValidConnection(params)) return

  const targetType = nodes.value.find((n) => n.id === params.target)?.type
  let next = [...edges.value]
  // Mid-chain / Ingest accept a single inbound edge
  if (targetType === 'filter' || targetType === 'transform' || targetType === 'ingest' || targetType === 'export') {
    next = next.filter((e) => e.target !== params.target)
  }
  // Merge accepts exactly two inbound edges
  if (targetType === 'merge') {
    const into = next.filter((e) => e.target === params.target && e.source !== params.source)
    if (into.length >= 2) {
      next = next.filter((e) => e.id !== into[0].id)
    }
  }

  next = addEdge({
    ...params,
    id: `e-${params.source}-${params.target}-${Date.now()}`,
    sourceHandle: params.sourceHandle || 'out',
    targetHandle: params.targetHandle || 'in',
    selectable: true,
    updatable: true,
  }, next)

  edges.value = next
  selectedEdgeId.value = null
  emitPipeline()
}

/**
 * @param {{ node: { id: string, type: string } }} evt
 */
function onNodeDoubleClick(evt) {
  selectedNodeId.value = evt.node.id
  selectedEdgeId.value = null
  configOpen.value = true
  emit('edit-node', evt.node)
}

/**
 * @param {{ edge: { id: string } }} evt
 */
function onEdgeClick(evt) {
  selectedEdgeId.value = evt.edge.id
  selectedNodeId.value = null
  configOpen.value = false
  edges.value = edges.value.map((e) => ({
    ...e,
    selected: e.id === evt.edge.id,
  }))
}

function onPaneClick() {
  selectedEdgeId.value = null
  // keep config open until Close — only clear edge selection
  edges.value = edges.value.map((e) => ({ ...e, selected: false }))
}

function closeConfig() {
  configOpen.value = false
  selectedNodeId.value = null
}

function removeSelectedEdge() {
  if (!selectedEdgeId.value) return
  edges.value = edges.value.filter((e) => e.id !== selectedEdgeId.value)
  selectedEdgeId.value = null
  emitPipeline()
}

/**
 * @param {DragEvent} event
 * @param {string} type
 */
function onPaletteDrag(event, type) {
  if ((type === 'fetch' || type === 'merge') && !isMergeCanvas.value) {
    event.preventDefault()
    return
  }
  event.dataTransfer?.setData('application/pipeline-node', type)
  event.dataTransfer.effectAllowed = 'move'
}

/**
 * Default X column per node type (vertical lanes).
 * @type {Record<string, number>}
 */
const TYPE_COLUMN_X = {
  retrieve: 40,
  fetch: 40,
  merge: 320,
  filter: 280,
  transform: 400,
  ingest: 600,
  export: 600,
}

const TYPE_STACK_GAP = 120

/**
 * Place a new node in the same vertical column as existing nodes of that type,
 * just below the lowest one. If none exist, use the type’s default column
 * (and optional drop/fallback coordinates for Y).
 *
 * @param {string} type
 * @param {{ x?: number, y?: number } | null} [fallback]
 * @returns {{ x: number, y: number }}
 */
function nextPositionForType(type, fallback = null) {
  const same = nodes.value.filter((n) => n.type === type)
  if (same.length) {
    const lowest = same.reduce((a, b) =>
      (Number(b.position?.y) || 0) > (Number(a.position?.y) || 0) ? b : a,
    )
    return {
      x: Number(lowest.position?.x) || TYPE_COLUMN_X[type] || 40,
      y: (Number(lowest.position?.y) || 0) + TYPE_STACK_GAP,
    }
  }

  const defaultX = TYPE_COLUMN_X[type] ?? 40
  const hasFallback = fallback && typeof fallback.x === 'number' && typeof fallback.y === 'number'
  return {
    // Prefer the type lane even on first drop so columns stay consistent
    x: defaultX,
    y: hasFallback ? Math.max(40, fallback.y) : 80,
  }
}

/**
 * @param {{ x?: number, y?: number }} [position]
 */
function addFilterNode(position) {
  const id = `filter_${Date.now().toString(36)}`
  const pos = nextPositionForType('filter', position || null)
  nodes.value = [
    ...nodes.value,
    {
      id,
      type: 'filter',
      position: pos,
      connectable: true,
      data: { label: 'Filter', select: [], where: [] },
    },
  ]
  selectedNodeId.value = id
  configOpen.value = true
  emitPipeline()
}

/**
 * @param {{ x?: number, y?: number }} [position]
 */
function addTransformNode(position) {
  const id = `transform_${Date.now().toString(36)}`
  const pos = nextPositionForType('transform', position || null)
  nodes.value = [
    ...nodes.value,
    {
      id,
      type: 'transform',
      position: pos,
      connectable: true,
      data: { label: 'Transform', actions: [] },
    },
  ]
  selectedNodeId.value = id
  configOpen.value = true
  emitPipeline()
}

/**
 * @param {{ x?: number, y?: number }} [position]
 */
function addFetchNode(position) {
  const id = `fetch_${Date.now().toString(36)}`
  const pos = nextPositionForType('fetch', position || null)
  nodes.value = [
    ...nodes.value,
    {
      id,
      type: 'fetch',
      position: pos,
      connectable: true,
      data: { label: 'Fetch', sourceId: '', mode: 'last_ingest' },
    },
  ]
  selectedNodeId.value = id
  configOpen.value = true
  emitPipeline()
}

/**
 * @param {{ x?: number, y?: number }} [position]
 */
function addMergeNode(position) {
  const id = `merge_${Date.now().toString(36)}`
  const pos = nextPositionForType('merge', position || null)
  nodes.value = [
    ...nodes.value,
    {
      id,
      type: 'merge',
      position: pos,
      connectable: true,
      data: {
        label: 'Merge',
        keys: [{ left: '', right: '' }],
        leftPrefix: 'a_',
        rightPrefix: 'b_',
      },
    },
  ]
  selectedNodeId.value = id
  configOpen.value = true
  emitPipeline()
}

/**
 * @param {{ x?: number, y?: number }} [position]
 */
function addIngestNode(position) {
  const id = `ingest_${Date.now().toString(36)}`
  const count = nodes.value.filter((n) => n.type === 'ingest').length
  const pos = nextPositionForType('ingest', position || null)
  nodes.value = [
    ...nodes.value,
    {
      id,
      type: 'ingest',
      position: pos,
      connectable: true,
      data: {
        label: count ? `Ingest ${count + 1}` : 'Ingest',
        destinationTable: props.destinationTable,
        writeMode: 'replace',
        retentionDays: 7,
      },
    },
  ]
  selectedNodeId.value = id
  configOpen.value = true
  emit('edit-node', { id, type: 'ingest' })
  emitPipeline()
}

/**
 * @param {{ x?: number, y?: number }} [position]
 */
function addExportNode(position) {
  const id = `export_${Date.now().toString(36)}`
  const count = nodes.value.filter((n) => n.type === 'export').length
  const pos = nextPositionForType('export', position || null)
  nodes.value = [
    ...nodes.value,
    {
      id,
      type: 'export',
      position: pos,
      connectable: true,
      data: {
        label: count ? `Export ${count + 1}` : 'Export',
        useTempStage: true,
      },
    },
  ]
  selectedNodeId.value = id
  configOpen.value = true
  emit('edit-node', { id, type: 'export' })
  emitPipeline()
}

/**
 * @param {DragEvent} event
 */
function onCanvasDrop(event) {
  const type = event.dataTransfer?.getData('application/pipeline-node')
  const allowed = new Set(['filter', 'transform', 'fetch', 'merge', 'ingest', 'export'])
  if (!allowed.has(type)) return
  if ((type === 'fetch' || type === 'merge') && !isMergeCanvas.value) return
  const bounds = event.currentTarget.getBoundingClientRect()
  // Drop coords are a Y fallback only when no same-type node exists yet;
  // nextPositionForType snaps to the type’s vertical column when stacking.
  const pos = {
    x: Math.max(40, event.clientX - bounds.left - 80),
    y: Math.max(40, event.clientY - bounds.top - 30),
  }
  if (type === 'transform') addTransformNode(pos)
  else if (type === 'fetch') addFetchNode(pos)
  else if (type === 'merge') addMergeNode(pos)
  else if (type === 'ingest') addIngestNode(pos)
  else if (type === 'export') addExportNode(pos)
  else addFilterNode(pos)
}

/**
 * @param {Record<string, unknown>} data
 */
function patchSelectedOperator(data) {
  if (!selectedNodeId.value) return
  nodes.value = nodes.value.map((n) => {
    if (n.id !== selectedNodeId.value) return n
    return { ...n, data: { ...data } }
  })
  emitPipeline()
}

function removeSelectedOperator() {
  const id = selectedNodeId.value
  if (!id) return
  const node = nodes.value.find((n) => n.id === id)
  const removable = new Set(['filter', 'transform', 'fetch', 'merge', 'ingest', 'export'])
  if (!node || !removable.has(node.type)) return
  if (node.type === 'fetch') {
    const fetches = nodes.value.filter((n) => n.type === 'fetch')
    if (fetches.length <= 2) return
  }
  if (node.type === 'merge') {
    const merges = nodes.value.filter((n) => n.type === 'merge')
    if (merges.length <= 1) return
  }
  if (node.type === 'ingest' || node.type === 'export') {
    const sinks = nodes.value.filter((n) => n.type === 'ingest' || n.type === 'export')
    if (sinks.length <= 1) return
  }
  nodes.value = nodes.value.filter((n) => n.id !== id)
  edges.value = edges.value.filter((e) => e.source !== id && e.target !== id)
  closeConfig()
  emitPipeline()
}

function fitToScreen(duration = 200) {
  nextTick(() => {
    // Same behavior as the Controls “fit view” control (below zoom ±).
    fitViewFn?.({
      padding: 0.2,
      includeHiddenNodes: false,
      duration,
    })
  })
}

/**
 * @param {import('@vue-flow/core').VueFlowStore} instance
 */
function onFlowInit(instance) {
  fitViewFn = instance.fitView?.bind(instance) || null
  // Ensure Controls lock icon matches our layout lock after the store is ready.
  syncingInteractive = true
  try {
    setInteractive(!isLayoutLocked.value)
  }
  catch {
    // ignore
  }
  nextTick(() => {
    syncingInteractive = false
  })
}

let didInitialFit = false
function onNodesInitialized() {
  if (didInitialFit) return
  didInitialFit = true
  fitToScreen(0)
}

/**
 * Bottom-left Controls lock/unlock icon.
 * Controls toggles Vue Flow interactive state first; keep our layoutLocked in sync.
 * @param {boolean} _active
 */
function onControlsInteractionChange(_active) {
  if (syncingInteractive) return

  if (props.locked) {
    syncingInteractive = true
    setInteractive(false)
    layoutLocked.value = true
    nextTick(() => {
      syncingInteractive = false
    })
    appAlert({
      title: 'Layout is locked',
      message: 'The editor is busy (test, run, or save). Wait until it finishes, then unlock the layout if you want to rearrange nodes.',
    })
    return
  }

  // Toggle to match Controls click (Controls already flipped store interactive flags).
  layoutLocked.value = !layoutLocked.value
  // Re-apply so props + store agree with our intended lock.
  nextTick(() => {
    syncingInteractive = true
    setInteractive(!layoutLocked.value)
    nextTick(() => {
      syncingInteractive = false
    })
  })
}

function toggleLayoutLock() {
  if (props.locked) {
    appAlert({
      title: 'Layout is locked',
      message: 'The editor is busy (test, run, or save). Wait until it finishes, then unlock the layout if you want to rearrange nodes.',
    })
    return
  }
  layoutLocked.value = !layoutLocked.value
}

function autoLayout() {
  if (isLayoutLocked.value) {
    appAlert({
      title: 'Layout is locked',
      message: 'Unlock the layout first to use Auto layout.',
    })
    return
  }
  const laidOut = layoutPipelineNodes(nodes.value, edges.value)
  if (!laidOut.length) return
  const byId = Object.fromEntries(laidOut.map((p) => [p.id, p.position]))
  nodes.value = nodes.value.map((n) => ({
    ...n,
    position: byId[n.id] ? { ...byId[n.id] } : { ...n.position },
  }))
  emitPipeline()
  fitToScreen(200)
}

function resetViewFit() {
  didInitialFit = false
  fitToScreen(0)
}

defineExpose({
  closeConfig,
  flush() {
    emitPipeline()
  },
  openNodeConfig(nodeId) {
    selectedNodeId.value = nodeId
    configOpen.value = true
  },
  autoLayout,
  fitToScreen,
  resetViewFit,
})
</script>

<style>
.source-pipeline-flow {
  --vf-node-bg: transparent;
  --vf-node-text: var(--ink);
  --vf-connection-path: var(--accent);
  min-height: 100%;
}
.source-pipeline-flow .vue-flow__edge-path {
  stroke: var(--accent);
  stroke-width: 2.5;
}
.source-pipeline-flow .vue-flow__edge.selected .vue-flow__edge-path,
.source-pipeline-flow .vue-flow__edge:focus .vue-flow__edge-path {
  stroke: var(--danger);
  stroke-width: 3;
}
.source-pipeline-flow .vue-flow__connection-path {
  stroke: var(--accent);
}
.source-pipeline-flow .vue-flow__handle {
  opacity: 1;
}
.source-pipeline-flow .vue-flow__controls {
  background: var(--surface-raised);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: none;
}
.source-pipeline-flow .vue-flow__controls-button {
  background: var(--surface-raised);
  border-bottom: 1px solid var(--border);
  fill: var(--ink);
}
.source-pipeline-flow .vue-flow__minimap {
  background: var(--surface-raised);
  border: 1px solid var(--border);
  border-radius: 8px;
}
</style>
