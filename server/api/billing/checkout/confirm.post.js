/**
 * Confirm mock checkout — always succeeds (no card charged).
 * Body: { organizationId, sessionId }
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const organizationId = String(body?.organizationId || '')
  const sessionId = String(body?.sessionId || '')

  if (!organizationId || !sessionId) {
    throw createError({ statusCode: 400, statusMessage: 'organizationId and sessionId are required' })
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

  const admin = useSupabaseAdmin()
  const result = await completeMockCheckout(admin, session)

  deleteCookie(event, `billing_checkout_${sessionId}`, { path: '/' })

  return result
})
