<template>
  <div class="flex flex-1 items-center justify-center px-6 py-16">
    <div class="panel w-full max-w-md px-6 py-10 sm:px-8">
      <h1 class="font-display text-3xl font-semibold tracking-tight text-[var(--ink)]">
        Set a new password
      </h1>
      <p class="mt-2 text-sm text-[var(--mute)]">
        Choose a strong password. It is stored with one-way hashing and cannot be viewed by anyone.
      </p>

      <div v-if="bootstrapping" class="mt-8 text-sm text-[var(--mute)]">
        Verifying your reset link…
      </div>

      <div v-else-if="!ready" class="mt-8 space-y-4">
        <p class="text-sm text-[var(--danger)]">
          {{ errorMessage || 'This reset link is invalid or has expired.' }}
        </p>
        <p class="text-sm text-[var(--mute)]">
          Request a new reset from the login page, and open the link in the same browser.
        </p>
        <NuxtLink to="/login" class="btn-primary inline-flex !px-4 !py-2">
          Back to login
        </NuxtLink>
      </div>

      <form
        v-else
        class="mt-8 flex flex-col gap-4"
        @submit.prevent="onSubmit"
      >
        <div class="flex flex-col gap-1.5">
          <label for="password" class="text-sm font-medium text-[var(--ink)]">New password</label>
          <input
            id="password"
            v-model="password"
            type="password"
            autocomplete="new-password"
            minlength="8"
            required
            class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]"
          >
        </div>
        <div class="flex flex-col gap-1.5">
          <label for="confirm" class="text-sm font-medium text-[var(--ink)]">Confirm password</label>
          <input
            id="confirm"
            v-model="confirm"
            type="password"
            autocomplete="new-password"
            minlength="8"
            required
            class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]"
          >
        </div>

        <p v-if="errorMessage" class="text-sm text-[var(--danger)]">{{ errorMessage }}</p>
        <p v-if="successMessage" class="text-sm text-[var(--accent-ink)]">{{ successMessage }}</p>

        <button type="submit" class="btn-primary" :disabled="submitting">
          {{ submitting ? 'Saving…' : 'Update password' }}
        </button>
      </form>
    </div>
  </div>
</template>

<script setup>
definePageMeta({
  layout: 'plain',
  ssr: false,
})

useHead({ title: 'Reset password' })

const supabase = useSupabase()
const authStore = useAuthStore()
const route = useRoute()

const password = ref('')
const confirm = ref('')
const errorMessage = ref('')
const successMessage = ref('')
const submitting = ref(false)
const bootstrapping = ref(true)
const ready = ref(false)

const isAbort = (err) =>
  err?.name === 'AbortError' || /aborted/i.test(String(err?.message || ''))

/**
 * @param {Promise<T>} promise
 * @param {number} ms
 * @param {string} label
 * @returns {Promise<T>}
 * @template T
 */
const withTimeout = (promise, ms, label) =>
  Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(
        () => reject(new Error(`${label} timed out. Check Supabase URL / network, then try again.`)),
        ms,
      )
    }),
  ])

const establishRecoverySession = async () => {
  errorMessage.value = ''

  const queryError = route.query.error_description || route.query.error
  if (queryError) {
    errorMessage.value = String(queryError)
    return false
  }

  // Email / dashboard style: ?token_hash=...&type=recovery
  const tokenHash =
    typeof route.query.token_hash === 'string' ? route.query.token_hash : null
  const otpType =
    typeof route.query.type === 'string' ? route.query.type : 'recovery'

  if (tokenHash) {
    try {
      const { error } = await withTimeout(
        supabase.auth.verifyOtp({ token_hash: tokenHash, type: otpType }),
        15000,
        'verifyOtp',
      )
      if (error) {
        errorMessage.value = error.message
        return false
      }
    } catch (err) {
      if (!isAbort(err)) {
        errorMessage.value = err.message
        return false
      }
    }
  }

  // App PKCE style: ?code=...
  const code = typeof route.query.code === 'string' ? route.query.code : null
  if (code) {
    try {
      const { error } = await withTimeout(
        supabase.auth.exchangeCodeForSession(code),
        15000,
        'exchangeCodeForSession',
      )
      if (error && !isAbort(error)) {
        errorMessage.value =
          error.message
          + ' Tip: start the reset from the app login page (not only the Supabase dashboard).'
        return false
      }
    } catch (err) {
      if (!isAbort(err)) {
        errorMessage.value = err.message
        return false
      }
    }
  }

  // Implicit hash tokens
  if (window.location.hash.includes('access_token')) {
    try {
      await withTimeout(supabase.auth.getSession(), 10000, 'getSession')
    } catch (err) {
      if (!isAbort(err)) {
        errorMessage.value = err.message
        return false
      }
    }
  }

  const {
    data: { session },
    error: sessionError,
  } = await withTimeout(supabase.auth.getSession(), 10000, 'getSession')

  if (sessionError && !isAbort(sessionError)) {
    errorMessage.value = sessionError.message
    return false
  }

  if (!session?.user) {
    errorMessage.value =
      'No active recovery session. Request a new reset from /login and open the email link in this browser.'
    return false
  }

  authStore.setSession(session)

  if (code || tokenHash) {
    window.history.replaceState({}, '', '/auth/reset-password')
  }

  return true
}

onMounted(() => {
  const safety = setTimeout(() => {
    if (bootstrapping.value) {
      bootstrapping.value = false
      ready.value = false
      errorMessage.value =
        'Verification timed out. Confirm Auth Redirect URLs include http://localhost:3000/auth/reset-password, then request a new reset from /login.'
    }
  }, 20000)

  establishRecoverySession()
    .then((ok) => {
      ready.value = ok
    })
    .catch((err) => {
      errorMessage.value = isAbort(err)
        ? 'Sign-in was interrupted. Request a new reset link from /login.'
        : (err?.message || 'Could not verify reset link')
      ready.value = false
    })
    .finally(() => {
      clearTimeout(safety)
      bootstrapping.value = false
    })
})

const onSubmit = async () => {
  errorMessage.value = ''
  successMessage.value = ''

  if (password.value !== confirm.value) {
    errorMessage.value = 'Passwords do not match'
    return
  }

  if (password.value.length < 8) {
    errorMessage.value = 'Password must be at least 8 characters'
    return
  }

  submitting.value = true
  try {
    const { error } = await supabase.auth.updateUser({ password: password.value })
    if (error) {
      errorMessage.value = error.message
      return
    }
    successMessage.value = 'Password updated. You can sign in now.'
    await navigateTo('/login')
  } finally {
    submitting.value = false
  }
}
</script>
