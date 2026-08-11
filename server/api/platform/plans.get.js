/**
 * Platform: list active licence plans.
 */
export default defineEventHandler(async (event) => {
  await requirePlatformAdmin(event)
  const admin = useSupabaseAdmin()

  const { data, error } = await admin
    .from('licence_plans')
    .select('key, name, description, features, limits, trial_days, is_default, is_active, sort_order')
    .order('sort_order')

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  const { data: settings } = await admin
    .from('licence_platform_settings')
    .select('grace_days, data_retention_days, renew_refresh_hours')
    .eq('id', 1)
    .maybeSingle()

  return {
    items: data || [],
    settings: {
      graceDays: Number(settings?.grace_days ?? 3),
      dataRetentionDays: Number(settings?.data_retention_days ?? 15),
      renewRefreshHours: Number(settings?.renew_refresh_hours ?? 72),
    },
  }
})
