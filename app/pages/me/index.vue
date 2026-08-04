<template>
  <div class="mx-auto w-full max-w-3xl flex-1 px-6 py-12 lg:px-8">
    <h1 class="font-display text-3xl font-semibold tracking-tight text-[var(--ink)]">
      My User
    </h1>
    <p class="mt-2 text-[var(--mute)]">
      View and update your profile details.
    </p>

    <form class="panel mt-8 flex max-w-lg flex-col gap-4 p-6" @submit.prevent="onSave">
      <div class="flex flex-col gap-1.5">
        <label class="text-sm font-medium text-[var(--ink)]">Email</label>
        <input
          :value="profile?.email || user?.email"
          disabled
          class="rounded-md border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--mute)]"
        >
      </div>

      <div class="flex flex-col gap-1.5">
        <label for="full_name" class="text-sm font-medium text-[var(--ink)]">Full name</label>
        <input
          id="full_name"
          v-model="fullName"
          type="text"
          class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]"
        >
      </div>

      <p v-if="message" class="text-sm" :class="error ? 'text-[var(--danger)]' : 'text-[var(--accent-ink)]'">
        {{ message }}
      </p>

      <div class="flex gap-2">
        <button type="submit" class="btn-primary !px-4 !py-2" :disabled="saving">
          {{ saving ? 'Saving…' : 'Save' }}
        </button>
        <NuxtLink to="/me/security" class="btn-secondary !px-4 !py-2">
          Security & MFA
        </NuxtLink>
      </div>
    </form>
  </div>
</template>

<script setup>
definePageMeta({
  layout: 'plain',
  middleware: 'auth',
})

useHead({ title: 'My User' })

const { user, profile, updateProfile } = useAuth()

const fullName = ref(profile.value?.full_name || '')
const saving = ref(false)
const message = ref('')
const error = ref(false)

watch(
  profile,
  (value) => {
    fullName.value = value?.full_name || ''
  },
  { immediate: true },
)

const onSave = async () => {
  saving.value = true
  message.value = ''
  error.value = false
  try {
    const { error: saveError } = await updateProfile({
      full_name: fullName.value.trim(),
    })
    if (saveError) {
      error.value = true
      message.value = saveError.message
      return
    }
    message.value = 'Profile updated'
  } finally {
    saving.value = false
  }
}
</script>
