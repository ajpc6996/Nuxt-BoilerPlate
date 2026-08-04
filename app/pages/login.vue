<template>
  <div class="flex flex-1 items-center justify-center px-6 py-16">
    <div class="panel w-full max-w-md px-6 py-10 sm:px-8">
      <h1 class="font-display text-3xl font-semibold tracking-tight text-[var(--ink)]">
        Log in
      </h1>
      <p class="mt-2 text-sm text-[var(--mute)]">
        Sign in to {{ appName }} with your email and password.
      </p>

      <form class="mt-8 flex flex-col gap-4" @submit.prevent="onSubmit">
        <div class="flex flex-col gap-1.5">
          <label for="email" class="text-sm font-medium text-[var(--ink)]">Email</label>
          <input
            id="email"
            v-model="email"
            type="email"
            autocomplete="username"
            required
            class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]"
          >
        </div>

        <div class="flex flex-col gap-1.5">
          <label for="password" class="text-sm font-medium text-[var(--ink)]">Password</label>
          <input
            id="password"
            v-model="password"
            type="password"
            autocomplete="current-password"
            required
            class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]"
          >
        </div>

        <p v-if="errorMessage" class="text-sm text-[var(--danger)]">
          {{ errorMessage }}
        </p>

        <button type="submit" class="btn-primary mt-2" :disabled="submitting">
          {{ submitting ? 'Signing in…' : 'Sign in' }}
        </button>
      </form>

      <div v-if="showReset" class="mt-6 border-t border-[var(--border-soft)] pt-6">
        <p class="text-sm text-[var(--mute)]">
          Forgot your password? Request a secure reset email. Passwords are one-way hashed and never readable by admins.
        </p>
        <button
          type="button"
          class="btn-secondary mt-3 w-full"
          :disabled="resetting || !email"
          @click="onReset"
        >
          {{ resetting ? 'Sending…' : 'Reset password' }}
        </button>
        <p v-if="resetNote" class="mt-2 text-sm text-[var(--accent-ink)]">
          {{ resetNote }}
        </p>
      </div>
    </div>
  </div>
</template>

<script setup>
definePageMeta({
  layout: 'plain',
})

const { appName } = useAppName()
const { signInWithPassword, requestPasswordReset, isAuthenticated } = useAuth()
const route = useRoute()

useHead({ title: 'Login' })

const email = ref('')
const password = ref('')
const errorMessage = ref(
  typeof route.query.error === 'string' ? route.query.error : '',
)
const showReset = ref(Boolean(route.query.error))
const resetNote = ref('')
const submitting = ref(false)
const resetting = ref(false)

watch(
  isAuthenticated,
  (value) => {
    if (value && route.path === '/login') {
      navigateTo('/dashboard')
    }
  },
  { immediate: true },
)

const onSubmit = async () => {
  errorMessage.value = ''
  resetNote.value = ''
  submitting.value = true
  try {
    const { error, mfaRequired } = await signInWithPassword(
      email.value,
      password.value,
    )
    if (error) {
      errorMessage.value = error.message || 'Login failed'
      showReset.value = true
      return
    }
    if (mfaRequired) {
      return
    }
  } finally {
    submitting.value = false
  }
}

const onReset = async () => {
  resetting.value = true
  resetNote.value = ''
  try {
    const { error } = await requestPasswordReset(email.value)
    if (error) {
      resetNote.value = error.message || 'Could not send reset email'
      return
    }
    resetNote.value = 'If an account exists for that email, a reset link has been sent.'
  } finally {
    resetting.value = false
  }
}
</script>
