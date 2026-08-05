<template>
  <div class="flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-[var(--border)]">
    <div class="flex flex-wrap items-center gap-2 border-b border-[var(--border)] bg-[var(--surface)] px-3 py-2">
      <p class="text-[10px] font-semibold uppercase tracking-wide text-[var(--mute)]">
        Operators
      </p>
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
      <button
        type="button"
        class="rounded-md border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-1.5 text-sm text-[var(--ink)] hover:border-[var(--accent)]"
        @click="autoLayout"
      >
        Auto layout
      </button>
      <label class="ml-auto flex items-center gap-2 text-xs text-[var(--ink)]">
        <input
          v-model="debugEnabled"
          type="checkbox"
          class="h-3.5 w-3.5 accent-[var(--accent)]"
        >
        Detailed debugging
      </label>
      <button
        v-if="selectedEdgeId"
        type="button"
        class="rounded-md border border-[var(--danger)] px-3 py-1.5 text-xs text-[var(--danger)]"
        @click="removeSelectedEdge"
      >
        Remove link
      </button>
      <p class="w-full text-[10px] text-[var(--mute-soft)] sm:w-auto">
        Drag from a cyan handle to another. Click a link then “Remove link”, or press Delete. Double-click a node to edit.
      </p>
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
          :nodes-connectable="true"
          :elements-selectable="true"
          :edges-updatable="true"
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
          <Controls />
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
} from '@vue-flow/core'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/controls/dist/style.css'
import '@vue-flow/minimap/dist/style.css'

import { createDefaultPipeline, normalizePipeline } from '~~/shared/pipelineDefaults.js'
import { layoutPipelineNodes } from '~~/shared/pipelineLayout.js'
import RetrieveNode from '~/components/pipeline/RetrieveNode.vue'
import FilterNode from '~/components/pipeline/FilterNode.vue'
import TransformNode from '~/components/pipeline/TransformNode.vue'
import IngestNode from '~/components/pipeline/IngestNode.vue'

const FLOW_ID = 'source-pipeline-canvas'
/** Default zoom is 75% of Vue Flow's usual 1.0. */
const DEFAULT_ZOOM = 0.75
const defaultViewport = { x: 0, y: 0, zoom: DEFAULT_ZOOM }

/** @type {null | ((opts?: Record<string, unknown>) => void)} */
let fitViewFn = null

const props = defineProps({
  modelValue: {
    type: Object,
    default: () => createDefaultPipeline(),
  },
  destinationTable: {
    type: String,
    default: '',
  },
})

const emit = defineEmits(['update:modelValue', 'edit-node'])

const nodeTypes = {
  retrieve: markRaw(RetrieveNode),
  filter: markRaw(FilterNode),
  transform: markRaw(TransformNode),
  ingest: markRaw(IngestNode),
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
let lastEmitted = ''

const selectedNode = computed(() =>
  nodes.value.find((n) => n.id === selectedNodeId.value) || null,
)

const configTitle = computed(() => {
  const t = selectedNode.value?.type
  if (t === 'retrieve') return 'Retrieve'
  if (t === 'filter') return 'Filter'
  if (t === 'transform') return 'Transform'
  if (t === 'ingest') return 'Ingest'
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
  nodes.value = applyNodeChanges(changes, nodes.value)
  const meaningful = changes.some((c) =>
    c.type === 'position' || c.type === 'remove' || c.type === 'add' || c.type === 'dimensions',
  )
  // Only persist after drag end / structural change
  const persist = changes.some((c) =>
    c.type === 'remove'
    || c.type === 'add'
    || (c.type === 'position' && c.dragging === false),
  )
  if (persist || (meaningful && changes.some((c) => c.type === 'remove'))) {
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
  if (sourceNode.type === 'ingest') return false
  if (targetNode.type === 'retrieve') return false
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
  if (targetType === 'filter' || targetType === 'transform' || targetType === 'ingest') {
    next = next.filter((e) => e.target !== params.target)
  }
  // Retrieve typically feeds one primary chain; allow multiple filters later — keep all outbound

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
  event.dataTransfer?.setData('application/pipeline-node', type)
  event.dataTransfer.effectAllowed = 'move'
}

/**
 * @param {{ x?: number, y?: number }} [position]
 */
function addFilterNode(position) {
  const id = `filter_${Date.now().toString(36)}`
  const pos = position && typeof position.x === 'number'
    ? position
    : {
        x: 280,
        y: 80 + nodes.value.filter((n) => n.type === 'filter' || n.type === 'transform').length * 90,
      }
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
  const pos = position && typeof position.x === 'number'
    ? position
    : {
        x: 280,
        y: 80 + nodes.value.filter((n) => n.type === 'filter' || n.type === 'transform').length * 90,
      }
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
 * @param {DragEvent} event
 */
function onCanvasDrop(event) {
  const type = event.dataTransfer?.getData('application/pipeline-node')
  if (type !== 'filter' && type !== 'transform') return
  const bounds = event.currentTarget.getBoundingClientRect()
  const pos = {
    x: Math.max(40, event.clientX - bounds.left - 80),
    y: Math.max(40, event.clientY - bounds.top - 30),
  }
  if (type === 'transform') addTransformNode(pos)
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
  if (!node || (node.type !== 'filter' && node.type !== 'transform')) return
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
}

let didInitialFit = false
function onNodesInitialized() {
  if (didInitialFit) return
  didInitialFit = true
  fitToScreen(0)
}

function autoLayout() {
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
