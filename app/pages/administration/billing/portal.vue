<template>
  <div class="mx-auto w-full max-w-3xl flex-1 px-6 py-10 lg:px-8">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p class="text-[10px] uppercase tracking-wide text-[var(--mute-soft)]">
          Mock billing portal
        </p>
        <h1 class="mt-1 font-display text-3xl font-semibold text-[var(--ink)]">
          Manage subscription
        </h1>
        <p class="mt-2 text-sm text-[var(--mute)]">
          Renew, cancel, or buy capacity add-ons without charging a card.
        </p>
      </div>
      <NuxtLink
        to="/administration/billing"
        class="btn-secondary !px-4 !py-2"
      >
        Plans
      </NuxtLink>
    </div>

    <p
      v-if="notice"
      class="mt-4 rounded-md border border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-2 text-sm text-[var(--ink)]"
    >
      {{ notice }}
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
      Loading…
    </div>

    <template v-else-if="licence">
      <div class="panel mt-8 p-5">
        <p class="text-[10px] uppercase tracking-wide text-[var(--mute-soft)]">
          Current
        </p>
        <h2 class="font-display text-2xl font-semibold text-[var(--ink)]">
          {{ licence.planName || licence.planKey }}
        </h2>
        <p class="mt-1 text-sm text-[var(--mute)]">
          Status {{ licence.status }}
          <span v-if="licence.currentPeriodEnd">
            · ends {{ formatDate(licence.currentPeriodEnd) }}
          </span>
        </p>
      </div>

      <section class="mt-8 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          class="btn-primary !px-4 !py-3"
          :disabled="busy"
          @click="runAction('renew')"
        >
          Renew period (mock)
        </button>
        <button
          type="button"
          class="btn-secondary !px-4 !py-3"
          :disabled="busy"
          @click="changePlan"
        >
          Change plan
        </button>
        <button
          type="button"
          class="btn-secondary !px-4 !py-3 text-[var(--danger)]"
          :disabled="busy"
          @click="runAction('cancel')"
        >
          Cancel subscription (mock)
        </button>
      </section>

      <section class="mt-10">
        <h3 class="text-sm font-semibold text-[var(--ink)]">
          Buy add-ons
        </h3>
        <ul class="mt-3 space-y-2">
          <li
            v-for="addon in addons"
            :key="addon.key"
            class="panel flex items-center justify-between gap-3 px-4 py-3"
          >
            <div>
              <p class="text-sm text-[var(--ink)]">
                {{ addon.name }}
              </p>
              <p class="text-xs text-[var(--mute)]">
                {{ addon.priceLabel }}
              </p>
            </div>
            <input
              v-model.number="addonQty[addon.key]"
              type="number"
              min="0"
              max="50"
              class="w-16 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm text-[var(--ink)]"
            >
          </li>
        </ul>
        <button
          type="button"
          class="btn-primary mt-4 !px-4 !py-2"
          :disabled="busy || !hasAddonSelection"
          @click="buyAddons"
        >
          Purchase add-ons (mock)
        </button>
      </section>
    </template>
  </div>
</template>

<script setup>
definePageMeta({
  layout: 'app',
  middleware: ['auth', 'admin'],
})

useHead({ title: 'Billing portal' })

const { activeOrganization } = useOrganization()
const { confirm } = useAppConfirm()
const authedFetch = useAuthedFetch()

const pending = ref(true)
const busy = ref(false)
const error = ref('')
const notice = ref('')
const licence = ref(null)
const addons = ref([])
const addonQty = reactive({})

const hasAddonSelection = computed(() =>
  addons.value.some((a) => Number(addonQty[a.key]) > 0),
)

function formatDate(value) {
  try {
    return new Date(value).toLocaleString()
  }
  catch {
    return String(value)
  }
}

async function ensurePortal() {
  await authedFetch('/api/billing/portal/session', {
    method: 'POST',
    body: { organizationId: activeOrganization.value.id },
  })
}

async function load() {
  if (!activeOrganization.value?.id) {
    pending.value = false
    return
  }
  pending.value = true
  error.value = ''
  try {
    await ensurePortal()
    const [lic, catalog] = await Promise.all([
      authedFetch('/api/licence/current', {
        query: { organizationId: activeOrganization.value.id },
      }),
      authedFetch('/api/billing/catalog', {
        query: { organizationId: activeOrganization.value.id },
      }),
    ])
    licence.value = lic.licence
    addons.value = catalog.addons || []
    for (const a of addons.value) {
      if (addonQty[a.key] == null) addonQty[a.key] = 0
    }
  }
  catch (err) {
    error.value = err?.data?.statusMessage || err?.message || 'Failed to open portal'
  }
  finally {
    pending.value = false
  }
}

async function runAction(action) {
  if (!activeOrganization.value?.id) return
  if (action === 'cancel') {
    const ok = await confirm({
      title: 'Cancel subscription?',
      message: 'Mock cancel sets status to canceled. After the renew refresh window, features lock.',
      confirmLabel: 'Cancel subscription',
      danger: true,
    })
    if (!ok) return
  }
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    const res = await authedFetch('/api/billing/portal/action', {
      method: 'POST',
      body: {
        organizationId: activeOrganization.value.id,
        action,
        periodDays: 30,
      },
    })
    licence.value = res.licence
    notice.value = res.message || 'Done'
  }
  catch (err) {
    error.value = err?.data?.statusMessage || err?.message || 'Action failed'
  }
  finally {
    busy.value = false
  }
}

async function buyAddons() {
  if (!activeOrganization.value?.id) return
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    const selections = addons.value
      .map((a) => ({ key: a.key, quantity: Number(addonQty[a.key]) || 0 }))
      .filter((s) => s.quantity > 0)
    const res = await authedFetch('/api/billing/portal/action', {
      method: 'POST',
      body: {
        organizationId: activeOrganization.value.id,
        action: 'addons',
        addons: selections,
      },
    })
    licence.value = res.licence
    notice.value = res.message || 'Add-ons applied'
    for (const a of addons.value) addonQty[a.key] = 0
  }
  catch (err) {
    error.value = err?.data?.statusMessage || err?.message || 'Add-on purchase failed'
  }
  finally {
    busy.value = false
  }
}

function changePlan() {
  navigateTo('/administration/billing')
}

watch(() => activeOrganization.value?.id, () => load(), { immediate: true })
</script>
