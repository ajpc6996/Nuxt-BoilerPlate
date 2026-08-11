/**
 * Open mock Billing Portal session.
 * Body: { organizationId }
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const organizationId = String(body?.organizationId || '')
  if (!organizationId) {
    throw createError({ statusCode: 400, statusMessage: 'organizationId is required' })
  }

  const { user } = await requireOrgAdmin(event, organizationId)
  const created = createMockPortalSession({
    organizationId,
    userId: user.id,
  })

  setCookie(event, `billing_portal_${organizationId}`, created.sessionToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60,
    path: '/',
  })

  return {
    mode: 'mock',
    sessionId: created.sessionId,
    portalPath: '/administration/billing/portal',
  }
})
