/**
 * Mock billing catalog (Stripe stand-in).
 * Prices are display-only; checkout never charges a real card.
 */

/** @typedef {{ key: string, name: string, description: string, interval: 'month'|'year', amountCents: number, currency: string, periodDays: number }} BillingPlanOffer */

/** @typedef {{ key: string, name: string, description: string, amountCents: number, currency: string, limitDeltas: Record<string, number> }} BillingAddon */

/** Plan commercial offers — every licence plan is purchasable. */
export const BILLING_PLAN_OFFERS = Object.freeze([
  {
    key: 'trial',
    name: 'Trial',
    description: '14-day style trial caps. Mock checkout activates immediately (no card).',
    interval: 'month',
    amountCents: 0,
    currency: 'usd',
    periodDays: 14,
  },
  {
    key: 'starter',
    name: 'Starter',
    description: 'Small teams — core analytics and modest ingest.',
    interval: 'month',
    amountCents: 4900,
    currency: 'usd',
    periodDays: 30,
  },
  {
    key: 'pro',
    name: 'Pro',
    description: 'Growing orgs — higher limits, MFA required, connector types.',
    interval: 'month',
    amountCents: 14900,
    currency: 'usd',
    periodDays: 30,
  },
  {
    key: 'enterprise',
    name: 'Enterprise',
    description: 'Unlimited ceilings for large deployments.',
    interval: 'month',
    amountCents: 49900,
    currency: 'usd',
    periodDays: 30,
  },
  {
    key: 'starter',
    name: 'Starter (annual)',
    description: 'Starter billed yearly (2 months free in mock pricing).',
    interval: 'year',
    amountCents: 49000,
    currency: 'usd',
    periodDays: 365,
    offerId: 'starter_year',
  },
  {
    key: 'pro',
    name: 'Pro (annual)',
    description: 'Pro billed yearly (2 months free in mock pricing).',
    interval: 'year',
    amountCents: 149000,
    currency: 'usd',
    periodDays: 365,
    offerId: 'pro_year',
  },
  {
    key: 'enterprise',
    name: 'Enterprise (annual)',
    description: 'Enterprise billed yearly.',
    interval: 'year',
    amountCents: 499000,
    currency: 'usd',
    periodDays: 365,
    offerId: 'enterprise_year',
  },
])

/** Capacity add-ons applied as licence limit overrides. */
export const BILLING_ADDONS = Object.freeze([
  {
    key: 'seats_5',
    name: '+5 seats',
    description: 'Increase max active users by 5.',
    amountCents: 1500,
    currency: 'usd',
    limitDeltas: { maxUsers: 5 },
  },
  {
    key: 'connections_5',
    name: '+5 connections',
    description: 'Increase max connections by 5.',
    amountCents: 2000,
    currency: 'usd',
    limitDeltas: { maxConnections: 5 },
  },
  {
    key: 'sources_10',
    name: '+10 data sources',
    description: 'Increase max data sources by 10.',
    amountCents: 2500,
    currency: 'usd',
    limitDeltas: { maxDataSources: 10 },
  },
  {
    key: 'dashboards_10',
    name: '+10 dashboards',
    description: 'Increase max dashboards by 10.',
    amountCents: 2000,
    currency: 'usd',
    limitDeltas: { maxDashboards: 10 },
  },
  {
    key: 'reports_10',
    name: '+10 reports',
    description: 'Increase max reports by 10.',
    amountCents: 2000,
    currency: 'usd',
    limitDeltas: { maxReports: 10 },
  },
  {
    key: 'ingest_100k',
    name: '+100k ingest rows / month',
    description: 'Increase monthly ingest allowance by 100,000 rows.',
    amountCents: 3000,
    currency: 'usd',
    limitDeltas: { maxIngestRowsPerMonth: 100000 },
  },
  {
    key: 'ingest_1m',
    name: '+1M ingest rows / month',
    description: 'Increase monthly ingest allowance by 1,000,000 rows.',
    amountCents: 20000,
    currency: 'usd',
    limitDeltas: { maxIngestRowsPerMonth: 1000000 },
  },
])

/**
 * Stable offer id for a plan row.
 * @param {{ key: string, interval: string, offerId?: string }} offer
 */
export function billingOfferId(offer) {
  return offer.offerId || `${offer.key}_${offer.interval}`
}

/**
 * @param {string} offerId
 */
export function findPlanOffer(offerId) {
  return BILLING_PLAN_OFFERS.find((o) => billingOfferId(o) === offerId) || null
}

/**
 * @param {string} key
 */
export function findAddon(key) {
  return BILLING_ADDONS.find((a) => a.key === key) || null
}

/**
 * @param {number} cents
 * @param {string} [currency='usd']
 */
export function formatMoney(cents, currency = 'usd') {
  const amount = Number(cents || 0) / 100
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: String(currency || 'usd').toUpperCase(),
    }).format(amount)
  }
  catch {
    return `$${amount.toFixed(2)}`
  }
}

/**
 * Sum deltas from addon keys (quantities supported).
 * @param {Array<{ key: string, quantity?: number }>} selections
 */
export function sumAddonLimitDeltas(selections) {
  /** @type {Record<string, number>} */
  const deltas = {}
  for (const sel of selections || []) {
    const addon = findAddon(sel.key)
    if (!addon) continue
    const qty = Math.max(1, Math.min(50, Number(sel.quantity) || 1))
    for (const [limitKey, delta] of Object.entries(addon.limitDeltas || {})) {
      deltas[limitKey] = (deltas[limitKey] || 0) + Number(delta) * qty
    }
  }
  return deltas
}

/**
 * Merge absolute override bumps onto existing override limits.
 * Unlimited (-1) stays unlimited.
 * @param {Record<string, number>} currentOverrides
 * @param {Record<string, number>} deltas
 */
export function applyLimitDeltas(currentOverrides, deltas) {
  const next = { ...(currentOverrides || {}) }
  for (const [key, delta] of Object.entries(deltas || {})) {
    const cur = next[key]
    if (cur === -1) continue
    const base = Number.isFinite(Number(cur)) ? Number(cur) : 0
    next[key] = base + Number(delta)
  }
  return next
}
