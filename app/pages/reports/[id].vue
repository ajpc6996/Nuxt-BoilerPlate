<template>
  <div
    ref="shellEl"
    class="report-view mx-auto flex w-full max-w-[90rem] min-h-0 flex-1 flex-col px-2 py-2 sm:px-3 sm:py-3 lg:px-4"
    :class="isFullscreen ? 'report-view--fullscreen' : ''"
  >
    <header class="report-view__header flex shrink-0 flex-wrap items-center justify-between gap-3">
      <div class="min-w-0">
        <h1 class="truncate font-display text-xl font-semibold tracking-tight text-[var(--ink)] sm:text-2xl">
          {{ report?.name || (pending ? 'Loading…' : 'Report') }}
        </h1>
        <p
          v-if="report && !isFullscreen"
          class="mt-0.5 text-[10px] uppercase tracking-wide text-[var(--mute-soft)]"
        >
          {{ report.visibility }} · {{ rowCountLabel }}
        </p>
        <p
          v-else-if="report && isFullscreen"
          class="mt-0.5 text-xs text-[var(--mute)]"
        >
          {{ rowCountLabel }}
        </p>
      </div>

      <div class="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          class="btn-secondary !px-3 !py-1.5 text-sm"
          :disabled="running || !report"
          @click="loadData"
        >
          {{ running ? 'Loading…' : 'Refresh' }}
        </button>
        <button
          type="button"
          class="btn-secondary !px-3 !py-1.5 text-sm"
          :disabled="exporting || !report"
          @click="exportReport('json')"
        >
          JSON
        </button>
        <button
          type="button"
          class="btn-secondary !px-3 !py-1.5 text-sm"
          :disabled="exporting || !report"
          @click="exportReport('excel')"
        >
          Excel
        </button>

        <div class="inline-flex shrink-0 items-center gap-1">
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
        </div>

        <NuxtLink
          v-if="!isFullscreen"
          to="/reports"
          class="btn-secondary !px-3 !py-1.5 text-sm"
        >
          All reports
        </NuxtLink>
      </div>
    </header>

    <p
      v-if="notice"
      class="mt-2 shrink-0 rounded-md border border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-2 text-sm text-[var(--ink)]"
    >
      {{ notice }}
    </p>

    <p
      v-if="error"
      class="mt-2 shrink-0 rounded-md border border-[var(--danger)] px-3 py-2 text-sm text-[var(--danger)]"
    >
      {{ error }}
    </p>

    <div
      v-if="pending"
      class="mt-4 text-sm text-[var(--mute)]"
    >
      Loading report…
    </div>

    <div
      v-else-if="report"
      ref="gridShellRef"
      class="report-view__grid mt-2 flex min-h-0 flex-1 flex-col"
    >
      <ClientOnly>
        <div class="min-h-0 flex-1">
          <AppDataGrid
            ref="gridRef"
            :key="gridKey"
            :column-defs="columnDefs"
            :adapter="gridAdapter"
            height="100%"
            :pagination="true"
            :pagination-page-size="pageSize"
            @grid-ready="resizeGrid"
          />
        </div>
      </ClientOnly>
    </div>
  </div>
</template>

<script setup>
import AppDataGrid from '~/components/AppDataGrid.client.vue'
import { createLocalDataAdapter } from '~/utils/gridAdapters.js'
import {
  normalizeReportDisplayConfig,
  normalizeReportQueryConfig,
  reportColumnDefs,
} from '~~/shared/report.js'

definePageMeta({
  layout: 'app',
  middleware: ['auth'],
})

const route = useRoute()
const reportId = computed(() => String(route.params.id || ''))
const { activeOrganization } = useOrganization()
const authedFetch = useAuthedFetch()
const supabase = useSupabase()

const shellEl = ref(null)
const gridShellRef = ref(null)
const gridRef = ref(null)
const report = ref(null)
const rows = ref([])
const pending = ref(true)
const running = ref(false)
const exporting = ref(false)
const error = ref('')
const notice = ref('')
const gridKey = ref(0)
const isFullscreen = ref(false)

const queryConfig = computed(() => normalizeReportQueryConfig(report.value?.query_config))
const displayConfig = computed(() => normalizeReportDisplayConfig(report.value?.display_config))
const pageSize = computed(() => displayConfig.value.pageSize || 25)
const columnDefs = computed(() => reportColumnDefs(queryConfig.value.fields))
const rowCountLabel = computed(() => `${rows.value.length} row${rows.value.length === 1 ? '' : 's'}`)

const gridAdapter = computed(() => createLocalDataAdapter(() => rows.value))

useHead({
  title: computed(() => report.value?.name ? `${report.value.name} · Report` : 'Report'),
})

function resizeGrid() {
  nextTick(() => {
    requestAnimationFrame(() => {
      const api = gridRef.value?.getApi?.()
      api?.sizeColumnsToFit?.()
    })
  })
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
  resizeGrid()
}

async function loadReport() {
  if (!activeOrganization.value?.id || !reportId.value) {
    report.value = null
    return
  }
  pending.value = true
  error.value = ''
  try {
    const res = await authedFetch(`/api/reports/${reportId.value}`, {
      query: { organizationId: activeOrganization.value.id },
    })
    report.value = res.item
    await loadData()
  }
  catch (err) {
    error.value = err?.data?.statusMessage || err?.message || 'Failed to load report'
    report.value = null
    rows.value = []
  }
  finally {
    pending.value = false
  }
}

async function loadData() {
  if (!activeOrganization.value?.id || !report.value) return
  running.value = true
  error.value = ''
  try {
    const res = await authedFetch('/api/reports/query', {
      method: 'POST',
      body: {
        organizationId: activeOrganization.value.id,
        reportId: reportId.value,
      },
    })
    rows.value = res.rows || []
    gridKey.value += 1
    resizeGrid()
  }
  catch (err) {
    error.value = err?.data?.statusMessage || err?.message || 'Query failed'
    rows.value = []
  }
  finally {
    running.value = false
  }
}

/**
 * @param {'json'|'excel'} format
 */
async function exportReport(format) {
  if (!activeOrganization.value?.id || !reportId.value) return
  exporting.value = true
  error.value = ''
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    const res = await fetch('/api/reports/export', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({
        organizationId: activeOrganization.value.id,
        reportId: reportId.value,
        format,
      }),
    })

    if (!res.ok) {
      let message = 'Export failed'
      try {
        const json = await res.json()
        message = json?.statusMessage || json?.message || message
      }
      catch {
        // ignore
      }
      throw new Error(message)
    }

    const blob = await res.blob()
    const safeName = String(report.value?.name || 'report').replace(/[^\w\-]+/g, '_').slice(0, 80)
    const filename = format === 'excel' ? `${safeName}.xlsx` : `${safeName}.json`
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }
  catch (err) {
    error.value = err?.message || 'Export failed'
  }
  finally {
    exporting.value = false
  }
}

let gridResizeObserver = null

function setupGridResizeObserver() {
  if (!import.meta.client || gridResizeObserver || !gridShellRef.value) return
  if (typeof ResizeObserver === 'undefined') return
  gridResizeObserver = new ResizeObserver(() => resizeGrid())
  gridResizeObserver.observe(gridShellRef.value)
}

onMounted(() => {
  if (!import.meta.client) return
  document.addEventListener('fullscreenchange', onFullscreenChange)
  document.addEventListener('webkitfullscreenchange', onFullscreenChange)
})

watch(
  () => report.value,
  () => {
    nextTick(() => {
      setupGridResizeObserver()
      resizeGrid()
    })
  },
)

onBeforeUnmount(() => {
  if (!import.meta.client) return
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  document.removeEventListener('webkitfullscreenchange', onFullscreenChange)
  gridResizeObserver?.disconnect()
  gridResizeObserver = null
})

watch(
  () => [activeOrganization.value?.id, reportId.value],
  () => loadReport(),
  { immediate: true },
)
</script>

<style scoped>
.report-view {
  display: flex;
  flex-direction: column;
  /* Explicit height so child grid height: 100% resolves (min-height alone collapses). */
  height: calc(100vh - 3.5rem);
  min-height: calc(100vh - 3.5rem);
  box-sizing: border-box;
}

.report-view__grid {
  flex: 1 1 0;
  min-height: 0;
  overflow: hidden;
}

.report-view--fullscreen {
  display: flex;
  flex-direction: column;
  max-width: none !important;
  width: 100%;
  height: 100vh;
  max-height: 100vh;
  min-height: 100vh;
  margin: 0;
  padding: 0.5rem 0.75rem;
  background: var(--surface);
}

.report-view--fullscreen .report-view__header {
  position: relative;
  z-index: 10;
}

.report-view--fullscreen .report-view__grid {
  margin-top: 0.5rem;
  flex: 1 1 auto;
  min-height: 0;
}
</style>
