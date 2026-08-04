<template>
  <div class="mx-auto w-full max-w-6xl flex-1 px-6 py-12 lg:px-8">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="font-display text-3xl font-semibold tracking-tight text-[var(--ink)]">
          Administration
        </h1>
        <p class="mt-2 text-[var(--mute)]">
          Manage users and roles for
          <span class="text-[var(--accent-ink)]">{{ activeOrganization?.name || 'the active organization' }}</span>.
          MFA-verified session required. Organization creation is platform-only.
        </p>
      </div>
      <div class="flex gap-2">
        <NuxtLink to="/administration/users" class="btn-primary !px-4 !py-2">Users</NuxtLink>
        <NuxtLink to="/administration/roles" class="btn-secondary !px-4 !py-2">Roles</NuxtLink>
      </div>
    </div>

    <div class="mt-8 grid gap-4 sm:grid-cols-2">
      <NuxtLink to="/administration/users" class="panel p-6 transition hover:border-[var(--accent)]">
        <h2 class="font-display text-xl font-semibold text-[var(--ink)]">Users</h2>
        <p class="mt-2 text-sm text-[var(--mute)]">
          Invite by email, create users with a reset link, edit membership and role assignments.
        </p>
      </NuxtLink>
      <NuxtLink to="/administration/roles" class="panel p-6 transition hover:border-[var(--accent)]">
        <h2 class="font-display text-xl font-semibold text-[var(--ink)]">Roles</h2>
        <p class="mt-2 text-sm text-[var(--mute)]">
          Add and edit organization roles. Users may belong to one or more roles.
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
</script>
