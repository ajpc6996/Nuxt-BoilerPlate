<template>
  <div class="mx-auto w-full max-w-6xl flex-1 px-6 py-12 lg:px-8">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="font-display text-3xl font-semibold tracking-tight text-[var(--ink)] sm:text-4xl">
          Dashboard
        </h1>
        <p class="mt-2 text-[var(--mute)]">
          This page is protected by the
          <code class="rounded bg-[var(--accent-soft)] px-1.5 py-0.5 text-sm text-[var(--accent-ink)]">auth</code>
          middleware.
        </p>
      </div>
      <button
        type="button"
        class="btn-secondary !px-4 !py-2"
        @click="logout"
      >
        Log out
      </button>
    </div>

    <section class="panel mt-10 px-6 py-6">
      <h2 class="font-display text-xl font-semibold text-[var(--ink)]">Welcome back</h2>
      <p class="mt-2 text-[var(--mute)]">
        Signed in as
        <span class="font-medium text-[var(--ink)]">
          {{ user?.name || 'Authenticated user' }}
        </span>
        <template v-if="user?.email">
          ({{ user.email }})
        </template>
      </p>
    </section>
  </div>
</template>

<script setup>
definePageMeta({
  layout: 'plain',
  middleware: 'auth',
})

useHead({
  title: 'Dashboard',
})

const { user, logout } = useAuth()
</script>
