/**
 * Create mock Checkout session (no Stripe).
 * Body: { organizationId, offerId, addons?: [{ key, quantity }] }
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const organizationId = String(body?.organizationId || '')
  const offerId = String(body?.offerId || '')

  if (!organizationId || !offerId) {
    throw createError({ statusCode: 400, statusMessage: 'organizationId and offerId are required' })
  }

  const { user } = await requireOrgAdmin(event, organizationId)
  const created = createMockCheckoutSession({
    organizationId,
    userId: user.id,
    offerId,
    addonSelections: Array.isArray(body?.addons) ? body.addons : [],
  })

  setCookie(event, `billing_checkout_${created.sessionId}`, created.sessionToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60,
    path: '/',
  })

  return {
    mode: 'mock',
    sessionId: created.sessionId,
    checkoutPath: created.checkoutPath,
    summary: created.summary,
  }
})
