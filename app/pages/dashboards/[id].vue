<template>
  <div
    ref="shellEl"
    class="dashboard-view mx-auto w-full max-w-[90rem] flex-1 px-6 py-10 lg:px-8"
    :class="isFullscreen ? 'dashboard-view--fullscreen' : ''"
  >
    <div class="dashboard-view__header flex shrink-0 flex-wrap items-center justify-between gap-4">
      <div class="min-w-0">
        <InfoTip
          :text="dashDescription"
          aria-label="Dashboard description"
        >
          <h1 class="font-display text-3xl font-semibold tracking-tight text-[var(--ink)]">
            {{ dash?.name || (showPageLoading ? 'Loading…' : 'Dashboard') }}
          </h1>
        </InfoTip>
      </div>

      <div class="dashboard-view__chrome flex flex-wrap items-center justify-end gap-2">
        <p
          v-if="lastUpdatedLabel"
          class="mr-1 text-xs text-[var(--mute)]"
          :title="lastUpdatedExact"
        >
          Last updated {{ lastUpdatedLabel }}
        </p>

        <label class="flex items-center gap-2 text-sm text-[var(--mute)]">
          <span class="whitespace-nowrap">Refresh</span>
          <select
            v-model="refreshIntervalMs"
            class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm text-[var(--ink)]"
          >
            <option
              v-for="opt in refreshOptions"
              :key="opt.value"
              :value="opt.value"
            >
              {{ opt.label }}
            </option>
          </select>
        </label>

        <button
          v-if="focusLabel"
          type="button"
          class="btn-secondary !px-3 !py-1.5 text-sm"
          @click="clearFilters()"
        >
          Clear filters · {{ focusLabel }}
        </button>

        <!-- Fullscreen + tools stay on one row (never stack above each other) -->
        <div class="dashboard-view__export-hide inline-flex shrink-0 flex-row flex-nowrap items-center gap-1">
          <button
            v-if="!isFullscreen"
            type="button"
            class="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[var(--border)] text-[var(--mute)] hover:border-[var(--accent)] hover:text-[var(--accent-ink)]"
            title="Full screen"
            aria-label="Full screen"
            @click="enterFullscreen"
          >
            <span aria-hidden="true">⛶</span>
          </button>
          <button
            v-else
            type="button"
            class="inline-flex h-9 w-9 items-center justify-center rounded-md border border-transparent text-[var(--mute)] hover:border-[var(--border)] hover:text-[var(--ink)]"
            title="Exit full screen"
            aria-label="Exit full screen"
            @click="exitFullscreen"
          >
            <svg
              class="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M9 17l-5-5 5-5" />
              <path d="M4 12h11a5 5 0 015 5v2" />
            </svg>
          </button>

          <div
            v-if="toolsEnabled"
            ref="toolsMenuEl"
            class="relative inline-flex"
          >
            <button
              type="button"
              class="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[var(--border)] text-[var(--mute)] hover:border-[var(--accent)] hover:text-[var(--accent-ink)]"
              :class="toolsMenuOpen || annotating ? 'border-[var(--accent)] text-[var(--accent-ink)]' : ''"
              title="Tools"
              aria-label="Tools"
              :aria-expanded="toolsMenuOpen"
              @click="toolsMenuOpen = !toolsMenuOpen"
            >
              <svg
                class="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                aria-hidden="true"
              >
                <path d="M4 7h16" />
                <path d="M4 12h16" />
                <path d="M4 17h16" />
              </svg>
            </button>
            <div
              v-if="toolsMenuOpen"
              class="absolute right-0 top-full z-50 mt-1 min-w-[10.5rem] rounded-md border border-[var(--border)] bg-[var(--surface-raised)] py-1 shadow-lg"
            >
              <button
                type="button"
                class="block w-full px-3 py-2 text-left text-sm text-[var(--ink)] hover:bg-[var(--accent-soft)]"
                :disabled="exporting"
                @click="onToolsDownloadPng"
              >
                {{ exporting ? 'Preparing PNG…' : 'Download PNG' }}
              </button>
              <button
                type="button"
                class="block w-full px-3 py-2 text-left text-sm text-[var(--ink)] hover:bg-[var(--accent-soft)]"
                @click="onToolsAnnotate"
              >
                {{ annotating ? 'Stop annotating' : 'Annotate' }}
              </button>
            </div>
          </div>
        </div>

        <div
          v-if="!isStandalone && !isFullscreen"
          ref="openMenuEl"
          class="dashboard-view__export-hide relative"
        >
          <button
            type="button"
            class="btn-secondary !px-3 !py-1.5 text-sm"
            :aria-expanded="openMenu"
            @click="openMenu = !openMenu"
          >
            Open…
          </button>
          <div
            v-if="openMenu"
            class="absolute right-0 z-40 mt-1 min-w-[11rem] rounded-md border border-[var(--border)] bg-[var(--surface-raised)] py-1 shadow-lg"
          >
            <button
              type="button"
              class="block w-full px-3 py-2 text-left text-sm text-[var(--ink)] hover:bg-[var(--accent-soft)]"
              @click="openInNewTab"
            >
              New tab
            </button>
            <button
              type="button"
              class="block w-full px-3 py-2 text-left text-sm text-[var(--ink)] hover:bg-[var(--accent-soft)]"
              @click="openInNewWindow"
            >
              New window
            </button>
          </div>
        </div>

        <NuxtLink
          v-if="!isStandalone && !isFullscreen"
          to="/dashboards"
          class="dashboard-view__export-hide btn-secondary !px-3 !py-1.5 text-sm"
        >
          Back
        </NuxtLink>
        <NuxtLink
          v-if="canEditDashboard && !isStandalone && !isFullscreen"
          :to="`/dashboards/configure/${route.params.id}`"
          class="dashboard-view__export-hide btn-primary !px-3 !py-1.5 text-sm"
        >
          Edit
        </NuxtLink>
      </div>
    </div>

    <p
      v-if="error"
      class="panel mt-6 border-[var(--danger)] px-4 py-3 text-sm text-[var(--danger)]"
    >
      {{ error }}
    </p>
    <p
      v-if="notice"
      class="panel mt-6 border-[var(--accent)] bg-[var(--accent-soft)] px-4 py-3 text-sm text-[var(--ink)]"
    >
      {{ notice }}
    </p>

    <div
      v-if="showPageLoading"
      class="mt-8 text-sm text-[var(--mute)]"
    >
      Loading…
    </div>

    <ClientOnly v-else-if="dash && organizationId">
      <div class="dashboard-view__board relative mt-8 min-h-0 flex-1">
        <DashboardBoard
          ref="boardRef"
          v-if="widgets.length"
          class="h-full"
          :widgets="widgets"
          :cols="cols"
          :locked="true"
          :fill-viewport="isFullscreen"
          @change="onLayoutChange"
        >
          <template #widget="{ widget, locked }">
            <DashboardWidget
              :widget="widget"
              :organization-id="organizationId"
              :dashboard-id="dash.id"
              :filters="filterPayload"
              :locked="locked"
              :can-configure="canEditDashboard"
              :refresh-nonce="refreshNonce"
              @filter="onWidgetFilter"
              @type-change="onTypeChange"
              @display-change="onDisplayChange"
              @data-loaded="onWidgetDataLoaded"
            />
          </template>
        </DashboardBoard>
        <p
          v-else
          class="text-sm text-[var(--mute)]"
        >
          This dashboard has no widgets yet.
          <NuxtLink
            v-if="canEditDashboard && !isStandalone"
            :to="`/dashboards/configure/${dash.id}`"
            class="text-[var(--accent-ink)] underline"
          >
            Add widgets
          </NuxtLink>
        </p>

        <canvas
          v-show="annotating"
          ref="annotateCanvas"
          class="pointer-events-auto absolute inset-0 z-30 h-full w-full touch-none"
          @pointerdown="onAnnotateDown"
          @pointermove="onAnnotateMove"
          @pointerup="onAnnotateUp"
          @pointerleave="onAnnotateUp"
        />
      </div>
    </ClientOnly>

    <p
      v-else-if="!error"
      class="mt-8 text-sm text-[var(--mute)]"
    >
      No active organization. Choose an organization to view this dashboard.
    </p>
  </div>
</template>

<script setup>
import InfoTip from '~/components/InfoTip.vue'
import { normalizeDashboardLayout } from '~~/shared/dashboardLayout.js'

definePageMeta({
  middleware: ['auth'],
  // Client-only: auth session is browser-side; avoids login flash in new tab/window.
  ssr: false,
})

const REFRESH_OPTIONS = [
  { label: 'None', value: '0' },
  { label: '1 Minute', value: '60000' },
  { label: '5 Minutes', value: '300000' },
  { label: '15 Minutes', value: '900000' },
  { label: '30 Minutes', value: '1800000' },
]

const route = useRoute()
const authStore = useAuthStore()
const {
  activeOrganization,
  activeOrganizationId,
  loading: orgLoading,
} = useOrganization()
const { canOpenAdministration } = usePermissions()
const authedFetch = useAuthedFetch()
const {
  filterPayload,
  focusLabel,
  setFilter,
  clearFilters,
} = useDashboardFilters()

const isStandalone = computed(() =>
  route.query.standalone === '1' || route.query.standalone === 'true',
)

watch(
  isStandalone,
  (standalone) => {
    setPageLayout(standalone ? 'blank' : 'app')
  },
  { immediate: true },
)

const dash = ref(null)
const pending = ref(true)
const error = ref('')
const notice = ref('')
/** Org+dashboard key last successfully loaded — skips reload on auth/org rehydrate. */
const loadedKey = ref('')

/** Auto-refresh interval as string ms; '0' = off (default). */
const refreshIntervalMs = ref('0')
const refreshNonce = ref(0)
const refreshOptions = REFRESH_OPTIONS

const shellEl = ref(null)
const boardRef = ref(null)
const openMenuEl = ref(null)
const toolsMenuEl = ref(null)
const annotateCanvas = ref(null)
const isFullscreen = ref(false)
const openMenu = ref(false)
const toolsMenuOpen = ref(false)
const exporting = ref(false)
const lastUpdatedAt = ref(null)
const annotating = ref(false)
/** @type {{ drawing: boolean, lastX: number, lastY: number }} */
const annotateState = { drawing: false, lastX: 0, lastY: 0 }

/** @type {ReturnType<typeof setInterval> | null} */
let refreshTimer = null
let loadSeq = 0

const organizationId = computed(() =>
  activeOrganizationId.value || activeOrganization.value?.id || '',
)

/** Org Admin or Platform Admin only — not regular members. */
const canEditDashboard = computed(() => canOpenAdministration.value)

const widgets = computed(() => dash.value?.widgets || [])
const cols = computed(() => dash.value?.layout?.cols || 12)
const dashDescription = computed(() => String(dash.value?.description || '').trim())
const toolsEnabled = computed(() => {
  const layout = normalizeDashboardLayout(dash.value?.layout)
  return layout.tools?.enabled === true || layout.showToolsMenu === true
})

/** Full-page spinner only until the first successful load (keep board mounted on reloads). */
const showPageLoading = computed(() =>
  !dash.value
  && !error.value
  && (pending.value || orgLoading.value || authStore.loading),
)
const lastUpdatedExact = computed(() => {
  if (!lastUpdatedAt.value) return ''
  return new Date(lastUpdatedAt.value).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'medium',
  })
})

const lastUpdatedLabel = computed(() => lastUpdatedExact.value)

useHead(() => ({ title: dash.value?.name || 'Dashboard' }))

function onWidgetFilter(payload) {
  setFilter(payload)
}

function onWidgetDataLoaded() {
  lastUpdatedAt.value = Date.now()
}

/**
 * @param {Array<{ id: string, grid_x: number, grid_y: number, grid_w: number, grid_h: number }>} next
 */
function onLayoutChange() {
  // View mode is always locked — ignore board change events.
}

/**
 * @param {{ widgetId: string, widgetType: string }} payload
 */
function onTypeChange(payload) {
  if (!dash.value?.widgets) return
  const target = dash.value.widgets.find((w) => w.id === payload.widgetId)
  if (target) {
    target.widget_type = payload.widgetType
  }
}

/**
 * @param {{ widgetId: string, displayConfig: Record<string, unknown> }} payload
 */
function onDisplayChange(payload) {
  if (!dash.value?.widgets) return
  const target = dash.value.widgets.find((w) => w.id === payload.widgetId)
  if (target) {
    target.display_config = payload.displayConfig
  }
}

function bumpRefresh() {
  refreshNonce.value += 1
}

function clearRefreshTimer() {
  if (refreshTimer != null) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
}

function syncRefreshTimer() {
  clearRefreshTimer()
  const ms = Number.parseInt(String(refreshIntervalMs.value), 10)
  if (!Number.isFinite(ms) || ms <= 0 || !import.meta.client) return
  refreshTimer = setInterval(() => {
    bumpRefresh()
  }, ms)
}

function standaloneUrl() {
  const id = route.params.id
  const org = organizationId.value
  const q = new URLSearchParams({ standalone: '1' })
  if (org) q.set('organizationId', org)
  return `${window.location.origin}/dashboards/${id}?${q.toString()}`
}

function openInNewTab() {
  openMenu.value = false
  if (!import.meta.client) return
  window.open(standaloneUrl(), '_blank', 'noopener,noreferrer')
}

function openInNewWindow() {
  openMenu.value = false
  if (!import.meta.client) return
  window.open(
    standaloneUrl(),
    '_blank',
    'noopener,noreferrer,width=1400,height=900,menubar=no,toolbar=yes,location=yes,status=yes',
  )
}

async function enterFullscreen() {
  if (!import.meta.client || !shellEl.value) return
  try {
    if (shellEl.value.requestFullscreen) {
      await shellEl.value.requestFullscreen()
    }
    else if (shellEl.value.webkitRequestFullscreen) {
      await shellEl.value.webkitRequestFullscreen()
    }
  }
  catch {
    notice.value = 'Full screen was blocked by the browser'
  }
}

async function exitFullscreen() {
  if (!import.meta.client) return
  try {
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      if (document.exitFullscreen) await document.exitFullscreen()
      else if (document.webkitExitFullscreen) await document.webkitExitFullscreen()
    }
  }
  catch {
    // ignore
  }
  isFullscreen.value = false
}

function onFullscreenChange() {
  const active = Boolean(document.fullscreenElement || document.webkitFullscreenElement)
  isFullscreen.value = active
  nextTick(() => {
    boardRef.value?.measure?.()
    boardRef.value?.fitViewport?.()
  })
}

function onDocPointerDown(event) {
  if (openMenu.value) {
    const el = openMenuEl.value
    if (!(el && event.target instanceof Node && el.contains(event.target))) {
      openMenu.value = false
    }
  }
  if (toolsMenuOpen.value) {
    const el = toolsMenuEl.value
    if (!(el && event.target instanceof Node && el.contains(event.target))) {
      toolsMenuOpen.value = false
    }
  }
}

function downloadPdf() {
  if (!import.meta.client) return
  window.print()
}

/**
 * Capture only the dashboard shell (not app header/sidebar).
 */
async function downloadPng() {
  if (!import.meta.client || !shellEl.value || exporting.value) return
  exporting.value = true
  toolsMenuOpen.value = false
  notice.value = ''
  try {
    await nextTick()
    const { toPng } = await import('html-to-image')
    const dataUrl = await toPng(shellEl.value, {
      cacheBust: true,
      pixelRatio: Math.min(2, window.devicePixelRatio || 1),
      backgroundColor: getComputedStyle(document.documentElement)
        .getPropertyValue('--surface')
        .trim() || '#14171c',
      filter: (node) => {
        if (!(node instanceof Element)) return true
        // Hide transient chrome from the export (tools, open, back, edit).
        if (node.classList?.contains('dashboard-view__export-hide')) return false
        if (node.classList?.contains('vue-ui-user-options')) return false
        if (node.classList?.contains('vue-ui-user-options-drawer')) return false
        return true
      },
    })
    const link = document.createElement('a')
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
    const name = String(dash.value?.name || 'dashboard')
      .replace(/[^\w\-]+/g, '_')
      .slice(0, 48)
    link.download = `${name || 'dashboard'}-${stamp}.png`
    link.href = dataUrl
    link.click()
  }
  catch (err) {
    console.warn('[dashboard] PNG export failed', err)
    notice.value = 'PNG export failed — try again or use print for PDF'
  }
  finally {
    exporting.value = false
  }
}

function onToolsDownloadPng() {
  toolsMenuOpen.value = false
  void downloadPng()
}

function onToolsDownloadPdf() {
  toolsMenuOpen.value = false
  downloadPdf()
}

function onToolsAnnotate() {
  toolsMenuOpen.value = false
  toggleAnnotate()
}

function sizeAnnotateCanvas() {
  const canvas = annotateCanvas.value
  if (!canvas || !import.meta.client) return
  const parent = canvas.parentElement
  if (!parent) return
  const rect = parent.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.max(1, Math.floor(rect.width * dpr))
  canvas.height = Math.max(1, Math.floor(rect.height * dpr))
  canvas.style.width = `${rect.width}px`
  canvas.style.height = `${rect.height}px`
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.strokeStyle = '#00c2c7'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }
}

function toggleAnnotate() {
  annotating.value = !annotating.value
  if (annotating.value) {
    nextTick(() => sizeAnnotateCanvas())
  }
  else {
    annotateState.drawing = false
  }
}

/**
 * @param {PointerEvent} event
 */
function annotatePoint(event) {
  const canvas = annotateCanvas.value
  if (!canvas) return { x: 0, y: 0 }
  const rect = canvas.getBoundingClientRect()
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  }
}

/**
 * @param {PointerEvent} event
 */
function onAnnotateDown(event) {
  if (!annotating.value) return
  const canvas = annotateCanvas.value
  if (!canvas) return
  canvas.setPointerCapture?.(event.pointerId)
  const pt = annotatePoint(event)
  annotateState.drawing = true
  annotateState.lastX = pt.x
  annotateState.lastY = pt.y
}

/**
 * @param {PointerEvent} event
 */
function onAnnotateMove(event) {
  if (!annotating.value || !annotateState.drawing) return
  const canvas = annotateCanvas.value
  const ctx = canvas?.getContext('2d')
  if (!ctx) return
  const pt = annotatePoint(event)
  ctx.beginPath()
  ctx.moveTo(annotateState.lastX, annotateState.lastY)
  ctx.lineTo(pt.x, pt.y)
  ctx.stroke()
  annotateState.lastX = pt.x
  annotateState.lastY = pt.y
}

function onAnnotateUp() {
  annotateState.drawing = false
}

watch(refreshIntervalMs, () => {
  syncRefreshTimer()
})

onMounted(() => {
  syncRefreshTimer()
  if (import.meta.client) {
    document.addEventListener('fullscreenchange', onFullscreenChange)
    document.addEventListener('webkitfullscreenchange', onFullscreenChange)
    document.addEventListener('pointerdown', onDocPointerDown)
    window.addEventListener('resize', sizeAnnotateCanvas)
  }
})

onBeforeUnmount(() => {
  clearRefreshTimer()
  if (import.meta.client) {
    document.removeEventListener('fullscreenchange', onFullscreenChange)
    document.removeEventListener('webkitfullscreenchange', onFullscreenChange)
    document.removeEventListener('pointerdown', onDocPointerDown)
    window.removeEventListener('resize', sizeAnnotateCanvas)
  }
})

function dashLoadKey(orgId, dashId) {
  return `${orgId || ''}:${dashId || ''}`
}

async function load() {
  const seq = ++loadSeq
  clearFilters()
  annotating.value = false
  toolsMenuOpen.value = false

  const orgId = organizationId.value
  const dashId = String(route.params.id || '')
  if (!orgId || !dashId) {
    if (!orgLoading.value && !authStore.loading) {
      dash.value = null
      loadedKey.value = ''
      pending.value = false
    }
    return
  }

  const key = dashLoadKey(orgId, dashId)
  // Soft reload when we already show this dashboard — do not blank the board.
  if (!dash.value) pending.value = true
  error.value = ''
  try {
    const res = await authedFetch(`/api/dashboards/${dashId}`, {
      query: { organizationId: orgId },
    })
    if (seq !== loadSeq) return
    dash.value = {
      ...res.item,
      layout: normalizeDashboardLayout(res.item?.layout),
    }
    loadedKey.value = key
  }
  catch (err) {
    if (seq !== loadSeq) return
    error.value = err?.data?.statusMessage || err?.message || 'Failed to load dashboard'
    dash.value = null
    loadedKey.value = ''
  }
  finally {
    if (seq === loadSeq) pending.value = false
  }
}

watch(
  [
    () => organizationId.value,
    () => String(route.params.id || ''),
    () => orgLoading.value,
    () => authStore.loading,
  ],
  ([orgId, dashId, orgBusy, authBusy]) => {
    if (authBusy || orgBusy) {
      if (!dash.value) pending.value = true
      return
    }
    if (!dashId) {
      pending.value = false
      dash.value = null
      loadedKey.value = ''
      return
    }
    if (!orgId) {
      pending.value = false
      dash.value = null
      loadedKey.value = ''
      return
    }
    const key = dashLoadKey(orgId, dashId)
    if (loadedKey.value === key && dash.value) {
      pending.value = false
      return
    }
    load()
  },
  { immediate: true },
)
</script>

<style scoped>
.dashboard-view--fullscreen {
  display: flex;
  flex-direction: column;
  max-width: none !important;
  width: 100%;
  height: 100vh;
  max-height: 100vh;
  margin: 0;
  padding: 1rem 1.25rem;
  background: var(--surface);
  /* Keep overflow visible so tools/chart menus are not clipped. */
  overflow: visible;
}

.dashboard-view--fullscreen .dashboard-view__header {
  position: relative;
  z-index: 60;
  overflow: visible;
}

.dashboard-view--fullscreen .dashboard-view__board {
  margin-top: 1rem;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

/*
 * vue-data-ui pins .vue-ui-user-options to position:fixed when *any*
 * element is fullscreen — so every chart hamburger stacks on the
 * dashboard. Force them back onto each widget.
 */
.dashboard-view--fullscreen :deep(.vue-ui-user-options) {
  position: absolute !important;
  top: 0 !important;
  right: 0 !important;
  left: auto !important;
}

.dashboard-view :deep(.vue-ui-user-options) {
  z-index: 5;
}

@media print {
  :global(body *) {
    visibility: hidden !important;
  }

  .dashboard-view,
  .dashboard-view * {
    visibility: visible !important;
  }

  .dashboard-view {
    position: absolute !important;
    inset: 0 auto auto 0;
    max-width: none !important;
    width: 100% !important;
    height: auto !important;
    max-height: none !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: visible !important;
    background: var(--surface) !important;
  }

  .dashboard-view__header .inline-flex,
  .dashboard-view__export-hide {
    display: none !important;
  }
}
</style>
