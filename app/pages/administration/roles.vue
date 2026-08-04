<template>
  <div class="mx-auto w-full max-w-4xl flex-1 px-6 py-12 lg:px-8">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="font-display text-3xl font-semibold text-[var(--ink)]">Roles</h1>
        <p class="mt-2 text-sm text-[var(--mute)]">
          Organization:
          <span class="text-[var(--accent-ink)]">{{ activeOrganization?.name || '—' }}</span>
        </p>
      </div>
      <NuxtLink to="/administration" class="btn-secondary !px-4 !py-2">Back</NuxtLink>
    </div>

    <form class="panel mt-8 flex flex-col gap-3 p-5 sm:flex-row sm:items-end" @submit.prevent="createRole">
      <div class="flex-1">
        <label class="text-sm font-medium text-[var(--ink)]">New role name</label>
        <input
          v-model="name"
          required
          class="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)]"
        >
      </div>
      <div class="flex-[1.4]">
        <label class="text-sm font-medium text-[var(--ink)]">Description</label>
        <input
          v-model="description"
          class="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)]"
        >
      </div>
      <button type="submit" class="btn-primary !px-4 !py-2">Add role</button>
    </form>

    <p v-if="errorMessage" class="mt-3 text-sm text-[var(--danger)]">{{ errorMessage }}</p>

    <ul class="mt-6 space-y-3">
      <li
        v-for="role in roles"
        :key="role.id"
        class="panel flex flex-wrap items-center justify-between gap-3 px-4 py-3"
      >
        <div>
          <p class="font-medium text-[var(--ink)]">
            {{ role.name }}
            <span v-if="role.is_system" class="text-xs text-[var(--mute)]">(system)</span>
          </p>
          <p class="text-sm text-[var(--mute)]">{{ role.description || '—' }}</p>
        </div>
        <button
          v-if="!role.is_system"
          type="button"
          class="text-sm text-[var(--danger)]"
          @click="removeRole(role.id)"
        >
          Delete
        </button>
      </li>
    </ul>
  </div>
</template>

<script setup>
definePageMeta({
  layout: 'plain',
  middleware: ['auth', 'admin'],
})

useHead({ title: 'Admin Roles' })

const supabase = useSupabase()
const { activeOrganizationId, activeOrganization } = useOrganization()

const roles = ref([])
const name = ref('')
const description = ref('')
const errorMessage = ref('')

const load = async () => {
  const orgId = activeOrganizationId.value
  if (!orgId) return
  const { data, error } = await supabase
    .from('roles')
    .select('id, name, description, is_system')
    .eq('organization_id', orgId)
    .order('name')
  if (error) {
    errorMessage.value = error.message
    return
  }
  roles.value = data || []
}

watch(activeOrganizationId, load, { immediate: true })

const createRole = async () => {
  errorMessage.value = ''
  const { error } = await supabase.from('roles').insert({
    organization_id: activeOrganizationId.value,
    name: name.value.trim(),
    description: description.value.trim() || null,
  })
  if (error) {
    errorMessage.value = error.message
    return
  }
  name.value = ''
  description.value = ''
  await load()
}

const removeRole = async (id) => {
  errorMessage.value = ''
  const { error } = await supabase.from('roles').delete().eq('id', id)
  if (error) {
    errorMessage.value = error.message
    return
  }
  await load()
}
</script>
