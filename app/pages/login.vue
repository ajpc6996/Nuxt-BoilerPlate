<template>
  <div class="flex flex-1 items-center justify-center px-6 py-16">
    <div class="w-full max-w-md text-center">
      <h1 class="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
        Login
      </h1>
      <p class="mt-3 text-[var(--color-ink)]/70">
        Toggle authentication to access the protected dashboard.
      </p>

      <p class="mt-8 text-sm font-medium">
        Status:
        <span
          :class="isAuthenticated ? 'text-[var(--color-sea)]' : 'text-[var(--color-ink)]/50'"
        >
          {{ isAuthenticated ? 'Authenticated' : 'Signed out' }}
        </span>
      </p>

      <button
        type="button"
        class="mt-6 w-full rounded-md px-5 py-3 text-sm font-semibold text-white transition-colors sm:w-auto"
        :class="
          isAuthenticated
            ? 'bg-[var(--color-ink)] hover:bg-[var(--color-ink)]/85'
            : 'bg-[var(--color-sea)] hover:bg-[var(--color-sea-deep)]'
        "
        @click="toggleAuth"
      >
        {{ isAuthenticated ? 'Log out' : 'Log in' }}
      </button>

      <p v-if="isAuthenticated" class="mt-6 text-sm text-[var(--color-ink)]/60">
        You’re signed in
        <template v-if="user?.name">
          as <span class="font-medium text-[var(--color-ink)]">{{ user.name }}</span>
        </template>
        —
        <NuxtLink to="/dashboard" class="font-medium text-[var(--color-sea)] underline-offset-2 hover:underline">
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

useHead({
  title: 'Login — Northline',
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

  login({
    name: 'Demo User',
    email: 'demo@northline.app',
  })
}
</script>
