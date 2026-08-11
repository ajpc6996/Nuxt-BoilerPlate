<template>
  <div class="mx-auto w-full max-w-6xl flex-1 px-6 py-10 lg:px-8">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="font-display text-3xl font-semibold text-[var(--ink)]">
          Billing
        </h1>
        <p class="mt-2 max-w-2xl text-sm text-[var(--mute)]">
          Choose a plan and optional capacity add-ons for
          <span class="text-[var(--accent-ink)]">{{ activeOrganization?.name || '—' }}</span>.
          <span class="text-[var(--accent-ink)]"> Mock mode — no card is charged.</span>
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="btn-secondary !px-4 !py-2"
          :disabled="portalBusy"
          @click="openPortal"
        >
          {{ portalBusy ? 'Opening…' : 'Billing portal' }}
        </button>
        <NuxtLink
          to="/administration/licence"
          class="btn-secondary !px-4 !py-2"
        >
          Licence
        </NuxtLink>
      </div>
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
      Loading catalog…
    </div>

    <template v-else>
      <section class="mt-8">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="text-sm font-semibold text-[var(--ink)]">
            Plans
          </h2>
          <div class="inline-flex rounded-md border border-[var(--border)] p-0.5 text-xs">
            <button
              type="button"
              class="rounded px-3 py-1"
              :class="intervalFilter === 'month'
                ? 'bg-[var(--accent-soft)] text-[var(--accent-ink)]'
                : 'text-[var(--mute)]'"
              @click="intervalFilter = 'month'"
            >
              Monthly
            </button>
            <button
              type="button"
              class="rounded px-3 py-1"
              :class="intervalFilter === 'year'
                ? 'bg-[var(--accent-soft)] text-[var(--accent-ink)]'
                : 'text-[var(--mute)]'"
              @click="intervalFilter = 'year'"
            >
              Annual
            </button>
            <button
              type="button"
              class="rounded px-3 py-1"
              :class="intervalFilter === 'all'
                ? 'bg-[var(--accent-soft)] text-[var(--accent-ink)]'
                : 'text-[var(--mute)]'"
              @click="intervalFilter = 'all'"
            >
              All
            </button>
          </div>
        </div>

        <ul class="mt-4 grid gap-4 lg:grid-cols-2">
          <li
            v-for="offer in filteredOffers"
            :key="offer.offerId"
            class="panel cursor-pointer p-5 transition hover:border-[var(--accent)]"
            :class="selectedOfferId === offer.offerId ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : ''"
            @click="selectedOfferId = offer.offerId"
          >
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="font-display text-xl font-semibold text-[var(--ink)]">
                  {{ offer.name }}
                </p>
                <p class="mt-1 text-sm text-[var(--mute)]">
                  {{ offer.description }}
                </p>
                <p
                  v-if="offer.planKey === currentPlanKey"
                  class="mt-2 text-[10px] uppercase tracking-wide text-[var(--accent-ink)]"
                >
                  Current plan
                </p>
              </div>
              <p class="shrink-0 font-mono text-lg text-[var(--ink)]">
                {{ offer.priceLabel }}
                <span class="text-xs text-[var(--mute)]">/ {{ offer.interval }}</span>
              </p>
            </div>
            <ul class="mt-3 flex flex-wrap gap-1.5 text-[10px] text-[var(--mute)]">
              <li
                v-for="(val, key) in offer.limits"
                :key="key"
                class="rounded border border-[var(--border-soft)] px-1.5 py-0.5"
              >
                {{ key }}: {{ val === -1 ? '∞' : val }}
              </li>
            </ul>
          </li>
        </ul>
      </section>

      <section class="mt-10">
        <h2 class="text-sm font-semibold text-[var(--ink)]">
          Capacity add-ons
        </h2>
        <p class="mt-1 text-xs text-[var(--mute)]">
          Optional. Applied as absolute limit overrides on top of the selected plan.
        </p>
        <ul class="mt-4 grid gap-3 sm:grid-cols-2">
          <li
            v-for="addon in addons"
            :key="addon.key"
            class="panel flex items-center justify-between gap-3 px-4 py-3"
          >
            <div class="min-w-0">
              <p class="text-sm font-medium text-[var(--ink)]">
                {{ addon.name }}
              </p>
              <p class="text-xs text-[var(--mute)]">
                {{ addon.description }} · {{ addon.priceLabel }} each
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
      </section>

      <div class="mt-8 flex flex-wrap items-center justify-between gap-3">
        <p class="text-sm text-[var(--mute)]">
          Estimated total:
          <span class="font-mono text-[var(--ink)]">{{ estimatedTotalLabel }}</span>
          <span class="text-xs">(display only — mock charge is $0)</span>
        </p>
        <button
          type="button"
          class="btn-primary !px-5 !py-2"
          :disabled="checkoutBusy || !selectedOfferId"
          @click="startCheckout"
        >
          {{ checkoutBusy ? 'Starting…' : 'Continue to checkout' }}
        </button>
      </div>
    </template>
  </div>
</template>

<script setup>
import { formatMoney } from '~~/shared/billing.js'

definePageMeta({
  layout: 'app',
  middleware: ['auth', 'admin'],
})

useHead({ title: 'Billing' })

const { activeOrganization } = useOrganization()
const authedFetch = useAuthedFetch()

const pending = ref(true)
const error = ref('')
const notice = ref('')
const offers = ref([])
const addons = ref([])
const currentPlanKey = ref('')
const selectedOfferId = ref('')
const intervalFilter = ref('month')
const addonQty = reactive({})
const checkoutBusy = ref(false)
const portalBusy = ref(false)

const filteredOffers = computed(() => {
  if (intervalFilter.value === 'all') return offers.value
  return offers.value.filter((o) => o.interval === intervalFilter.value)
})

const estimatedTotalLabel = computed(() => {
  const offer = offers.value.find((o) => o.offerId === selectedOfferId.value)
  let total = Number(offer?.amountCents || 0)
  for (const addon of addons.value) {
    const qty = Math.max(0, Number(addonQty[addon.key]) || 0)
    total += qty * Number(addon.amountCents || 0)
  }
  return formatMoney(total, offer?.currency || 'usd')
})

async function load() {
  if (!activeOrganization.value?.id) {
    pending.value = false
    return
  }
  pending.value = true
  error.value = ''
  try {
    const res = await authedFetch('/api/billing/catalog', {
      query: { organizationId: activeOrganization.value.id },
    })
    offers.value = res.offers || []
    addons.value = res.addons || []
    currentPlanKey.value = res.currentPlanKey || ''
    notice.value = res.notice || ''
    for (const a of addons.value) {
      if (addonQty[a.key] == null) addonQty[a.key] = 0
    }
    if (!selectedOfferId.value && offers.value.length) {
      const current = offers.value.find(
        (o) => o.planKey === currentPlanKey.value && o.interval === 'month',
      )
      selectedOfferId.value = current?.offerId || offers.value[0].offerId
    }
  }
  catch (err) {
    error.value = err?.data?.statusMessage || err?.message || 'Failed to load catalog'
  }
  finally {
    pending.value = false
  }
}

async function startCheckout() {
  if (!activeOrganization.value?.id || !selectedOfferId.value) return
  checkoutBusy.value = true
  error.value = ''
  try {
    const addonSelections = addons.value
      .map((a) => ({ key: a.key, quantity: Number(addonQty[a.key]) || 0 }))
      .filter((s) => s.quantity > 0)

    const res = await authedFetch('/api/billing/checkout/session', {
      method: 'POST',
      body: {
        organizationId: activeOrganization.value.id,
        offerId: selectedOfferId.value,
        addons: addonSelections,
      },
    })
    await navigateTo(res.checkoutPath)
  }
  catch (err) {
    error.value = err?.data?.statusMessage || err?.message || 'Checkout failed'
  }
  finally {
    checkoutBusy.value = false
  }
}

async function openPortal() {
  if (!activeOrganization.value?.id) return
  portalBusy.value = true
  error.value = ''
  try {
    const res = await authedFetch('/api/billing/portal/session', {
      method: 'POST',
      body: { organizationId: activeOrganization.value.id },
    })
    await navigateTo(res.portalPath)
  }
  catch (err) {
    error.value = err?.data?.statusMessage || err?.message || 'Portal failed'
  }
  finally {
    portalBusy.value = false
  }
}

watch(() => activeOrganization.value?.id, () => load(), { immediate: true })
</script>
