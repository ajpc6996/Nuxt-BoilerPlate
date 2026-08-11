<template>
  <div class="mx-auto w-full max-w-xl flex-1 px-6 py-10 lg:px-8">
    <p class="text-[10px] uppercase tracking-wide text-[var(--accent-ink)]">
      Payment successful (mock)
    </p>
    <h1 class="mt-1 font-display text-3xl font-semibold text-[var(--ink)]">
      You’re all set
    </h1>
    <p class="mt-2 text-sm text-[var(--mute)]">
      Licence updated for
      <span class="text-[var(--accent-ink)]">{{ activeOrganization?.name || 'your organization' }}</span>.
      No card was charged.
    </p>
    <p
      v-if="plan"
      class="mt-4 text-sm text-[var(--ink)]"
    >
      Plan: <span class="font-mono">{{ plan }}</span>
      <span v-if="status"> · {{ status }}</span>
    </p>
    <div class="mt-8 flex flex-wrap gap-2">
      <NuxtLink
        to="/administration/licence"
        class="btn-primary !px-4 !py-2"
      >
        View licence
      </NuxtLink>
      <NuxtLink
        to="/administration/billing"
        class="btn-secondary !px-4 !py-2"
      >
        Back to billing
      </NuxtLink>
    </div>
  </div>
</template>

<script setup>
definePageMeta({
  layout: 'app',
  middleware: ['auth', 'admin'],
})

useHead({ title: 'Billing success' })

const route = useRoute()
const { activeOrganization } = useOrganization()

const plan = computed(() => String(route.query.plan || ''))
const status = computed(() => String(route.query.status || ''))
</script>
