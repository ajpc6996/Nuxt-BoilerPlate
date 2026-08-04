<template>
  <div class="mx-auto w-full max-w-3xl flex-1 px-6 py-12 lg:px-8">
    <h1 class="font-display text-3xl font-semibold tracking-tight text-[var(--ink)]">
      Security & MFA
    </h1>
    <p class="mt-2 text-[var(--mute)]">
      Enroll an authenticator app for MFA. Administration and Platform always require MFA verification.
    </p>

    <section class="panel mt-8 p-6">
      <h2 class="font-display text-xl font-semibold text-[var(--ink)]">Session</h2>
      <p class="mt-2 text-sm text-[var(--mute)]">
        Assurance level:
        <span class="font-medium text-[var(--accent-ink)]">{{ aal }}</span>
      </p>
      <label class="mt-4 flex items-center gap-2 text-sm text-[var(--ink)]">
        <input v-model="mfaOptIn" type="checkbox" @change="saveOptIn">
        Opt in to MFA for my account (when org policy is optional)
      </label>
      <p v-if="optInMessage" class="mt-2 text-sm text-[var(--accent-ink)]">{{ optInMessage }}</p>
    </section>

    <section class="panel mt-6 p-6">
      <h2 class="font-display text-xl font-semibold text-[var(--ink)]">Authenticator factors</h2>
      <ul v-if="factors.length" class="mt-4 space-y-2 text-sm">
        <li
          v-for="factor in factors"
          :key="factor.id"
          class="flex items-center justify-between rounded-md border border-[var(--border)] px-3 py-2"
        >
          <span class="text-[var(--ink)]">
            {{ factor.friendly_name || 'Authenticator' }}
            <span class="text-[var(--mute)]">({{ factor.status }})</span>
          </span>
          <button
            type="button"
            class="text-[var(--danger)]"
            @click="unenroll(factor.id)"
          >
            Remove
          </button>
        </li>
      </ul>
      <p v-else class="mt-3 text-sm text-[var(--mute)]">No factors enrolled yet.</p>

      <div v-if="!enrolling" class="mt-4">
        <button type="button" class="btn-primary !px-4 !py-2" @click="startEnroll">
          Enroll authenticator
        </button>
      </div>

      <div v-else class="mt-4 space-y-3">
        <p class="text-sm text-[var(--mute)]">
          Scan this QR code in your authenticator app, then enter a code to verify.
        </p>
        <div
          v-if="qrCode"
          class="overflow-hidden rounded-md border border-[var(--border)] bg-white p-3"
          v-html="qrCode"
        />
        <input
          v-model="verifyCode"
          type="text"
          inputmode="numeric"
          placeholder="6-digit code"
          class="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)]"
        >
        <div class="flex gap-2">
          <button type="button" class="btn-primary !px-4 !py-2" @click="confirmEnroll">
            Verify & enable
          </button>
          <button type="button" class="btn-secondary !px-4 !py-2" @click="cancelEnroll">
            Cancel
          </button>
        </div>
      </div>

      <p v-if="errorMessage" class="mt-3 text-sm text-[var(--danger)]">{{ errorMessage }}</p>
    </section>
  </div>
</template>

<script setup>
definePageMeta({
  layout: 'app',
  middleware: 'auth',
})

useHead({ title: 'Security' })

const supabase = useSupabase()
const { aal, profile, updateProfile, refreshAuth } = useAuth()

const factors = ref([])
const enrolling = ref(false)
const factorId = ref('')
const qrCode = ref('')
const verifyCode = ref('')
const errorMessage = ref('')
const mfaOptIn = ref(Boolean(profile.value?.mfa_opt_in))
const optInMessage = ref('')

watch(profile, (value) => {
  mfaOptIn.value = Boolean(value?.mfa_opt_in)
})

const loadFactors = async () => {
  const { data, error } = await supabase.auth.mfa.listFactors()
  if (error) {
    errorMessage.value = error.message
    return
  }
  factors.value = [...(data?.totp || []), ...(data?.phone || [])]
}

onMounted(loadFactors)

const saveOptIn = async () => {
  optInMessage.value = ''
  const { error } = await updateProfile({ mfa_opt_in: mfaOptIn.value })
  optInMessage.value = error ? error.message : 'Preference saved'
}

const startEnroll = async () => {
  errorMessage.value = ''
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: 'Authenticator',
  })
  if (error) {
    errorMessage.value = error.message
    return
  }
  factorId.value = data.id
  qrCode.value = data.totp.qr_code
  enrolling.value = true
}

const cancelEnroll = async () => {
  if (factorId.value) {
    await supabase.auth.mfa.unenroll({ factorId: factorId.value })
  }
  enrolling.value = false
  factorId.value = ''
  qrCode.value = ''
  verifyCode.value = ''
}

const confirmEnroll = async () => {
  errorMessage.value = ''
  const challenge = await supabase.auth.mfa.challenge({ factorId: factorId.value })
  if (challenge.error) {
    errorMessage.value = challenge.error.message
    return
  }

  const { error } = await supabase.auth.mfa.verify({
    factorId: factorId.value,
    challengeId: challenge.data.id,
    code: verifyCode.value.trim(),
  })

  if (error) {
    errorMessage.value = error.message
    return
  }

  enrolling.value = false
  factorId.value = ''
  qrCode.value = ''
  verifyCode.value = ''
  await refreshAuth()
  await loadFactors()
}

const unenroll = async (id) => {
  errorMessage.value = ''
  const { error } = await supabase.auth.mfa.unenroll({ factorId: id })
  if (error) {
    errorMessage.value = error.message
    return
  }
  await refreshAuth()
  await loadFactors()
}
</script>
