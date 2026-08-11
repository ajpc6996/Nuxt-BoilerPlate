export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const email = String(body?.email || '').trim().toLowerCase()
  const fullName = String(body?.fullName || '').trim()
  const organizationId = body?.organizationId

  if (!email || !organizationId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'email and organizationId are required',
    })
  }

  const { isPlatformAdmin } = await requireOrgAdmin(event, organizationId)
  const admin = useSupabaseAdmin()

  await assertLicenceAllows(admin, {
    organizationId,
    isPlatformAdmin,
    limitKey: 'maxUsers',
  })

  const origin = getRequestURL(event).origin

  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: fullName || undefined },
  })

  if (error) {
    throw createError({ statusCode: 400, statusMessage: error.message })
  }

  const userId = data.user?.id
  if (!userId) {
    throw createError({ statusCode: 500, statusMessage: 'User was not created' })
  }

  await admin.from('profiles').upsert({
    id: userId,
    email,
    full_name: fullName || email.split('@')[0],
  })

  await admin.from('organization_members').upsert(
    {
      organization_id: organizationId,
      user_id: userId,
      status: 'active',
    },
    { onConflict: 'organization_id,user_id' },
  )

  const { error: linkError } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: {
      redirectTo: `${origin}/auth/reset-password`,
    },
  })

  // Prefer sending via resetPasswordForEmail on behalf of recovery flow
  if (linkError) {
    await admin.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/auth/reset-password`,
    })
  }
  else {
    await admin.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/auth/reset-password`,
    })
  }

  return { ok: true, userId }
})
