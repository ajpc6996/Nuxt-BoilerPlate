import { normalizeSystemSettings } from '~~/shared/systemSettings.js'

export default defineEventHandler(async (event) => {
  await requirePlatformAdmin(event)
  const admin = useSupabaseAdmin()
  const { data, error } = await admin
    .from('platform_system_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { settings: normalizeSystemSettings(data || {}) }
})
