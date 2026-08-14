<template>
  <div class="mx-auto w-full max-w-6xl flex-1 px-6 py-10 lg:px-8">
    <div>
      <h1 class="font-display text-3xl font-semibold tracking-tight text-[var(--ink)]">
        Administration
      </h1>
      <p class="mt-2 text-[var(--mute)]">
        Manage organizations, users, and roles for
        <span class="text-[var(--accent-ink)]">{{ activeOrganization?.name || 'the active organization' }}</span>.
        MFA-verified session required.
      </p>
    </div>

    <div class="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <NuxtLink
        v-for="card in cards"
        :key="card.to"
        :to="card.to"
        class="panel p-6 transition hover:border-[var(--accent)]"
      >
        <h2 class="font-display text-xl font-semibold text-[var(--ink)]">
          {{ card.label }}
        </h2>
        <p class="mt-2 text-sm text-[var(--mute)]">
          {{ card.description }}
        </p>
      </NuxtLink>
    </div>
  </div>
</template>

<script setup>
definePageMeta({
  layout: 'app',
  middleware: ['auth', 'admin'],
})

useHead({ title: 'Administration' })

const { activeOrganization } = useOrganization()
const { allowsRoles } = usePermissions()

const allCards = [
  {
    label: 'Organizations',
    to: '/platform/organizations',
    description: 'Create organizations, set MFA mode, assign licences, and choose the active org (platform only).',
    roles: ['platform'],
  },
  {
    label: 'System Settings',
    to: '/administration/system-settings',
    description: 'Platform-wide Temp Stage caps: batch size, concurrent staged rows, and stale TTL.',
    roles: ['platform'],
  },
  {
    label: 'Licence & usage',
    to: '/administration/licence',
    description: 'View plan, feature flags, and hard usage limits for the active organization.',
    roles: ['platform', 'orgAdmin'],
  },
  {
    label: 'Billing',
    to: '/administration/billing',
    description: 'Mock checkout and portal — upgrade plans and capacity without charging a card.',
    roles: ['platform', 'orgAdmin'],
  },
  {
    label: 'Users',
    to: '/administration/users',
    description: 'Invite by email, create users with a reset link, edit membership and role assignments.',
    roles: ['platform', 'orgAdmin'],
  },
  {
    label: 'Roles',
    to: '/administration/roles',
    description: 'Add and edit organization roles. Users may belong to one or more roles.',
    roles: ['platform', 'orgAdmin'],
  },
]

const cards = computed(() =>
  allCards.filter((card) => allowsRoles(card.roles)),
)
</script>
