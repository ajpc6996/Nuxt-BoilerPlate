export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const email = String(body?.email || '').trim().toLowerCase()

  if (!email) {
    throw createError({ statusCode: 400, statusMessage: 'email is required' })
  }

  // Reset is allowed for org admins / platform admins with MFA.
  // organizationId may be omitted for platform-wide resets; still require a JWT + aal2.
  const token = getBearerToken(event)
  if (!token) {
    throw createError({ statusCode: 401, statusMessage: 'Missing access token' })
  }

  const payload = decodeJwtPayload(token)
  if (payload?.aal !== 'aal2') {
    throw createError({
      statusCode: 403,
      statusMessage: 'MFA (aal2) required',
    })
  }

  const organizationId = body?.organizationId
  if (organizationId) {
    await requireOrgAdmin(event, organizationId)
  } else {
    await requirePlatformAdmin(event)
  }

  const admin = useSupabaseAdmin()
  const origin = getRequestURL(event).origin
  const { error } = await admin.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/reset-password`,
  })

  if (error) {
    throw createError({ statusCode: 400, statusMessage: error.message })
  }

  return { ok: true }
})
