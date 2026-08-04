<template>
  <div class="mx-auto w-full max-w-4xl flex-1 px-6 py-12 lg:px-8">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <h1 class="font-display text-3xl font-semibold text-[var(--ink)]">Organizations</h1>
      <NuxtLink to="/platform" class="btn-secondary !px-4 !py-2">Back</NuxtLink>
    </div>

    <form class="panel mt-8 grid gap-3 p-5 sm:grid-cols-3" @submit.prevent="createOrg">
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
      <button type="submit" class="btn-primary sm:col-span-3 !px-4 !py-2">
        Create organization
      </button>
    </form>

    <p v-if="errorMessage" class="mt-3 text-sm text-[var(--danger)]">{{ errorMessage }}</p>
    <p v-if="notice" class="mt-3 text-sm text-[var(--accent-ink)]">{{ notice }}</p>

    <ul class="mt-6 space-y-3">
      <li
        v-for="org in orgs"
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
        </div>
      </li>
    </ul>
  </div>
</template>

<script setup>
definePageMeta({
  layout: 'plain',
  middleware: ['auth', 'platform-admin'],
})

useHead({ title: 'Platform Organizations' })

const supabase = useSupabase()
const { user } = useAuth()
const { setActiveOrganizationAsPlatform } = useOrganization()

const orgs = ref([])
const name = ref('')
const slug = ref('')
const mfaMode = ref('optional')
const errorMessage = ref('')
const notice = ref('')

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
  const { data, error } = await supabase
    .from('organizations')
    .insert({
      name: name.value.trim(),
      slug: slug.value.trim().toLowerCase(),
      mfa_mode: mfaMode.value,
      created_by: user.value?.id,
    })
    .select('id, name, slug, mfa_mode')
    .single()

  if (error) {
    errorMessage.value = error.message
    return
  }

  name.value = ''
  slug.value = ''
  mfaMode.value = 'optional'
  notice.value = `Created ${data.name}`
  await load()
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
</script>
