<template>
  <div class="mx-auto w-full max-w-6xl flex-1 px-6 py-12 lg:px-8">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="font-display text-3xl font-semibold text-[var(--ink)]">Users</h1>
        <p class="mt-2 text-sm text-[var(--mute)]">
          Organization:
          <span class="text-[var(--accent-ink)]">{{ activeOrganization?.name || '—' }}</span>
        </p>
      </div>
      <NuxtLink to="/administration" class="btn-secondary !px-4 !py-2">Back</NuxtLink>
    </div>

    <div class="mt-8 grid gap-6 lg:grid-cols-2">
      <form class="panel flex flex-col gap-3 p-5" @submit.prevent="inviteUser">
        <h2 class="font-display text-lg font-semibold text-[var(--ink)]">Invite by email</h2>
        <input
          v-model="inviteEmail"
          type="email"
          required
          placeholder="user@example.com"
          class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)]"
        >
        <button type="submit" class="btn-primary !px-4 !py-2" :disabled="busy">
          Send invite
        </button>
      </form>

      <form class="panel flex flex-col gap-3 p-5" @submit.prevent="createUser">
        <h2 class="font-display text-lg font-semibold text-[var(--ink)]">Create user + reset link</h2>
        <input
          v-model="createEmail"
          type="email"
          required
          placeholder="user@example.com"
          class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)]"
        >
        <input
          v-model="createName"
          type="text"
          placeholder="Full name"
          class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)]"
        >
        <button type="submit" class="btn-primary !px-4 !py-2" :disabled="busy">
          Create & email reset
        </button>
      </form>
    </div>

    <p v-if="notice" class="mt-4 text-sm text-[var(--accent-ink)]">{{ notice }}</p>
    <p v-if="errorMessage" class="mt-2 text-sm text-[var(--danger)]">{{ errorMessage }}</p>

    <div class="panel mt-8 overflow-x-auto">
      <table class="min-w-full text-left text-sm">
        <thead class="border-b border-[var(--border)] text-[var(--mute)]">
          <tr>
            <th class="px-4 py-3 font-medium">Name</th>
            <th class="px-4 py-3 font-medium">Email</th>
            <th class="px-4 py-3 font-medium">Status</th>
            <th class="px-4 py-3 font-medium">Roles</th>
            <th class="px-4 py-3 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in members"
            :key="row.id"
            class="border-b border-[var(--border-soft)]"
          >
            <td class="px-4 py-3 text-[var(--ink)]">{{ row.profiles?.full_name || '—' }}</td>
            <td class="px-4 py-3 text-[var(--mute)]">{{ row.profiles?.email }}</td>
            <td class="px-4 py-3">
              <select
                class="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[var(--ink)]"
                :value="row.status"
                @change="(e) => updateStatus(row, e.target.value)"
              >
                <option value="active">active</option>
                <option value="invited">invited</option>
                <option value="disabled">disabled</option>
              </select>
            </td>
            <td class="px-4 py-3">
              <div class="flex flex-col gap-1">
                <label
                  v-for="role in roles"
                  :key="role.id"
                  class="flex items-center gap-2 text-[var(--ink)]"
                >
                  <input
                    type="checkbox"
                    :checked="hasRole(row.user_id, role.id)"
                    @change="(e) => toggleRole(row.user_id, role.id, e.target.checked)"
                  >
                  {{ role.name }}
                </label>
              </div>
            </td>
            <td class="px-4 py-3">
              <button
                type="button"
                class="text-[var(--accent-ink)] hover:underline"
                @click="sendReset(row.profiles?.email)"
              >
                Reset password
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
definePageMeta({
  layout: 'plain',
  middleware: ['auth', 'admin'],
})

useHead({ title: 'Admin Users' })

const supabase = useSupabase()
const authedFetch = useAuthedFetch()
const { activeOrganizationId, activeOrganization } = useOrganization()

const members = ref([])
const roles = ref([])
const assignments = ref([])
const inviteEmail = ref('')
const createEmail = ref('')
const createName = ref('')
const busy = ref(false)
const notice = ref('')
const errorMessage = ref('')

const load = async () => {
  const orgId = activeOrganizationId.value
  if (!orgId) return

  const [membersRes, rolesRes, assignmentsRes] = await Promise.all([
    supabase
      .from('organization_members')
      .select('id, user_id, status, profiles(id, email, full_name)')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: true }),
    supabase
      .from('roles')
      .select('id, name, is_system')
      .eq('organization_id', orgId)
      .order('name'),
    supabase
      .from('user_roles')
      .select('id, user_id, role_id')
      .eq('organization_id', orgId),
  ])

  members.value = membersRes.data || []
  roles.value = rolesRes.data || []
  assignments.value = assignmentsRes.data || []
}

watch(activeOrganizationId, load, { immediate: true })

const hasRole = (userId, roleId) =>
  assignments.value.some((a) => a.user_id === userId && a.role_id === roleId)

const inviteUser = async () => {
  busy.value = true
  notice.value = ''
  errorMessage.value = ''
  try {
    await authedFetch('/api/admin/invite', {
      method: 'POST',
      body: {
        email: inviteEmail.value,
        organizationId: activeOrganizationId.value,
      },
    })
    notice.value = `Invite sent to ${inviteEmail.value}`
    inviteEmail.value = ''
    await load()
  } catch (err) {
    errorMessage.value = err?.data?.statusMessage || err.message
  } finally {
    busy.value = false
  }
}

const createUser = async () => {
  busy.value = true
  notice.value = ''
  errorMessage.value = ''
  try {
    await authedFetch('/api/admin/create-user', {
      method: 'POST',
      body: {
        email: createEmail.value,
        fullName: createName.value,
        organizationId: activeOrganizationId.value,
      },
    })
    notice.value = `User created; password reset email sent to ${createEmail.value}`
    createEmail.value = ''
    createName.value = ''
    await load()
  } catch (err) {
    errorMessage.value = err?.data?.statusMessage || err.message
  } finally {
    busy.value = false
  }
}

const updateStatus = async (row, status) => {
  errorMessage.value = ''
  const { error } = await supabase
    .from('organization_members')
    .update({ status })
    .eq('id', row.id)
  if (error) {
    errorMessage.value = error.message
    return
  }
  await load()
}

const toggleRole = async (userId, roleId, enabled) => {
  errorMessage.value = ''
  const orgId = activeOrganizationId.value
  if (enabled) {
    const { error } = await supabase.from('user_roles').insert({
      organization_id: orgId,
      user_id: userId,
      role_id: roleId,
    })
    if (error) errorMessage.value = error.message
  } else {
    const { error } = await supabase
      .from('user_roles')
      .delete()
      .eq('organization_id', orgId)
      .eq('user_id', userId)
      .eq('role_id', roleId)
    if (error) errorMessage.value = error.message
  }
  await load()
}

const sendReset = async (email) => {
  if (!email) return
  notice.value = ''
  errorMessage.value = ''
  try {
    await authedFetch('/api/admin/reset-password', {
      method: 'POST',
      body: {
        email,
        organizationId: activeOrganizationId.value,
      },
    })
    notice.value = `Password reset email sent to ${email}`
  } catch (err) {
    errorMessage.value = err?.data?.statusMessage || err.message
  }
}
</script>
