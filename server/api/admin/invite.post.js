export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const email = String(body?.email || '').trim().toLowerCase()
  const organizationId = body?.organizationId

  if (!email || !organizationId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'email and organizationId are required',
    })
  }

  const { isPlatformAdmin } = await requireOrgAdmin(event, organizationId)
  const admin = useSupabaseAdmin()

  // Seat count is active-only; block invites once active seats are full.
  await assertLicenceAllows(admin, {
    organizationId,
    isPlatformAdmin,
    limitKey: 'maxUsers',
  })

  const origin = getRequestURL(event).origin

  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${origin}/auth/reset-password`,
  })

  if (error) {
    throw createError({ statusCode: 400, statusMessage: error.message })
  }

  const userId = data.user?.id
  if (userId) {
    await admin.from('organization_members').upsert(
      {
        organization_id: organizationId,
        user_id: userId,
        status: 'invited',
      },
      { onConflict: 'organization_id,user_id' },
    )
  }

  return { ok: true, userId }
})
