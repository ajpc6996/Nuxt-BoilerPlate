<template>
  <div class="mx-auto w-full max-w-6xl flex-1 px-6 py-10 lg:px-8">
    <div>
      <h1 class="font-display text-3xl font-semibold text-[var(--ink)]">Roles</h1>
      <p class="mt-2 text-sm text-[var(--mute)]">
        Organization:
        <span class="text-[var(--accent-ink)]">{{ activeOrganization?.name || '—' }}</span>
      </p>
    </div>

    <AppListToolbar>
      <AppListFilter
        v-model="listFilter"
        placeholder="Filter roles…"
      />
      <button
        type="button"
        class="btn-primary !px-4 !py-2"
        @click="openCreate"
      >
        {{ showForm && !editingId ? 'Close' : 'Add' }}
      </button>
      <NuxtLink
        to="/administration"
        class="btn-secondary !px-4 !py-2"
      >
        Back
      </NuxtLink>
    </AppListToolbar>

    <form
      v-if="showForm"
      class="panel mt-8 flex flex-col gap-3 p-5"
      @submit.prevent="saveRole"
    >
      <h2 class="font-display text-lg font-semibold text-[var(--ink)]">
        {{ editingId ? 'Edit role' : 'New role' }}
      </h2>
      <div class="grid gap-3 sm:grid-cols-2">
        <div>
          <label class="text-sm font-medium text-[var(--ink)]">Role name</label>
          <input
            v-model="name"
            required
            :disabled="editingIsSystem"
            class="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)] disabled:opacity-60"
          >
        </div>
        <div>
          <label class="text-sm font-medium text-[var(--ink)]">Description</label>
          <input
            v-model="description"
            :disabled="editingIsSystem"
            class="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)] disabled:opacity-60"
          >
        </div>
      </div>
      <div>
        <label class="text-sm font-medium text-[var(--ink)]">Users in this role</label>
        <MultiSelect
          v-model="selectedUserIds"
          class="mt-1 w-full"
          display="chip"
          filter
          show-clear
          append-to="body"
          :options="memberOptions"
          option-label="label"
          option-value="id"
          placeholder="Select users…"
        />
        <p class="mt-1 text-xs text-[var(--mute)]">
          {{ memberOptions.length ? 'Search and select one or more organization users.' : 'No users in this organization yet.' }}
        </p>
      </div>
      <div class="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          class="btn-secondary !px-4 !py-2"
          @click="closeForm"
        >
          Cancel
        </button>
        <button
          type="submit"
          class="btn-primary !px-4 !py-2"
          :disabled="busy"
        >
          {{ busy ? 'Saving…' : (editingId ? 'Save role' : 'Add role') }}
        </button>
      </div>
    </form>

    <p
      v-if="errorMessage"
      class="mt-3 text-sm text-[var(--danger)]"
    >
      {{ errorMessage }}
    </p>

    <ul class="mt-6 space-y-3">
      <li
        v-for="role in filteredRoles"
        :key="role.id"
        class="panel flex flex-wrap items-start justify-between gap-3 px-4 py-3"
      >
        <div class="min-w-0 flex-1">
          <p class="font-medium text-[var(--ink)]">
            {{ role.name }}
            <span
              v-if="role.is_system"
              class="text-xs text-[var(--mute)]"
            >(system)</span>
          </p>
          <p class="text-sm text-[var(--mute)]">{{ role.description || '—' }}</p>
          <p class="mt-1 text-xs text-[var(--mute-soft)]">
            {{ usersLabelForRole(role.id) }}
          </p>
        </div>
        <div class="flex shrink-0 gap-3">
          <button
            type="button"
            class="text-sm text-[var(--accent-ink)] hover:underline"
            @click="openEdit(role)"
          >
            Edit
          </button>
          <button
            v-if="!role.is_system"
            type="button"
            class="text-sm text-[var(--danger)]"
            @click="removeRole(role)"
          >
            Delete
          </button>
        </div>
      </li>
      <li
        v-if="!filteredRoles.length"
        class="py-8 text-center text-sm text-[var(--mute)]"
      >
        {{ roles.length ? 'No roles match this filter.' : 'No roles yet.' }}
      </li>
    </ul>
  </div>
</template>

<script setup>
import MultiSelect from 'openvue/multiselect'

definePageMeta({
  layout: 'app',
  middleware: ['auth', 'admin'],
})

useHead({ title: 'Admin Roles' })

const supabase = useSupabase()
const { confirm: appConfirm } = useAppConfirm()
const { activeOrganizationId, activeOrganization } = useOrganization()

const roles = ref([])
const members = ref([])
const assignments = ref([])
const listFilter = ref('')
const showForm = ref(false)
const editingId = ref(null)
const editingIsSystem = ref(false)
const name = ref('')
const description = ref('')
const selectedUserIds = ref([])
const busy = ref(false)
const errorMessage = ref('')

const memberOptions = computed(() =>
  members.value
    .filter((row) => row.status !== 'disabled' && row.user_id)
    .map((row) => {
      const email = row.profiles?.email || row.user_id
      const fullName = row.profiles?.full_name
      return {
        id: row.user_id,
        label: fullName ? `${fullName} (${email})` : email,
      }
    }),
)

const filteredRoles = computed(() => {
  const q = listFilter.value.trim().toLowerCase()
  if (!q) return roles.value
  return roles.value.filter((role) => {
    const users = usersForRole(role.id).join(' ')
    const hay = [role.name, role.description, role.is_system ? 'system' : '', users]
      .map((v) => String(v || '').toLowerCase())
      .join(' ')
    return hay.includes(q)
  })
})

function usersForRole(roleId) {
  const ids = assignments.value
    .filter((a) => a.role_id === roleId)
    .map((a) => a.user_id)
  return memberOptions.value
    .filter((opt) => ids.includes(opt.id))
    .map((opt) => opt.label)
}

function usersLabelForRole(roleId) {
  const labels = usersForRole(roleId)
  if (!labels.length) return 'No users assigned'
  if (labels.length <= 3) return labels.join(', ')
  return `${labels.slice(0, 3).join(', ')} +${labels.length - 3} more`
}

function resetForm() {
  editingId.value = null
  editingIsSystem.value = false
  name.value = ''
  description.value = ''
  selectedUserIds.value = []
}

function closeForm() {
  showForm.value = false
  resetForm()
}

function openCreate() {
  if (showForm.value && !editingId.value) {
    closeForm()
    return
  }
  resetForm()
  showForm.value = true
}

function openEdit(role) {
  editingId.value = role.id
  editingIsSystem.value = Boolean(role.is_system)
  name.value = role.name
  description.value = role.description || ''
  selectedUserIds.value = assignments.value
    .filter((a) => a.role_id === role.id)
    .map((a) => a.user_id)
  showForm.value = true
}

const load = async () => {
  const orgId = activeOrganizationId.value
  if (!orgId) return

  const [rolesRes, membersRes, assignmentsRes] = await Promise.all([
    supabase
      .from('roles')
      .select('id, name, description, is_system')
      .eq('organization_id', orgId)
      .order('name'),
    supabase
      .from('organization_members')
      .select('id, user_id, status, profiles(id, email, full_name)')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: true }),
    supabase
      .from('user_roles')
      .select('id, user_id, role_id')
      .eq('organization_id', orgId),
  ])

  roles.value = rolesRes.data || []
  members.value = membersRes.data || []
  assignments.value = assignmentsRes.data || []

  const loadErr = rolesRes.error || membersRes.error || assignmentsRes.error
  if (loadErr) {
    errorMessage.value = loadErr.message
  }
}

watch(activeOrganizationId, () => {
  closeForm()
  load()
}, { immediate: true })

/**
 * @param {string} roleId
 * @param {string[]} userIds
 */
async function syncRoleUsers(roleId, userIds) {
  const orgId = activeOrganizationId.value
  const next = [...new Set((userIds || []).filter(Boolean))]
  const current = assignments.value
    .filter((a) => a.role_id === roleId)
    .map((a) => a.user_id)
  const currentSet = new Set(current)
  const nextSet = new Set(next)
  const toAdd = next.filter((id) => !currentSet.has(id))
  const toRemove = current.filter((id) => !nextSet.has(id))

  if (toAdd.length) {
    const { error } = await supabase.from('user_roles').insert(
      toAdd.map((user_id) => ({
        organization_id: orgId,
        user_id,
        role_id: roleId,
      })),
    )
    if (error) throw error
  }

  if (toRemove.length) {
    const { error } = await supabase
      .from('user_roles')
      .delete()
      .eq('organization_id', orgId)
      .eq('role_id', roleId)
      .in('user_id', toRemove)
    if (error) throw error
  }
}

const saveRole = async () => {
  errorMessage.value = ''
  const orgId = activeOrganizationId.value
  if (!orgId) return
  const trimmedName = name.value.trim()
  if (!trimmedName) {
    errorMessage.value = 'Role name is required'
    return
  }

  busy.value = true
  try {
    let roleId = editingId.value
    if (roleId) {
      if (!editingIsSystem.value) {
        const { error } = await supabase
          .from('roles')
          .update({
            name: trimmedName,
            description: description.value.trim() || null,
          })
          .eq('id', roleId)
          .eq('organization_id', orgId)
        if (error) throw error
      }
    }
    else {
      const { data, error } = await supabase
        .from('roles')
        .insert({
          organization_id: orgId,
          name: trimmedName,
          description: description.value.trim() || null,
        })
        .select('id')
        .single()
      if (error) throw error
      roleId = data.id
    }

    await syncRoleUsers(roleId, selectedUserIds.value || [])
    closeForm()
    await load()
  }
  catch (err) {
    errorMessage.value = err?.message || 'Failed to save role'
  }
  finally {
    busy.value = false
  }
}

const removeRole = async (role) => {
  errorMessage.value = ''
  const ok = await appConfirm({
    title: 'Delete role?',
    message: `Delete “${role.name}”? Users will lose this role assignment.`,
    confirmLabel: 'Delete',
    danger: true,
  })
  if (!ok) return
  const { error } = await supabase.from('roles').delete().eq('id', role.id)
  if (error) {
    errorMessage.value = error.message
    return
  }
  if (editingId.value === role.id) closeForm()
  await load()
}
</script>
