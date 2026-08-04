<template>
  <div class="flex flex-1 items-center justify-center px-6 py-16">
    <p class="text-sm text-[var(--mute)]">Completing sign-in…</p>
  </div>
</template>

<script setup>
definePageMeta({
  layout: 'plain',
  ssr: false,
})

useHead({ title: 'Auth callback' })

const supabase = useSupabase()
const route = useRoute()

onMounted(async () => {
  const next =
    typeof route.query.next === 'string' && route.query.next.startsWith('/')
      ? route.query.next
      : '/auth/reset-password'

  const err = route.query.error_description || route.query.error
  if (err) {
    await navigateTo({ path: '/login', query: { error: String(err) } })
    return
  }

  const tokenHash =
    typeof route.query.token_hash === 'string' ? route.query.token_hash : null
  const otpType =
    typeof route.query.type === 'string' ? route.query.type : 'recovery'

  if (tokenHash) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: otpType,
    })
    if (error) {
      await navigateTo({ path: '/login', query: { error: error.message } })
      return
    }
    await navigateTo(next)
    return
  }

  const code = typeof route.query.code === 'string' ? route.query.code : null
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error && error.name !== 'AbortError' && !/aborted/i.test(error.message || '')) {
      await navigateTo({ path: '/login', query: { error: error.message } })
      return
    }
  }

  await navigateTo(next)
})
</script>
