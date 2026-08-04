<template>
  <div class="mx-auto w-full max-w-6xl flex-1 px-6 py-10 lg:px-8">
    <div>
      <h1 class="font-display text-3xl font-semibold tracking-tight text-[var(--ink)] sm:text-4xl">
        Home
      </h1>
      <p class="mt-2 text-[var(--mute)]">
        Signed in with Supabase Auth. Active organization drives tenant data and Administration.
      </p>
    </div>

    <section class="panel mt-8 px-6 py-6">
      <h2 class="font-display text-xl font-semibold text-[var(--ink)]">Welcome</h2>
      <p class="mt-2 text-[var(--mute)]">
        {{ profile?.full_name || user?.email || 'Authenticated user' }}
      </p>
      <dl class="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt class="text-[var(--mute-soft)]">Email</dt>
          <dd class="text-[var(--ink)]">{{ profile?.email || user?.email }}</dd>
        </div>
        <div>
          <dt class="text-[var(--mute-soft)]">Assurance</dt>
          <dd class="text-[var(--accent-ink)]">{{ aal }}</dd>
        </div>
        <div>
          <dt class="text-[var(--mute-soft)]">Active org</dt>
          <dd class="text-[var(--ink)]">{{ activeOrganization?.name || 'None' }}</dd>
        </div>
        <div>
          <dt class="text-[var(--mute-soft)]">Roles</dt>
          <dd class="text-[var(--ink)]">
            {{ rolesInActiveOrg.map((r) => r.name).join(', ') || '—' }}
          </dd>
        </div>
      </dl>
    </section>
  </div>
</template>

<script setup>
definePageMeta({
  layout: 'app',
  middleware: 'auth',
})

useHead({
  title: 'Home',
})

const { user, profile, aal } = useAuth()
const { activeOrganization, rolesInActiveOrg } = useOrganization()
</script>
