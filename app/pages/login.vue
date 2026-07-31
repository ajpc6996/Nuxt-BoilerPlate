<template>
  <div class="flex flex-1 items-center justify-center px-6 py-16">
    <div class="panel w-full max-w-md px-6 py-10 text-center sm:px-8">
      <h1 class="font-display text-3xl font-semibold tracking-tight text-[var(--ink)] sm:text-4xl">
        Login
      </h1>
      <p class="mt-3 text-[var(--mute)]">
        Toggle authentication to access the protected dashboard.
      </p>

      <p class="mt-8 text-sm font-medium text-[var(--ink)]">
        Status:
        <span
          :class="isAuthenticated ? 'text-[var(--accent-ink)]' : 'text-[var(--mute-soft)]'"
        >
          {{ isAuthenticated ? 'Authenticated' : 'Signed out' }}
        </span>
      </p>

      <button
        type="button"
        class="mt-6 w-full sm:w-auto"
        :class="isAuthenticated ? 'btn-secondary' : 'btn-primary'"
        @click="toggleAuth"
      >
        {{ isAuthenticated ? 'Log out' : 'Log in' }}
      </button>

      <p v-if="isAuthenticated" class="mt-6 text-sm text-[var(--mute)]">
        You’re signed in
        <template v-if="user?.name">
          as <span class="font-medium text-[var(--ink)]">{{ user.name }}</span>
        </template>
        —
        <NuxtLink to="/dashboard" class="font-medium text-[var(--accent-ink)] underline-offset-2 hover:underline">
          go to dashboard
        </NuxtLink>
      </p>
    </div>
  </div>
</template>

<script setup>
definePageMeta({
  layout: 'plain',
})

const { appName } = useAppName()

useHead({
  title: 'Login',
})

const { isAuthenticated, user, login, logout } = useAuth()

/**
 * Toggle auth state: log in with a demo user, or log out.
 */
const toggleAuth = () => {
  if (isAuthenticated.value) {
    logout()
    return
  }

  const slug = appName.value.toLowerCase().replace(/[^a-z0-9]+/g, '') || 'zorro'

  login({
    name: 'Demo User',
    email: `demo@${slug}.app`,
  })
}
</script>
