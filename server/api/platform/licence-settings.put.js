/**
 * Platform: update grace / retention / renew refresh policy.
 * Body: { graceDays?, dataRetentionDays?, renewRefreshHours? }
 */
export default defineEventHandler(async (event) => {
  const { user } = await requirePlatformAdmin(event)
  const body = await readBody(event)
  const admin = useSupabaseAdmin()

  const patch = {
    updated_at: new Date().toISOString(),
    updated_by: user.id,
  }

  if (body?.graceDays != null) {
    const n = Math.max(0, Math.min(90, Number(body.graceDays)))
    if (!Number.isFinite(n)) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid graceDays' })
    }
    patch.grace_days = n
  }
  if (body?.dataRetentionDays != null) {
    const n = Math.max(0, Math.min(365, Number(body.dataRetentionDays)))
    if (!Number.isFinite(n)) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid dataRetentionDays' })
    }
    patch.data_retention_days = n
  }
  if (body?.renewRefreshHours != null) {
    const n = Math.max(0, Math.min(720, Number(body.renewRefreshHours)))
    if (!Number.isFinite(n)) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid renewRefreshHours' })
    }
    patch.renew_refresh_hours = n
  }

  const { data, error } = await admin
    .from('licence_platform_settings')
    .update(patch)
    .eq('id', 1)
    .select('*')
    .single()

  if (error || !data) {
    throw createError({
      statusCode: 500,
      statusMessage: error?.message || 'Failed to update settings',
    })
  }

  return {
    settings: {
      graceDays: data.grace_days,
      dataRetentionDays: data.data_retention_days,
      renewRefreshHours: data.renew_refresh_hours,
    },
  }
})
