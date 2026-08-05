<template>
  <div class="mx-auto w-full max-w-6xl flex-1 px-6 py-10 lg:px-8">
    <div>
      <h1 class="font-display text-3xl font-semibold text-[var(--ink)]">Organizations</h1>
      <p class="mt-2 text-sm text-[var(--mute)]">
        Platform only. Creating an org adds you as an active member with the Admin role.
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
        class="panel flex flex-wrap items-center justify-between gap-3 px-4 py-3"
      >
        <div>
          <p class="font-medium text-[var(--ink)]">{{ org.name }}</p>
          <p class="text-sm text-[var(--mute)]">
            {{ org.slug }} · MFA {{ org.mfa_mode }}
          </p>
        </div>
        <div class="flex items-center gap-2">
          <select
            class="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-sm text-[var(--ink)]"
            :value="org.mfa_mode"
            @change="(e) => updateMfa(org.id, e.target.value)"
          >
            <option value="off">off</option>
            <option value="optional">optional</option>
            <option value="required">required</option>
          </select>
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
const { setActiveOrganizationAsPlatform } = useOrganization()

const orgs = ref([])
const listFilter = ref('')
const showAdd = ref(false)
const name = ref('')
const slug = ref('')
const mfaMode = ref('optional')
const errorMessage = ref('')
const notice = ref('')
const busy = ref(false)

const filteredOrgs = computed(() => {
  const q = listFilter.value.trim().toLowerCase()
  if (!q) return orgs.value
  return orgs.value.filter((org) => {
    const hay = [org.name, org.slug, org.mfa_mode]
      .map((v) => String(v || '').toLowerCase())
      .join(' ')
    return hay.includes(q)
  })
})

const load = async () => {
  const { data, error } = await supabase
    .from('organizations')
    .select('id, name, slug, mfa_mode, created_at')
    .order('name')
  if (error) {
    errorMessage.value = error.message
    return
  }
  orgs.value = data || []
}

onMounted(load)

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
    notice.value = `Created ${res.item.name} — you are an Admin member`

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

const updateMfa = async (id, mode) => {
  errorMessage.value = ''
  const { error } = await supabase
    .from('organizations')
    .update({ mfa_mode: mode })
    .eq('id', id)
  if (error) {
    errorMessage.value = error.message
    return
  }
  await load()
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
