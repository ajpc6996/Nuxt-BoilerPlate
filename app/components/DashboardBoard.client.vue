<template>
  <div
    ref="boardEl"
    class="dashboard-board relative w-full"
    :class="[
      locked ? '' : 'dashboard-board--editing',
      dropActive ? 'dashboard-board--drop-active' : '',
    ]"
    :style="boardStyle"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <div
      v-if="!locked"
      class="pointer-events-none absolute inset-0 z-0"
      aria-hidden="true"
    >
      <div
        class="h-full w-full rounded-md"
        :style="guideStyle"
      />
    </div>

    <p
      v-if="!localItems.length && acceptPaletteDrop"
      class="pointer-events-none absolute inset-0 z-0 flex items-center justify-center px-6 text-center text-sm text-[var(--mute)]"
    >
      Drag a widget type from the palette and drop it here.
    </p>

    <div
      v-for="item in localItems"
      :key="item.id"
      class="dashboard-board__cell absolute z-[1] box-border"
      :class="[
        locked ? 'overflow-visible' : 'overflow-hidden',
        locked ? '' : 'dashboard-board__cell--editable',
        activeId === item.id ? 'z-[2] ring-2 ring-[var(--accent)]' : '',
      ]"
      :style="cellStyle(item)"
      @pointerdown="onCellPointerDown($event, item)"
      @dblclick="onCellDblClick($event, item)"
    >
      <div class="relative h-full min-h-0">
        <slot
          name="widget"
          :widget="item"
          :locked="locked"
        />
        <button
          v-if="!locked"
          type="button"
          class="dashboard-board__resize absolute bottom-1 right-1 z-10 flex h-5 w-5 cursor-se-resize items-center justify-center rounded border border-[var(--border)] bg-[var(--surface-raised)] text-[10px] text-[var(--mute)] hover:border-[var(--accent)] hover:text-[var(--accent-ink)]"
          title="Resize"
          aria-label="Resize widget"
          @pointerdown.stop="onResizePointerDown($event, item)"
        >
          ↘
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { resolveLayoutCollisions } from '~~/shared/dashboardLayout.js'

/**
 * Absolute snap-to-grid board for dashboard widgets.
 * Grid: `cols` columns × row units of `rowHeight` (+ gap).
 * Drag/resize uses insert-style collision: overlapping widgets push down.
 */
const props = defineProps({
  widgets: {
    type: Array,
    default: () => [],
  },
  cols: {
    type: Number,
    default: 12,
  },
  rowHeight: {
    type: Number,
    default: 56,
  },
  gap: {
    type: Number,
    default: 16,
  },
  locked: {
    type: Boolean,
    default: true,
  },
  /** Accept palette drops (configure canvas). */
  acceptPaletteDrop: {
    type: Boolean,
    default: false,
  },
  /** Emit widget-dblclick (configure mode only). */
  configureMode: {
    type: Boolean,
    default: false,
  },
  /** Stretch row height so widgets fill the board parent (fullscreen view). */
  fillViewport: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['change', 'drag-start', 'drag-end', 'palette-drop', 'widget-dblclick'])

const boardEl = ref(null)
const localItems = ref([])
const activeId = ref(null)
const boardWidth = ref(960)
const dropActive = ref(false)
const effectiveRowHeight = ref(props.rowHeight)

/** @type {{ mode: 'move'|'resize', id: string, startX: number, startY: number, orig: object } | null} */
let drag = null

watch(
  () => props.rowHeight,
  (h) => {
    if (!props.fillViewport) effectiveRowHeight.value = h
  },
)

watch(
  () => props.widgets,
  (list) => {
    const next = list || []
    const prevById = new Map(localItems.value.map((w) => [w.id, w]))
    localItems.value = next.map((w) => {
      const grid = {
        grid_x: Number(w.grid_x) || 0,
        grid_y: Number(w.grid_y) || 0,
        grid_w: Math.max(1, Number(w.grid_w) || 6),
        grid_h: Math.max(1, Number(w.grid_h) || 4),
      }
      const existing = prevById.get(w.id)
      if (existing) {
        // Preserve object identity so child widgets are not remounted / refetched.
        Object.assign(existing, w, grid)
        return existing
      }
      return { ...w, ...grid }
    })
    nextTick(() => fitViewport())
  },
  { immediate: true, deep: true },
)

const contentRows = computed(() => {
  let max = 1
  localItems.value.forEach((w) => {
    max = Math.max(max, (w.grid_y || 0) + (w.grid_h || 4))
  })
  return max
})

const maxRow = computed(() => {
  if (props.fillViewport) return contentRows.value
  return Math.max(10, contentRows.value + 2)
})

const boardStyle = computed(() => {
  const unit = effectiveRowHeight.value + props.gap
  const style = {
    minHeight: `${Math.max(1, maxRow.value) * unit - (props.fillViewport ? props.gap : 0)}px`,
  }
  if (props.fillViewport) {
    style.height = '100%'
    style.minHeight = '100%'
  }
  return style
})

const guideStyle = computed(() => {
  const col = `calc((100% - ${(props.cols - 1) * props.gap}px) / ${props.cols})`
  return {
    backgroundImage: `
      repeating-linear-gradient(
        to right,
        transparent 0,
        transparent calc(${col} - 1px),
        rgba(0, 194, 199, 0.12) calc(${col} - 1px),
        rgba(0, 194, 199, 0.12) ${col},
        transparent ${col},
        transparent calc(${col} + ${props.gap}px)
      )`,
    backgroundSize: '100% 100%',
  }
})

function cellWidth() {
  const gapTotal = (props.cols - 1) * props.gap
  return (boardWidth.value - gapTotal) / props.cols
}

function cellStyle(item) {
  const cw = cellWidth()
  const rh = effectiveRowHeight.value
  const left = item.grid_x * (cw + props.gap)
  const top = item.grid_y * (rh + props.gap)
  const width = item.grid_w * cw + (item.grid_w - 1) * props.gap
  const height = item.grid_h * rh + (item.grid_h - 1) * props.gap
  return {
    left: `${left}px`,
    top: `${top}px`,
    width: `${width}px`,
    height: `${height}px`,
  }
}

/**
 * @param {number} clientX
 * @param {number} clientY
 * @param {{ grid_w?: number, grid_h?: number }} [size]
 */
function clientToGrid(clientX, clientY, size = {}) {
  const rect = boardEl.value?.getBoundingClientRect()
  if (!rect) return { grid_x: 0, grid_y: 0, grid_w: 6, grid_h: 4 }
  const cw = cellWidth()
  const unitX = cw + props.gap
  const unitY = effectiveRowHeight.value + props.gap
  const w = Math.max(1, Number(size.grid_w) || 6)
  const h = Math.max(1, Number(size.grid_h) || 4)
  const x = Math.round((clientX - rect.left) / unitX)
  const y = Math.round((clientY - rect.top) / unitY)
  return {
    grid_x: clamp(x, 0, props.cols - w),
    grid_y: Math.max(0, y),
    grid_w: w,
    grid_h: h,
  }
}

function fitViewport() {
  if (!props.fillViewport || !boardEl.value) {
    effectiveRowHeight.value = props.rowHeight
    return
  }
  const parent = boardEl.value.parentElement
  const avail = (parent?.clientHeight || boardEl.value.clientHeight || 0)
  const rows = Math.max(1, contentRows.value)
  const gaps = Math.max(0, rows - 1) * props.gap
  const next = Math.floor((avail - gaps) / rows)
  effectiveRowHeight.value = Math.max(props.rowHeight, next)
}

function measure() {
  if (boardEl.value) {
    boardWidth.value = boardEl.value.clientWidth || 960
  }
  fitViewport()
}

onMounted(() => {
  measure()
  if (import.meta.client) {
    window.addEventListener('resize', measure)
  }
})

watch(
  () => props.fillViewport,
  async () => {
    await nextTick()
    measure()
  },
)
onBeforeUnmount(() => {
  if (import.meta.client) {
    window.removeEventListener('resize', measure)
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
  }
})

/**
 * @param {DragEvent} event
 */
function onDragOver(event) {
  if (!props.acceptPaletteDrop) return
  // Must call preventDefault or the browser will refuse the drop.
  // Do not gate on dataTransfer.types — Safari/Firefox often omit custom MIME types during dragover.
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
  dropActive.value = true
}

/**
 * @param {DragEvent} event
 */
function onDragLeave(event) {
  if (!props.acceptPaletteDrop) return
  const related = /** @type {Node | null} */ (event.relatedTarget)
  if (related && boardEl.value?.contains(related)) return
  dropActive.value = false
}

/**
 * @param {DragEvent} event
 */
function onDrop(event) {
  if (!props.acceptPaletteDrop) return
  event.preventDefault()
  event.stopPropagation()
  dropActive.value = false
  const raw = event.dataTransfer?.getData('text/plain')
    || event.dataTransfer?.getData('application/x-dashboard-widget-type')
    || ''
  const widgetType = String(raw || '').trim()
  emit('palette-drop', {
    widgetType,
    clientX: event.clientX,
    clientY: event.clientY,
  })
}

/**
 * @param {MouseEvent} event
 * @param {Record<string, unknown>} item
 */
function onCellDblClick(event, item) {
  if (!props.configureMode) return
  const target = /** @type {HTMLElement} */ (event.target)
  if (target.closest('button, select, a, input, textarea, .dashboard-board__resize')) return
  emit('widget-dblclick', item)
}

/**
 * @param {PointerEvent} event
 * @param {Record<string, unknown>} item
 */
function onCellPointerDown(event, item) {
  if (props.locked) return
  const target = /** @type {HTMLElement} */ (event.target)
  if (target.closest('button, select, a, input, textarea, .dashboard-board__resize')) return
  if (!target.closest('.dashboard-widget__drag')) return

  event.preventDefault()
  activeId.value = item.id
  drag = {
    mode: 'move',
    id: item.id,
    startX: event.clientX,
    startY: event.clientY,
    orig: {
      grid_x: item.grid_x,
      grid_y: item.grid_y,
      grid_w: item.grid_w,
      grid_h: item.grid_h,
    },
  }
  emit('drag-start', item)
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
}

/**
 * @param {PointerEvent} event
 * @param {Record<string, unknown>} item
 */
function onResizePointerDown(event, item) {
  if (props.locked) return
  event.preventDefault()
  activeId.value = item.id
  drag = {
    mode: 'resize',
    id: item.id,
    startX: event.clientX,
    startY: event.clientY,
    orig: {
      grid_x: item.grid_x,
      grid_y: item.grid_y,
      grid_w: item.grid_w,
      grid_h: item.grid_h,
    },
  }
  emit('drag-start', item)
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
}

/**
 * @param {PointerEvent} event
 */
function onPointerMove(event) {
  if (!drag) return
  const cw = cellWidth()
  const unitX = cw + props.gap
  const unitY = effectiveRowHeight.value + props.gap
  const dx = event.clientX - drag.startX
  const dy = event.clientY - drag.startY
  const item = localItems.value.find((w) => w.id === drag.id)
  if (!item) return

  if (drag.mode === 'move') {
    const nx = Math.round(drag.orig.grid_x + dx / unitX)
    const ny = Math.round(drag.orig.grid_y + dy / unitY)
    item.grid_x = clamp(nx, 0, props.cols - item.grid_w)
    item.grid_y = Math.max(0, ny)
  }
  else {
    const nw = Math.round(drag.orig.grid_w + dx / unitX)
    const nh = Math.round(drag.orig.grid_h + dy / unitY)
    item.grid_w = clamp(nw, 2, props.cols - item.grid_x)
    item.grid_h = Math.max(2, nh)
  }

  resolveLayoutCollisions(localItems.value, drag.id)
}

function onPointerUp() {
  if (!drag) return
  const id = drag.id
  drag = null
  activeId.value = null
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  emit('drag-end', localItems.value.find((w) => w.id === id))
  emit('change', localItems.value.map((w) => ({
    id: w.id,
    grid_x: w.grid_x,
    grid_y: w.grid_y,
    grid_w: w.grid_w,
    grid_h: w.grid_h,
  })))
}

/**
 * @param {number} n
 * @param {number} min
 * @param {number} max
 */
function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n))
}

defineExpose({ clientToGrid, measure, fitViewport })
</script>

<style scoped>
.dashboard-board--editing .dashboard-board__cell--editable {
  outline: 1px dashed color-mix(in srgb, var(--accent) 40%, transparent);
  outline-offset: -1px;
}
.dashboard-board--drop-active {
  outline: 2px dashed var(--accent);
  outline-offset: 4px;
  background: color-mix(in srgb, var(--accent-soft) 35%, transparent);
}
</style>
