/**
 * Mock portal actions: renew | cancel | addons
 * Body: { organizationId, action, periodDays?, addons? }
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const organizationId = String(body?.organizationId || '')
  const action = String(body?.action || '').toLowerCase()

  if (!organizationId || !action) {
    throw createError({ statusCode: 400, statusMessage: 'organizationId and action are required' })
  }

  const { user } = await requireOrgAdmin(event, organizationId)

  const portalToken = getCookie(event, `billing_portal_${organizationId}`)
  if (!portalToken) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Open the billing portal first',
    })
  }
  const portal = readMockPortalSession(portalToken)
  if (portal.organizationId !== organizationId) {
    throw createError({ statusCode: 403, statusMessage: 'Portal session mismatch' })
  }

  const admin = useSupabaseAdmin()

  if (action === 'renew') {
    await mockRenewLicence(admin, organizationId, user.id, body?.periodDays)
    return {
      mode: 'mock',
      paymentStatus: 'succeeded',
      message: 'Renewal accepted (mock). No card charged.',
      licence: await resolveOrgLicence(admin, organizationId),
      usage: await measureOrgUsage(admin, organizationId),
    }
  }

  if (action === 'cancel') {
    const licence = await mockCancelLicence(admin, organizationId)
    return {
      mode: 'mock',
      paymentStatus: 'canceled',
      message: 'Subscription canceled (mock). Renew refresh window applies before full lock.',
      licence,
      usage: await measureOrgUsage(admin, organizationId),
    }
  }

  if (action === 'addons') {
    const result = await mockPurchaseAddons(admin, {
      organizationId,
      userId: user.id,
      addonSelections: Array.isArray(body?.addons) ? body.addons : [],
    })
    return {
      ...result,
      message: 'Add-ons purchased (mock). No card charged.',
    }
  }

  throw createError({ statusCode: 400, statusMessage: 'action must be renew, cancel, or addons' })
})
