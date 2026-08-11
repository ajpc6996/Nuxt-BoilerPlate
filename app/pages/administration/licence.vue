<template>
  <div class="mx-auto w-full max-w-6xl flex-1 px-6 py-10 lg:px-8">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="font-display text-3xl font-semibold text-[var(--ink)]">
          Licence & usage
        </h1>
        <p class="mt-2 text-sm text-[var(--mute)]">
          Organization:
          <span class="text-[var(--accent-ink)]">{{ activeOrganization?.name || '—' }}</span>
        </p>
      </div>
      <NuxtLink
        to="/administration"
        class="btn-secondary !px-4 !py-2"
      >
        Back
      </NuxtLink>
    </div>

    <p
      v-if="error"
      class="mt-4 rounded-md border border-[var(--danger)] px-3 py-2 text-sm text-[var(--danger)]"
    >
      {{ error }}
    </p>

    <div
      v-if="pending"
      class="mt-8 text-sm text-[var(--mute)]"
    >
      Loading licence…
    </div>

    <template v-else-if="licence">
      <div
        class="panel mt-8 p-5"
        :class="bannerClass"
      >
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p class="text-[10px] uppercase tracking-wide text-[var(--mute-soft)]">
              Plan
            </p>
            <h2 class="font-display text-2xl font-semibold text-[var(--ink)]">
              {{ licence.planName || licence.planKey }}
            </h2>
            <p class="mt-1 text-sm text-[var(--mute)]">
              Status: <span class="text-[var(--ink)]">{{ licence.status }}</span>
              <span v-if="licence.currentPeriodEnd">
                · period ends {{ formatDate(licence.currentPeriodEnd) }}
              </span>
              <span v-else-if="licence.trialEndsAt">
                · trial ends {{ formatDate(licence.trialEndsAt) }}
              </span>
            </p>
            <p
              v-if="licence.status === 'past_due' && licence.graceEndsAt"
              class="mt-2 text-sm text-[var(--danger)]"
            >
              Grace period ends {{ formatDate(licence.graceEndsAt) }}. Renew to avoid feature lock.
            </p>
            <p
              v-if="licence.status === 'locked'"
              class="mt-2 text-sm text-[var(--danger)]"
            >
              Features are locked.
              <span v-if="licence.dataPurgedAt">
                Retained data was purged on {{ formatDate(licence.dataPurgedAt) }}.
              </span>
              <span v-else-if="licence.dataPurgeAt">
                Data retained until {{ formatDate(licence.dataPurgeAt) }}, then purged automatically.
              </span>
              Purchase additional capacity to restore access.
            </p>
            <p
              v-if="licence.features?.mfaRequired"
              class="mt-2 text-xs text-[var(--mute)]"
            >
              Licence requires MFA — organization MFA mode is forced to required.
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            <NuxtLink
              to="/administration/billing"
              class="btn-primary !px-4 !py-2"
            >
              Buy more capacity
            </NuxtLink>
            <button
              type="button"
              class="btn-secondary !px-4 !py-2"
              :disabled="portalBusy"
              @click="openPortal"
            >
              {{ portalBusy ? 'Opening…' : 'Billing portal' }}
            </button>
          </div>
        </div>
      </div>

      <section class="mt-8">
        <h3 class="text-sm font-semibold text-[var(--ink)]">
          Usage this period
        </h3>
        <p class="mt-1 text-xs text-[var(--mute)]">
          Period start {{ usage?.periodStart || '—' }} (UTC month). Hard limits apply on create/run.
        </p>
        <ul class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <li
            v-for="row in usageRows"
            :key="row.key"
            class="panel px-4 py-3"
          >
            <p class="text-[10px] uppercase tracking-wide text-[var(--mute-soft)]">
              {{ row.label }}
            </p>
            <p class="mt-1 font-mono text-lg text-[var(--ink)]">
              {{ row.used }}
              <span class="text-sm text-[var(--mute)]">/ {{ formatLimit(row.limit) }}</span>
            </p>
          </li>
        </ul>
      </section>

      <section class="mt-8">
        <h3 class="text-sm font-semibold text-[var(--ink)]">
          Feature flags
        </h3>
        <ul class="mt-3 flex flex-wrap gap-2">
          <li
            v-for="(on, key) in licence.features"
            :key="key"
            class="rounded-md border px-2.5 py-1 text-xs"
            :class="on
              ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)]'
              : 'border-[var(--border)] text-[var(--mute)]'"
          >
            {{ key }}
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>

<script setup>
definePageMeta({
  layout: 'app',
  middleware: ['auth', 'admin'],
})

useHead({ title: 'Licence & usage' })

const { activeOrganization } = useOrganization()
const authedFetch = useAuthedFetch()

const pending = ref(true)
const error = ref('')
const licence = ref(null)
const usage = ref(null)
const portalBusy = ref(false)

const bannerClass = computed(() => {
  const s = licence.value?.status
  if (s === 'locked' || s === 'canceled') return 'border-[var(--danger)]'
  if (s === 'past_due') return 'border-[var(--danger)]'
  return ''
})

const usageRows = computed(() => {
  const limits = licence.value?.limits || {}
  const u = usage.value || {}
  return [
    { key: 'users', label: 'Active users', used: u.usersActive ?? 0, limit: limits.maxUsers },
    { key: 'connections', label: 'Connections', used: u.connections ?? 0, limit: limits.maxConnections },
    { key: 'sources', label: 'Data sources', used: u.dataSources ?? 0, limit: limits.maxDataSources },
    { key: 'dashboards', label: 'Dashboards', used: u.dashboards ?? 0, limit: limits.maxDashboards },
    { key: 'reports', label: 'Reports', used: u.reports ?? 0, limit: limits.maxReports },
    {
      key: 'ingest',
      label: 'Ingest rows (month)',
      used: u.ingestRowsPeriod ?? 0,
      limit: limits.maxIngestRowsPerMonth,
    },
  ]
})

function formatLimit(n) {
  if (n === -1 || n == null) return '∞'
  return String(n)
}

function formatDate(value) {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleString()
  }
  catch {
    return String(value)
  }
}

async function openPortal() {
  if (!activeOrganization.value?.id) return
  portalBusy.value = true
  error.value = ''
  try {
    const res = await authedFetch('/api/billing/portal/session', {
      method: 'POST',
      body: { organizationId: activeOrganization.value.id },
    })
    await navigateTo(res.portalPath)
  }
  catch (err) {
    error.value = err?.data?.statusMessage || err?.message || 'Failed to open portal'
  }
  finally {
    portalBusy.value = false
  }
}

async function load() {
  if (!activeOrganization.value?.id) {
    licence.value = null
    usage.value = null
    pending.value = false
    return
  }
  pending.value = true
  error.value = ''
  try {
    const res = await authedFetch('/api/licence/current', {
      query: { organizationId: activeOrganization.value.id },
    })
    licence.value = res.licence
    usage.value = res.usage
  }
  catch (err) {
    error.value = err?.data?.statusMessage || err?.message || 'Failed to load licence'
    licence.value = null
    usage.value = null
  }
  finally {
    pending.value = false
  }
}

watch(() => activeOrganization.value?.id, () => load(), { immediate: true })
</script>
