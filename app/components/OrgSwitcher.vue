<template>
  <div v-if="isAuthenticated && options.length" class="flex items-center gap-2">
    <label for="active-org" class="sr-only">Active organization</label>
    <select
      id="active-org"
      class="rounded-md border border-[var(--border)] bg-[var(--surface-white)] px-2 py-1.5 text-sm text-[var(--ink)]"
      :value="activeOrganizationId || ''"
      @change="onChange"
    >
      <option
        v-for="opt in options"
        :key="opt.id"
        :value="opt.id"
      >
        {{ opt.name }}
      </option>
    </select>
  </div>
</template>

<script setup>
const { isAuthenticated } = useAuth()
const {
  memberships,
  activeOrganizationId,
  setActiveOrganization,
} = useOrganization()

const options = computed(() =>
  memberships.value
    .map((m) => ({
      id: m.organization_id,
      name: m.organizations?.name || m.organization_id,
    }))
    .filter((o) => o.id),
)

const onChange = async (event) => {
  const orgId = event.target.value
  if (!orgId) return
  await setActiveOrganization(orgId)
}
</script>
