<template>
  <div class="mx-auto w-full max-w-xl flex-1 px-6 py-10 lg:px-8">
    <p class="text-[10px] uppercase tracking-wide text-[var(--mute-soft)]">
      Mock checkout
    </p>
    <h1 class="mt-1 font-display text-3xl font-semibold text-[var(--ink)]">
      Confirm purchase
    </h1>
    <p class="mt-2 text-sm text-[var(--mute)]">
      No payment details are sent. Confirming accepts the purchase as successful.
    </p>

    <p
      v-if="error"
      class="mt-4 rounded-md border border-[var(--danger)] px-3 py-2 text-sm text-[var(--danger)]"
    >
      {{ error }}
    </p>

    <div
      v-if="pending"
      class="mt-8 text-sm text-[var(--mute)]"
    >
      Loading session…
    </div>

    <template v-else-if="summary">
      <div class="panel mt-8 space-y-3 p-5">
        <div class="flex justify-between gap-3 text-sm">
          <span class="text-[var(--mute)]">Plan</span>
          <span class="text-[var(--ink)]">{{ summary.planName }} ({{ summary.interval }})</span>
        </div>
        <div class="flex justify-between gap-3 text-sm">
          <span class="text-[var(--mute)]">Period</span>
          <span class="text-[var(--ink)]">{{ summary.periodDays }} days</span>
        </div>
        <div
          v-for="line in summary.addonLines"
          :key="line.key"
          class="flex justify-between gap-3 text-sm"
        >
          <span class="text-[var(--mute)]">{{ line.name }} × {{ line.quantity }}</span>
          <span class="font-mono text-[var(--ink)]">{{ line.priceLabel }}</span>
        </div>
        <div class="flex justify-between gap-3 border-t border-[var(--border-soft)] pt-3 text-sm font-semibold">
          <span class="text-[var(--ink)]">Display total</span>
          <span class="font-mono text-[var(--ink)]">{{ summary.totalLabel }}</span>
        </div>
        <p class="text-xs text-[var(--accent-ink)]">
          Charged amount: $0.00 (mock)
        </p>
      </div>

      <fieldset class="panel mt-4 space-y-3 p-5 opacity-60">
        <legend class="px-1 text-xs uppercase tracking-wide text-[var(--mute-soft)]">
          Card (not submitted)
        </legend>
        <input
          type="text"
          disabled
          placeholder="4242 4242 4242 4242"
          class="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--mute)]"
        >
        <div class="grid grid-cols-2 gap-3">
          <input
            type="text"
            disabled
            placeholder="MM / YY"
            class="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--mute)]"
          >
          <input
            type="text"
            disabled
            placeholder="CVC"
            class="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--mute)]"
          >
        </div>
      </fieldset>

      <div class="mt-6 flex flex-wrap gap-2">
        <button
          type="button"
          class="btn-primary !px-5 !py-2"
          :disabled="busy"
          @click="confirm"
        >
          {{ busy ? 'Processing…' : 'Complete purchase (mock)' }}
        </button>
        <NuxtLink
          to="/administration/billing"
          class="btn-secondary !px-4 !py-2"
        >
          Cancel
        </NuxtLink>
      </div>
    </template>
  </div>
</template>

<script setup>
definePageMeta({
  layout: 'app',
  middleware: ['auth', 'admin'],
})

useHead({ title: 'Checkout' })

const route = useRoute()
const { activeOrganization } = useOrganization()
const authedFetch = useAuthedFetch()

const sessionId = computed(() => String(route.params.sessionId || ''))
const pending = ref(true)
const busy = ref(false)
const error = ref('')
const summary = ref(null)

async function load() {
  if (!activeOrganization.value?.id || !sessionId.value) {
    pending.value = false
    error.value = 'Missing organization or session'
    return
  }
  pending.value = true
  error.value = ''
  try {
    const res = await authedFetch('/api/billing/checkout/session', {
      query: {
        sessionId: sessionId.value,
        organizationId: activeOrganization.value.id,
      },
    })
    summary.value = res.summary
  }
  catch (err) {
    error.value = err?.data?.statusMessage || err?.message || 'Session load failed'
    summary.value = null
  }
  finally {
    pending.value = false
  }
}

async function confirm() {
  if (!activeOrganization.value?.id || !sessionId.value) return
  busy.value = true
  error.value = ''
  try {
    const res = await authedFetch('/api/billing/checkout/confirm', {
      method: 'POST',
      body: {
        organizationId: activeOrganization.value.id,
        sessionId: sessionId.value,
      },
    })
    await navigateTo({
      path: '/administration/billing/success',
      query: {
        plan: res.licence?.planKey || '',
        status: res.licence?.status || '',
      },
    })
  }
  catch (err) {
    error.value = err?.data?.statusMessage || err?.message || 'Confirm failed'
  }
  finally {
    busy.value = false
  }
}

watch(
  () => [activeOrganization.value?.id, sessionId.value],
  () => load(),
  { immediate: true },
)
</script>
