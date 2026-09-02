<template>
  <div class="mx-auto w-full max-w-6xl flex-1 px-6 py-10 lg:px-8">
    <div>
      <h1 class="font-display text-3xl font-semibold text-[var(--ink)]">Organizations</h1>
      <p class="mt-2 text-sm text-[var(--mute)]">
        Platform only. Creating an org adds you as an Admin member and assigns the default trial licence.
      </p>
    </div>

    <AppListToolbar>
      <AppListFilter
        v-model="listFilter"
        placeholder="Filter organizations…"
      />
      <button
        type="button"
        class="btn-primary !px-4 !py-2"
        @click="showAdd = !showAdd"
      >
        {{ showAdd ? 'Close' : 'Add' }}
      </button>
      <NuxtLink
        to="/administration"
        class="btn-secondary !px-4 !py-2"
      >
        Back
      </NuxtLink>
    </AppListToolbar>

    <form
      v-if="showAdd"
      class="panel mt-8 grid gap-3 p-5 sm:grid-cols-3"
      @submit.prevent="createOrg"
    >
      <div>
        <label class="text-sm font-medium text-[var(--ink)]">Name</label>
        <input
          v-model="name"
          required
          class="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)]"
        >
      </div>
      <div>
        <label class="text-sm font-medium text-[var(--ink)]">Slug</label>
        <input
          v-model="slug"
          required
          pattern="[a-z0-9-]+"
          class="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)]"
        >
      </div>
      <div>
        <label class="text-sm font-medium text-[var(--ink)]">MFA mode</label>
        <select
          v-model="mfaMode"
          class="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)]"
        >
          <option value="off">off</option>
          <option value="optional">optional</option>
          <option value="required">required</option>
        </select>
      </div>
      <button
        type="submit"
        class="btn-primary sm:col-span-3 !px-4 !py-2"
        :disabled="busy"
      >
        {{ busy ? 'Creating…' : 'Create organization' }}
      </button>
    </form>

    <section
      v-if="settings"
      class="panel mt-8 grid gap-3 p-5 sm:grid-cols-4"
    >
      <h2 class="sm:col-span-4 text-sm font-semibold text-[var(--ink)]">
        Licence policy (platform)
      </h2>
      <div>
        <label class="text-[10px] uppercase tracking-wide text-[var(--mute-soft)]">Grace days</label>
        <input
          v-model.number="settingsForm.graceDays"
          type="number"
          min="0"
          max="90"
          class="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm text-[var(--ink)]"
        >
      </div>
      <div>
        <label class="text-[10px] uppercase tracking-wide text-[var(--mute-soft)]">Data retention days</label>
        <input
          v-model.number="settingsForm.dataRetentionDays"
          type="number"
          min="0"
          max="365"
          class="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm text-[var(--ink)]"
        >
      </div>
      <div>
        <label class="text-[10px] uppercase tracking-wide text-[var(--mute-soft)]">Renew refresh hours</label>
        <input
          v-model.number="settingsForm.renewRefreshHours"
          type="number"
          min="0"
          max="720"
          class="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm text-[var(--ink)]"
        >
      </div>
      <div class="flex items-end gap-2 sm:col-span-4 sm:justify-end">
        <button
          type="button"
          class="btn-secondary !px-3 !py-1.5 text-sm"
          :disabled="settingsBusy"
          @click="saveSettings"
        >
          {{ settingsBusy ? 'Saving…' : 'Save policy' }}
        </button>
        <button
          type="button"
          class="btn-secondary !px-3 !py-1.5 text-sm"
          :disabled="purgeBusy"
          @click="runDuePurges"
        >
          {{ purgeBusy ? 'Purging…' : 'Run due data purges' }}
        </button>
      </div>
    </section>

    <section
      v-if="ingestStatus"
      class="panel mt-8 p-5"
    >
      <h2 class="text-sm font-semibold text-[var(--ink)]">
        Ingest warehouse (platform)
      </h2>
      <p class="mt-1 text-sm text-[var(--mute)]">
        Organizations with ingest backend <span class="font-mono">local</span> route
        <span class="font-mono">ingest.*</span> and <span class="font-mono">staged.*</span>
        to the server’s local Postgres (<span class="font-mono">INGEST_DATABASE_URL</span>).
        Default is hosted Supabase.
      </p>
      <p
        class="mt-3 text-sm"
        :class="ingestStatus.reachable
          ? 'text-[var(--accent-ink)]'
          : (ingestStatus.configured ? 'text-[var(--danger)]' : 'text-[var(--mute)]')"
      >
        {{ ingestStatus.message }}
      </p>
      <button
        type="button"
        class="btn-secondary mt-3 !px-3 !py-1.5 text-sm"
        :disabled="ingestStatusBusy"
        @click="loadIngestStatus"
      >
        {{ ingestStatusBusy ? 'Checking…' : 'Recheck local warehouse' }}
      </button>
    </section>

    <p
      v-if="errorMessage"
      class="mt-3 text-sm text-[var(--danger)]"
    >
      {{ errorMessage }}
    </p>
    <p
      v-if="notice"
      class="mt-3 text-sm text-[var(--accent-ink)]"
    >
      {{ notice }}
    </p>

    <ul class="mt-6 space-y-3">
      <li
        v-for="org in filteredOrgs"
        :key="org.id"
        class="panel px-4 py-3"
      >
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p class="font-medium text-[var(--ink)]">{{ org.name }}</p>
            <p class="text-sm text-[var(--mute)]">
              {{ org.slug }} · MFA {{ org.mfa_mode }}
              · Ingest {{ org.ingest_backend || 'supabase' }}
              <span v-if="licenceMap[org.id]">
                · {{ licenceMap[org.id].planKey }} ({{ licenceMap[org.id].status }})
              </span>
            </p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <select
              class="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-sm text-[var(--ink)]"
              :value="org.ingest_backend || 'supabase'"
              :disabled="ingestBusyId === org.id"
              title="Ingest warehouse backend"
              @change="(e) => updateIngestBackend(org, e.target.value)"
            >
              <option value="supabase">ingest: supabase</option>
              <option value="local">ingest: local</option>
            </select>
            <select
              class="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-sm text-[var(--ink)]"
              :value="org.mfa_mode"
              @change="(e) => updateMfa(org.id, e.target.value)"
            >
              <option value="off">off</option>
              <option value="optional">optional</option>
              <option value="required">required</option>
            </select>
            <select
              class="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-sm text-[var(--ink)]"
              :value="assignDraft[org.id]?.planKey || licenceMap[org.id]?.planKey || 'trial'"
              @change="(e) => setAssignField(org.id, 'planKey', e.target.value)"
            >
              <option
                v-for="plan in plans"
                :key="plan.key"
                :value="plan.key"
              >
                {{ plan.name }}
              </option>
            </select>
            <input
              type="number"
              min="1"
              max="365"
              class="w-20 rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-sm text-[var(--ink)]"
              :value="assignDraft[org.id]?.periodDays || 30"
              title="Period days"
              @change="(e) => setAssignField(org.id, 'periodDays', Number(e.target.value))"
            >
            <button
              type="button"
              class="btn-secondary !px-3 !py-1.5"
              :disabled="assignBusyId === org.id"
              @click="assignLicence(org)"
            >
              {{ assignBusyId === org.id ? '…' : 'Assign' }}
            </button>
            <button
              type="button"
              class="btn-secondary !px-3 !py-1.5"
              @click="activate(org)"
            >
              Set active
            </button>
            <button
              type="button"
              class="btn-secondary !px-3 !py-1.5"
              @click="goUsers(org)"
            >
              Users
            </button>
          </div>
        </div>
      </li>
      <li
        v-if="!filteredOrgs.length"
        class="py-8 text-center text-sm text-[var(--mute)]"
      >
        {{ orgs.length ? 'No organizations match this filter.' : 'No organizations yet.' }}
      </li>
    </ul>
  </div>
</template>

<script setup>
definePageMeta({
  layout: 'app',
  middleware: ['auth', 'platform-admin'],
})

useHead({ title: 'Platform Organizations' })

const supabase = useSupabase()
const authedFetch = useAuthedFetch()
const nuxtApp = useNuxtApp()
const { confirm } = useAppConfirm()
const { setActiveOrganizationAsPlatform } = useOrganization()

const orgs = ref([])
const plans = ref([])
const settings = ref(null)
const settingsForm = reactive({
  graceDays: 3,
  dataRetentionDays: 15,
  renewRefreshHours: 72,
})
const licenceMap = ref({})
const assignDraft = ref({})
const listFilter = ref('')
const showAdd = ref(false)
const name = ref('')
const slug = ref('')
const mfaMode = ref('optional')
const errorMessage = ref('')
const notice = ref('')
const busy = ref(false)
const settingsBusy = ref(false)
const purgeBusy = ref(false)
const assignBusyId = ref('')
const ingestBusyId = ref('')
const ingestStatus = ref(null)
const ingestStatusBusy = ref(false)

const filteredOrgs = computed(() => {
  const q = listFilter.value.trim().toLowerCase()
  if (!q) return orgs.value
  return orgs.value.filter((org) => {
    const lic = licenceMap.value[org.id]
    const hay = [org.name, org.slug, org.mfa_mode, org.ingest_backend, lic?.planKey, lic?.status]
      .map((v) => String(v || '').toLowerCase())
      .join(' ')
    return hay.includes(q)
  })
})

function setAssignField(orgId, key, value) {
  assignDraft.value = {
    ...assignDraft.value,
    [orgId]: {
      planKey: assignDraft.value[orgId]?.planKey || licenceMap.value[orgId]?.planKey || 'trial',
      periodDays: assignDraft.value[orgId]?.periodDays || 30,
      [key]: value,
    },
  }
}

const loadPlans = async () => {
  const res = await authedFetch('/api/platform/plans')
  plans.value = res.items || []
  settings.value = res.settings || null
  if (res.settings) {
    settingsForm.graceDays = res.settings.graceDays
    settingsForm.dataRetentionDays = res.settings.dataRetentionDays
    settingsForm.renewRefreshHours = res.settings.renewRefreshHours
  }
}

const loadLicences = async () => {
  const next = {}
  await Promise.all(
    (orgs.value || []).map(async (org) => {
      try {
        const res = await authedFetch(`/api/platform/organizations/${org.id}/licence`)
        next[org.id] = {
          planKey: res.licence?.planKey,
          status: res.licence?.status,
        }
      }
      catch {
        // org may predate migration
      }
    }),
  )
  licenceMap.value = next
}

const loadIngestStatus = async () => {
  ingestStatusBusy.value = true
  try {
    ingestStatus.value = await authedFetch('/api/platform/ingest-backend/status')
  }
  catch (err) {
    ingestStatus.value = {
      configured: false,
      reachable: false,
      message: err?.data?.statusMessage || err?.message || 'Failed to check local warehouse',
    }
  }
  finally {
    ingestStatusBusy.value = false
  }
}

const load = async () => {
  const { data, error } = await supabase
    .from('organizations')
    .select('id, name, slug, mfa_mode, ingest_backend, created_at')
    .order('name')
  if (error) {
    errorMessage.value = error.message
    return
  }
  orgs.value = data || []
  await loadLicences()
}

onMounted(async () => {
  try {
    await Promise.all([loadPlans(), loadIngestStatus()])
  }
  catch (err) {
    errorMessage.value = err?.data?.statusMessage || err?.message || 'Failed to load plans'
  }
  await load()
})

const createOrg = async () => {
  errorMessage.value = ''
  notice.value = ''
  busy.value = true
  try {
    const res = await authedFetch('/api/platform/organizations', {
      method: 'POST',
      body: {
        name: name.value.trim(),
        slug: slug.value.trim().toLowerCase(),
        mfaMode: mfaMode.value,
      },
    })

    name.value = ''
    slug.value = ''
    mfaMode.value = 'optional'
    showAdd.value = false
    notice.value = `Created ${res.item.name} — trial licence assigned`

    if (typeof nuxtApp.$hydrateAuthState === 'function') {
      await nuxtApp.$hydrateAuthState()
    }
    await setActiveOrganizationAsPlatform(res.item)
    await load()
  }
  catch (err) {
    errorMessage.value = err?.data?.statusMessage || err?.message || 'Create failed'
  }
  finally {
    busy.value = false
  }
}

const saveSettings = async () => {
  settingsBusy.value = true
  errorMessage.value = ''
  notice.value = ''
  try {
    const res = await authedFetch('/api/platform/licence-settings', {
      method: 'PUT',
      body: { ...settingsForm },
    })
    settings.value = res.settings
    notice.value = 'Licence policy saved'
  }
  catch (err) {
    errorMessage.value = err?.data?.statusMessage || err?.message || 'Save failed'
  }
  finally {
    settingsBusy.value = false
  }
}

const runDuePurges = async () => {
  purgeBusy.value = true
  errorMessage.value = ''
  notice.value = ''
  try {
    const res = await authedFetch('/api/platform/licence-purge', {
      method: 'POST',
      body: {},
    })
    notice.value = `Purge batch: ${res.processed || 0} organization(s) processed`
  }
  catch (err) {
    errorMessage.value = err?.data?.statusMessage || err?.message || 'Purge failed'
  }
  finally {
    purgeBusy.value = false
  }
}

const assignLicence = async (org) => {
  assignBusyId.value = org.id
  errorMessage.value = ''
  notice.value = ''
  try {
    const draft = assignDraft.value[org.id] || {}
    await authedFetch(`/api/platform/organizations/${org.id}/licence`, {
      method: 'PUT',
      body: {
        planKey: draft.planKey || licenceMap.value[org.id]?.planKey || 'trial',
        periodDays: draft.periodDays || 30,
        status: draft.planKey === 'trial' ? 'trialing' : 'active',
      },
    })
    notice.value = `Licence updated for ${org.name}`
    await loadLicences()
  }
  catch (err) {
    errorMessage.value = err?.data?.statusMessage || err?.message || 'Assign failed'
  }
  finally {
    assignBusyId.value = ''
  }
}

const updateMfa = async (id, mode) => {
  errorMessage.value = ''
  notice.value = ''
  try {
    await authedFetch(`/api/platform/organizations/${id}/mfa`, {
      method: 'PUT',
      body: { mfaMode: mode },
    })
    await load()
  }
  catch (err) {
    errorMessage.value = err?.data?.statusMessage || err?.message || 'MFA update failed'
    await load()
  }
}

const updateIngestBackend = async (org, mode) => {
  const next = String(mode || 'supabase').trim()
  const prev = org.ingest_backend || 'supabase'
  if (next === prev) return

  if (next === 'local') {
    const ok = await confirm({
      title: 'Switch to local ingest?',
      message: `${org.name} will read/write ingest.* and staged.* on the server’s local Postgres (INGEST_DATABASE_URL). Existing hosted ingest data for this org will not be migrated automatically.`,
      confirmLabel: 'Use local',
    })
    if (!ok) {
      await load()
      return
    }
  }

  ingestBusyId.value = org.id
  errorMessage.value = ''
  notice.value = ''
  try {
    await authedFetch(`/api/platform/organizations/${org.id}/ingest-backend`, {
      method: 'PUT',
      body: { ingestBackend: next },
    })
    notice.value = `Ingest backend for ${org.name} set to ${next}`
    await load()
  }
  catch (err) {
    errorMessage.value = err?.data?.statusMessage || err?.message || 'Ingest backend update failed'
    await load()
  }
  finally {
    ingestBusyId.value = ''
  }
}

const activate = async (org) => {
  await setActiveOrganizationAsPlatform(org)
  notice.value = `Active organization set to ${org.name}`
}

const goUsers = async (org) => {
  await setActiveOrganizationAsPlatform(org)
  await navigateTo('/administration/users')
}
</script>
