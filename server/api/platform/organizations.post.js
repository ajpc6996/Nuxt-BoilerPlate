/**
 * Platform admin: create organization and link creator as Admin member.
 */
export default defineEventHandler(async (event) => {
  const { user } = await requirePlatformAdmin(event)
  const body = await readBody(event)

  const name = String(body?.name || '').trim()
  const slug = String(body?.slug || '')
    .trim()
    .toLowerCase()
  const mfaMode = ['off', 'optional', 'required'].includes(body?.mfaMode)
    ? body.mfaMode
    : 'optional'

  if (!name || !slug) {
    throw createError({ statusCode: 400, statusMessage: 'name and slug are required' })
  }
  if (!/^[a-z0-9-]+$/.test(slug)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'slug must use lowercase letters, numbers, and hyphens only',
    })
  }

  const admin = useSupabaseAdmin()

  const { data: org, error: orgError } = await admin
    .from('organizations')
    .insert({
      name,
      slug,
      mfa_mode: mfaMode,
      created_by: user.id,
    })
    .select('id, name, slug, mfa_mode, created_at')
    .single()

  if (orgError || !org) {
    throw createError({
      statusCode: 400,
      statusMessage: orgError?.message || 'Failed to create organization',
    })
  }

  const { error: memberError } = await admin.from('organization_members').upsert(
    {
      organization_id: org.id,
      user_id: user.id,
      status: 'active',
    },
    { onConflict: 'organization_id,user_id' },
  )

  if (memberError) {
    throw createError({ statusCode: 500, statusMessage: memberError.message })
  }

  // Trigger creates system Admin role on org insert
  const { data: adminRole, error: roleError } = await admin
    .from('roles')
    .select('id')
    .eq('organization_id', org.id)
    .eq('name', 'Admin')
    .maybeSingle()

  if (roleError || !adminRole) {
    throw createError({
      statusCode: 500,
      statusMessage: roleError?.message || 'Admin role missing after org create',
    })
  }

  const { error: assignError } = await admin.from('user_roles').upsert(
    {
      organization_id: org.id,
      user_id: user.id,
      role_id: adminRole.id,
    },
    { onConflict: 'user_id,role_id' },
  )

  if (assignError) {
    throw createError({ statusCode: 500, statusMessage: assignError.message })
  }

  return { item: org }
})
