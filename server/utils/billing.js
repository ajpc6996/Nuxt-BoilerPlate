import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto'
import {
  BILLING_ADDONS,
  BILLING_PLAN_OFFERS,
  billingOfferId,
  findAddon,
  findPlanOffer,
  formatMoney,
  sumAddonLimitDeltas,
} from '~~/shared/billing.js'
import { normalizeLicenceLimits } from '~~/shared/licence.js'

/**
 * @returns {string}
 */
function billingSecret() {
  const config = useRuntimeConfig()
  const secret = String(
    config.licenceSigningSecret
    || config.supabaseSecretKey
    || '',
  ).trim()
  if (!secret) {
    throw createError({
      statusCode: 500,
      statusMessage: 'LICENCE_SIGNING_SECRET (or SUPABASE_SECRET_KEY) is required for mock billing',
    })
  }
  return secret
}

/**
 * @param {Record<string, unknown>} payload
 */
function signPayload(payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  const sig = createHmac('sha256', billingSecret()).update(body).digest('base64url')
  return `${body}.${sig}`
}

/**
 * @param {string} token
 */
function verifyPayload(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  try {
    const expected = createHmac('sha256', billingSecret()).update(body).digest('base64url')
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    if (parsed?.exp && Date.now() > Number(parsed.exp)) return null
    return parsed
  }
  catch {
    return null
  }
}

/**
 * Public catalog for org admins (all plans + add-ons).
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 */
export async function getBillingCatalog(admin) {
  const { data: plans, error } = await admin
    .from('licence_plans')
    .select('key, name, description, features, limits, trial_days, is_active, sort_order')
    .eq('is_active', true)
    .order('sort_order')

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  const byKey = Object.fromEntries((plans || []).map((p) => [p.key, p]))

  const offers = BILLING_PLAN_OFFERS.map((offer) => {
    const plan = byKey[offer.key]
    return {
      offerId: billingOfferId(offer),
      planKey: offer.key,
      name: offer.name,
      description: offer.description,
      interval: offer.interval,
      amountCents: offer.amountCents,
      currency: offer.currency,
      periodDays: offer.periodDays,
      priceLabel: formatMoney(offer.amountCents, offer.currency),
      features: plan?.features || {},
      limits: plan?.limits || {},
      available: Boolean(plan),
    }
  }).filter((o) => o.available)

  const addons = BILLING_ADDONS.map((a) => ({
    ...a,
    priceLabel: formatMoney(a.amountCents, a.currency),
  }))

  return {
    mode: 'mock',
    notice: 'Mock billing — no card is charged. Completing checkout marks payment successful and updates the org licence.',
    offers,
    addons,
  }
}

/**
 * Create a signed mock Checkout session.
 * @param {{
 *   organizationId: string,
 *   userId: string,
 *   offerId: string,
 *   addonSelections?: Array<{ key: string, quantity?: number }>,
 *   successPath?: string,
 *   cancelPath?: string,
 * }} opts
 */
export function createMockCheckoutSession(opts) {
  const offer = findPlanOffer(opts.offerId)
  if (!offer) {
    throw createError({ statusCode: 400, statusMessage: 'Unknown plan offer' })
  }

  const selections = (opts.addonSelections || [])
    .map((s) => ({
      key: String(s.key),
      quantity: Math.max(1, Math.min(50, Number(s.quantity) || 1)),
    }))
    .filter((s) => findAddon(s.key))

  let addonsTotal = 0
  const addonLines = selections.map((s) => {
    const addon = findAddon(s.key)
    const line = addon.amountCents * s.quantity
    addonsTotal += line
    return {
      key: addon.key,
      name: addon.name,
      quantity: s.quantity,
      amountCents: line,
      priceLabel: formatMoney(line, addon.currency),
    }
  })

  const sessionId = `mcs_${randomBytes(12).toString('hex')}`
  const payload = {
    typ: 'checkout',
    sid: sessionId,
    organizationId: opts.organizationId,
    userId: opts.userId,
    offerId: billingOfferId(offer),
    planKey: offer.key,
    interval: offer.interval,
    periodDays: offer.periodDays,
    planAmountCents: offer.amountCents,
    currency: offer.currency,
    addons: selections,
    addonLines,
    totalCents: offer.amountCents + addonsTotal,
    successPath: opts.successPath || '/administration/billing/success',
    cancelPath: opts.cancelPath || '/administration/billing',
    status: 'open',
    iat: Date.now(),
    exp: Date.now() + 60 * 60 * 1000,
  }

  return {
    sessionId,
    sessionToken: signPayload(payload),
    checkoutPath: `/administration/billing/checkout/${sessionId}`,
    summary: {
      offerId: payload.offerId,
      planKey: payload.planKey,
      planName: offer.name,
      interval: payload.interval,
      periodDays: payload.periodDays,
      planAmountCents: payload.planAmountCents,
      addonLines,
      totalCents: payload.totalCents,
      currency: payload.currency,
      totalLabel: formatMoney(payload.totalCents, payload.currency),
      mode: 'mock',
    },
  }
}

/**
 * @param {string} sessionToken
 */
export function readMockCheckoutSession(sessionToken) {
  const payload = verifyPayload(sessionToken)
  if (!payload || payload.typ !== 'checkout') {
    throw createError({ statusCode: 400, statusMessage: 'Invalid or expired checkout session' })
  }
  return payload
}

/**
 * Apply a successful mock payment to the org licence.
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {Record<string, unknown>} session
 */
export async function completeMockCheckout(admin, session) {
  const offer = findPlanOffer(String(session.offerId))
  if (!offer) {
    throw createError({ statusCode: 400, statusMessage: 'Unknown plan offer on session' })
  }

  const { data: plan } = await admin
    .from('licence_plans')
    .select('limits')
    .eq('key', offer.key)
    .maybeSingle()

  const planLimits = normalizeLicenceLimits(plan?.limits || {})
  const deltas = sumAddonLimitDeltas(session.addons || [])
  /** @type {Record<string, number>} */
  const overrideLimits = {}
  for (const [key, delta] of Object.entries(deltas)) {
    const base = planLimits[key]
    if (base === -1) continue
    overrideLimits[key] = Number(base) + Number(delta)
  }

  const { data: existing } = await admin
    .from('organization_licences')
    .select('stripe_customer_id')
    .eq('organization_id', session.organizationId)
    .maybeSingle()

  const mockCustomerId = existing?.stripe_customer_id || `cus_mock_${String(session.organizationId).slice(0, 8)}`
  const mockSubId = `sub_mock_${randomBytes(8).toString('hex')}`

  const status = offer.key === 'trial' ? 'trialing' : 'active'

  const result = await assignOrgLicence(admin, {
    organizationId: String(session.organizationId),
    planKey: offer.key,
    status,
    periodDays: offer.periodDays,
    overrides: {
      features: {},
      limits: overrideLimits,
    },
    notes: `Mock checkout ${session.sid} (${offer.interval})`,
    assignedBy: session.userId || null,
  })

  await admin
    .from('organization_licences')
    .update({
      stripe_customer_id: mockCustomerId,
      stripe_subscription_id: mockSubId,
      last_validated_at: new Date().toISOString(),
    })
    .eq('organization_id', session.organizationId)

  const licence = await resolveOrgLicence(admin, String(session.organizationId))
  const usage = await measureOrgUsage(admin, String(session.organizationId))

  return {
    mode: 'mock',
    paymentStatus: 'succeeded',
    mock: {
      customerId: mockCustomerId,
      subscriptionId: mockSubId,
      chargedCents: 0,
      displayedTotalCents: session.totalCents,
      message: 'Payment accepted (mock). No card was charged.',
    },
    licence,
    usage,
    item: result.item,
  }
}

/**
 * Create a mock Customer Portal session token.
 * @param {{ organizationId: string, userId: string }} opts
 */
export function createMockPortalSession(opts) {
  const sessionId = `mps_${randomBytes(12).toString('hex')}`
  const payload = {
    typ: 'portal',
    sid: sessionId,
    organizationId: opts.organizationId,
    userId: opts.userId,
    iat: Date.now(),
    exp: Date.now() + 60 * 60 * 1000,
  }
  return {
    sessionId,
    sessionToken: signPayload(payload),
    portalPath: `/administration/billing/portal?token=${encodeURIComponent(signPayload(payload))}`,
  }
}

/**
 * @param {string} sessionToken
 */
export function readMockPortalSession(sessionToken) {
  const payload = verifyPayload(sessionToken)
  if (!payload || payload.typ !== 'portal') {
    throw createError({ statusCode: 400, statusMessage: 'Invalid or expired portal session' })
  }
  return payload
}

/**
 * Renew current plan period (mock).
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {string} organizationId
 * @param {string} [userId]
 * @param {number} [periodDays]
 */
export async function mockRenewLicence(admin, organizationId, userId, periodDays) {
  const current = await resolveOrgLicence(admin, organizationId)
  const days = Math.max(1, Number(periodDays) || 30)
  return assignOrgLicence(admin, {
    organizationId,
    planKey: current.planKey,
    status: current.planKey === 'trial' ? 'trialing' : 'active',
    periodDays: days,
    overrides: current.raw?.overrides || {},
    notes: `Mock renew (+${days}d)`,
    assignedBy: userId || null,
  })
}

/**
 * Cancel subscription (mock) — enters renew refresh then lock via status machine.
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {string} organizationId
 */
export async function mockCancelLicence(admin, organizationId) {
  const { data, error } = await admin
    .from('organization_licences')
    .update({
      status: 'canceled',
      stripe_subscription_id: null,
      notes: 'Canceled via mock billing portal',
      last_validated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('organization_id', organizationId)
    .select('*')
    .single()

  if (error || !data) {
    throw createError({
      statusCode: 500,
      statusMessage: error?.message || 'Cancel failed',
    })
  }

  return resolveOrgLicence(admin, organizationId)
}

/**
 * Apply add-on packs only (no plan change) — mock purchase.
 * Overrides store absolute limit values (current effective + bumps).
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {{
 *   organizationId: string,
 *   userId?: string,
 *   addonSelections: Array<{ key: string, quantity?: number }>,
 * }} opts
 */
export async function mockPurchaseAddons(admin, opts) {
  const current = await resolveOrgLicence(admin, opts.organizationId)
  const deltas = sumAddonLimitDeltas(opts.addonSelections || [])
  if (!Object.keys(deltas).length) {
    throw createError({ statusCode: 400, statusMessage: 'Select at least one add-on' })
  }

  const existingOverrides = current.raw?.overrides && typeof current.raw.overrides === 'object'
    ? current.raw.overrides
    : {}
  const priorAbsolute = existingOverrides.limits && typeof existingOverrides.limits === 'object'
    ? { ...existingOverrides.limits }
    : {}

  /** @type {Record<string, number>} */
  const nextAbsolute = { ...priorAbsolute }
  for (const [key, delta] of Object.entries(deltas)) {
    const effective = Number(current.limits?.[key])
    if (effective === -1) continue
    const base = Number.isFinite(Number(priorAbsolute[key]))
      ? Number(priorAbsolute[key])
      : effective
    nextAbsolute[key] = base + Number(delta)
  }

  const periodDays = current.currentPeriodEnd
    ? Math.max(
      1,
      Math.ceil((new Date(current.currentPeriodEnd).getTime() - Date.now()) / (24 * 60 * 60 * 1000)),
    )
    : 30

  const restoreStatus = ['locked', 'canceled', 'past_due'].includes(current.status)
    ? (current.planKey === 'trial' ? 'trialing' : 'active')
    : current.status

  await assignOrgLicence(admin, {
    organizationId: opts.organizationId,
    planKey: current.planKey,
    status: restoreStatus,
    periodDays,
    overrides: {
      features: existingOverrides.features || {},
      limits: nextAbsolute,
    },
    notes: 'Mock add-on purchase',
    assignedBy: opts.userId || null,
  })

  return {
    mode: 'mock',
    paymentStatus: 'succeeded',
    licence: await resolveOrgLicence(admin, opts.organizationId),
    usage: await measureOrgUsage(admin, opts.organizationId),
  }
}

export { formatMoney, billingOfferId, findPlanOffer }
