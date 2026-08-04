<template>
  <div class="flex flex-1 items-center justify-center px-6 py-16">
    <div class="panel w-full max-w-md px-6 py-10 sm:px-8">
      <h1 class="font-display text-3xl font-semibold tracking-tight text-[var(--ink)]">
        Multi-factor authentication
      </h1>
      <p class="mt-2 text-sm text-[var(--mute)]">
        {{ reasonText }}
      </p>

      <form class="mt-8 flex flex-col gap-4" @submit.prevent="onVerify">
        <div class="flex flex-col gap-1.5">
          <label for="code" class="text-sm font-medium text-[var(--ink)]">Authenticator code</label>
          <input
            id="code"
            v-model="code"
            inputmode="numeric"
            autocomplete="one-time-code"
            maxlength="10"
            required
            class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm tracking-widest text-[var(--ink)] outline-none focus:border-[var(--accent)]"
          >
        </div>

        <p v-if="errorMessage" class="text-sm text-[var(--danger)]">
          {{ errorMessage }}
        </p>

        <button type="submit" class="btn-primary" :disabled="submitting || !factorId">
          {{ submitting ? 'Verifying…' : 'Verify' }}
        </button>
      </form>

      <p v-if="!factorId && !loadingFactors" class="mt-4 text-sm text-[var(--danger)]">
        No verified authenticator is enrolled. Open
        <NuxtLink to="/me/security" class="text-[var(--accent-ink)] underline">Security & MFA</NuxtLink>
        to set one up.
      </p>
    </div>
  </div>
</template>

<script setup>
definePageMeta({
  layout: 'plain',
  middleware: 'auth',
})

useHead({ title: 'MFA' })

const supabase = useSupabase()
const { refreshAuth, isAal2 } = useAuth()
const route = useRoute()

const code = ref('')
const factorId = ref('')
const challengeId = ref('')
const errorMessage = ref('')
const submitting = ref(false)
const loadingFactors = ref(true)

const reasonText = computed(() => {
  if (route.query.reason === 'platform') {
    return 'Platform administration requires MFA so a stolen password alone cannot unlock cross-tenant power.'
  }
  if (route.query.reason === 'administration') {
    return 'Administration requires a verified MFA challenge before you can manage users and roles.'
  }
  return 'Enter the code from your authenticator app to continue.'
})

onMounted(async () => {
  loadingFactors.value = true
  try {
    if (isAal2.value) {
      await goNext()
      return
    }

    const { data, error } = await supabase.auth.mfa.listFactors()
    if (error) {
      errorMessage.value = error.message
      return
    }

    const totp = (data?.totp || []).find((f) => f.status === 'verified')
    factorId.value = totp?.id || ''

    if (factorId.value) {
      const challenge = await supabase.auth.mfa.challenge({
        factorId: factorId.value,
      })
      if (challenge.error) {
        errorMessage.value = challenge.error.message
        return
      }
      challengeId.value = challenge.data.id
    }
  } finally {
    loadingFactors.value = false
  }
})

const goNext = async () => {
  const redirect = route.query.redirect
  await navigateTo(
    typeof redirect === 'string' && redirect.startsWith('/')
      ? redirect
      : '/',
  )
}

const onVerify = async () => {
  errorMessage.value = ''
  submitting.value = true
  try {
    const { error } = await supabase.auth.mfa.verify({
      factorId: factorId.value,
      challengeId: challengeId.value,
      code: code.value.trim(),
    })
    if (error) {
      errorMessage.value = error.message
      return
    }
    await refreshAuth()
    await goNext()
  } finally {
    submitting.value = false
  }
}
</script>
