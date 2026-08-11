/**
 * Load mock checkout session from httpOnly cookie.
 * Query: sessionId, organizationId
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const sessionId = String(query.sessionId || '')
  const organizationId = String(query.organizationId || '')

  if (!sessionId || !organizationId) {
    throw createError({ statusCode: 400, statusMessage: 'sessionId and organizationId are required' })
  }

  await requireOrgAdmin(event, organizationId)

  const token = getCookie(event, `billing_checkout_${sessionId}`)
  if (!token) {
    throw createError({ statusCode: 404, statusMessage: 'Checkout session not found or expired' })
  }

  const session = readMockCheckoutSession(token)
  if (session.organizationId !== organizationId) {
    throw createError({ statusCode: 403, statusMessage: 'Session does not belong to this organization' })
  }

  const offer = findPlanOffer(String(session.offerId))

  return {
    mode: 'mock',
    sessionId,
    status: session.status || 'open',
    summary: {
      offerId: session.offerId,
      planKey: session.planKey,
      planName: offer?.name || session.planKey,
      interval: session.interval,
      periodDays: session.periodDays,
      planAmountCents: session.planAmountCents,
      addonLines: session.addonLines || [],
      totalCents: session.totalCents,
      currency: session.currency,
      totalLabel: formatMoney(session.totalCents, session.currency),
    },
    notice: 'Mock checkout — card fields are decorative. Confirm accepts payment as successful without charging.',
  }
})
