<template>
  <div class="mx-auto w-full max-w-6xl flex-1 px-6 py-10 lg:px-8">
    <div>
      <h1 class="font-display text-3xl font-semibold tracking-tight text-[var(--ink)]">
        Data Sources
      </h1>
      <p class="mt-2 max-w-2xl text-[var(--mute)]">
        Connector types, shared connections, and ingest sources for
        <span class="text-[var(--accent-ink)]">{{ activeOrganization?.name || 'the active organization' }}</span>.
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

useHead({ title: 'Data Sources' })

const { activeOrganization } = useOrganization()
const { allowsRoles } = usePermissions()

const allCards = [
  {
    label: 'Connector Type',
    to: '/data-sources/connector-types',
    description: 'Platform catalog of source blueprints. Enable types or generate new ones with AI.',
    roles: ['platform'],
  },
  {
    label: 'Connections',
    to: '/data-sources/connections',
    description: 'Shared authenticated links. Credentials are defined once and reused by many sources.',
    roles: ['platform', 'orgAdmin'],
  },
  {
    label: 'Data Flows',
    to: '/data-sources/sources',
    description: 'Retrieve → transform → ingest and optional Export (Temp Stage) pipelines.',
    roles: ['platform', 'orgAdmin'],
  },
]

const cards = computed(() =>
  allCards.filter((card) => allowsRoles(card.roles)),
)
</script>
