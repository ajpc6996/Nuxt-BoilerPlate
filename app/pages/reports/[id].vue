<template>
  <div class="mx-auto w-full max-w-6xl flex-1 px-6 py-10 lg:px-8">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div class="min-w-0">
        <h1 class="font-display text-3xl font-semibold tracking-tight text-[var(--ink)]">
          {{ report?.name || (pending ? 'Loading…' : 'Report') }}
        </h1>
        <p
          v-if="report?.description"
          class="mt-2 max-w-2xl text-sm text-[var(--mute)]"
        >
          {{ report.description }}
        </p>
        <p
          v-if="report"
          class="mt-2 text-[10px] uppercase tracking-wide text-[var(--mute-soft)]"
        >
          {{ report.visibility }} · {{ rowCountLabel }}
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
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
        <NuxtLink
          v-if="canConfigure"
          :to="`/reports/configure/${reportId}`"
          class="btn-secondary !px-3 !py-1.5 text-sm"
        >
          Configure
        </NuxtLink>
        <NuxtLink
          to="/reports"
          class="btn-secondary !px-3 !py-1.5 text-sm"
        >
          All reports
        </NuxtLink>
      </div>
    </div>

    <p
      v-if="error"
      class="panel mt-6 border-[var(--danger)] px-4 py-3 text-sm text-[var(--danger)]"
    >
      {{ error }}
    </p>

    <div
      v-if="pending"
      class="mt-8 text-sm text-[var(--mute)]"
    >
      Loading report…
    </div>

    <div
      v-else-if="report"
      class="panel mt-6 overflow-hidden p-2"
    >
      <ClientOnly>
        <AppDataGrid
          :key="gridKey"
          :column-defs="columnDefs"
          :adapter="gridAdapter"
          height="min(70vh, 640px)"
          :pagination="true"
          :pagination-page-size="pageSize"
        />
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
const { allowsRoles } = usePermissions()
const authedFetch = useAuthedFetch()
const supabase = useSupabase()

const report = ref(null)
const rows = ref([])
const pending = ref(true)
const running = ref(false)
const exporting = ref(false)
const error = ref('')
const gridKey = ref(0)

const canConfigure = computed(() => allowsRoles(['platform', 'orgAdmin']))
const queryConfig = computed(() => normalizeReportQueryConfig(report.value?.query_config))
const displayConfig = computed(() => normalizeReportDisplayConfig(report.value?.display_config))
const pageSize = computed(() => displayConfig.value.pageSize || 25)
const columnDefs = computed(() => reportColumnDefs(queryConfig.value.fields))
const rowCountLabel = computed(() => `${rows.value.length} row${rows.value.length === 1 ? '' : 's'}`)

const gridAdapter = computed(() => createLocalDataAdapter(() => rows.value))

useHead({
  title: computed(() => report.value?.name ? `${report.value.name} · Report` : 'Report'),
})

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

watch(
  () => [activeOrganization.value?.id, reportId.value],
  () => loadReport(),
  { immediate: true },
)
</script>
