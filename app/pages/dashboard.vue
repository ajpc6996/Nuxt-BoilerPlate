<template>
  <div class="mx-auto w-full max-w-6xl flex-1 px-6 py-12 lg:px-8">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          Dashboard
        </h1>
        <p class="mt-2 text-[var(--color-ink)]/70">
          This page is protected by the
          <code class="rounded bg-[var(--color-ink)]/5 px-1.5 py-0.5 text-sm">auth</code>
          middleware.
        </p>
      </div>
      <button
        type="button"
        class="rounded-md border border-[var(--color-ink)]/15 px-4 py-2 text-sm font-semibold text-[var(--color-ink)] transition-colors hover:bg-[var(--color-ink)]/5"
        @click="logout"
      >
        Log out
      </button>
    </div>

    <section class="mt-10">
      <h2 class="font-display text-xl font-semibold">Welcome back</h2>
      <p class="mt-2 text-[var(--color-ink)]/75">
        Signed in as
        <span class="font-medium text-[var(--color-ink)]">
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
  title: 'Dashboard — Northline',
})

const { user, logout } = useAuth()
</script>
