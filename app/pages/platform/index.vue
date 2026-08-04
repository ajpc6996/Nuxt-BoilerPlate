<template>
  <div class="mx-auto w-full max-w-6xl flex-1 px-6 py-12 lg:px-8">
    <h1 class="font-display text-3xl font-semibold text-[var(--ink)]">Platform</h1>
    <p class="mt-2 text-[var(--mute)]">
      Cross-tenant configuration. MFA is required for all platform actions.
    </p>

    <div class="mt-8 grid gap-4 sm:grid-cols-2">
      <NuxtLink to="/platform/organizations" class="panel p-6 hover:border-[var(--accent)]">
        <h2 class="font-display text-xl font-semibold text-[var(--ink)]">Organizations</h2>
        <p class="mt-2 text-sm text-[var(--mute)]">
          Create organizations and set MFA mode (off / optional / required).
        </p>
      </NuxtLink>
      <NuxtLink to="/administration/users" class="panel p-6 hover:border-[var(--accent)]">
        <h2 class="font-display text-xl font-semibold text-[var(--ink)]">Users in active org</h2>
        <p class="mt-2 text-sm text-[var(--mute)]">
          Switch active org, then manage users, invites, and password resets.
        </p>
      </NuxtLink>
    </div>
  </div>
</template>

<script setup>
definePageMeta({
  layout: 'app',
  middleware: ['auth', 'platform-admin'],
})

useHead({ title: 'Platform' })
</script>
