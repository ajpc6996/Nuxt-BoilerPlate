import {
  normalizeSystemSettings,
  SYSTEM_SETTING_BOUNDS,
} from '~~/shared/systemSettings.js'

export default defineEventHandler(async (event) => {
  const { user } = await requirePlatformAdmin(event)
  const body = await readBody(event)
  const admin = useSupabaseAdmin()

  const next = normalizeSystemSettings(body || {})
  const bounds = SYSTEM_SETTING_BOUNDS

  const { data, error } = await admin
    .from('platform_system_settings')
    .upsert({
      id: 1,
      max_stage_rows_per_batch: next.maxStageRowsPerBatch,
      max_stage_bytes_per_batch: next.maxStageBytesPerBatch,
      max_concurrent_stage_rows_per_org: next.maxConcurrentStageRowsPerOrg,
      stage_stale_ttl_minutes: next.stageStaleTtlMinutes,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    })
    .select('*')
    .single()

  if (error || !data) {
    throw createError({
      statusCode: 500,
      statusMessage: error?.message || 'Failed to update system settings',
    })
  }

  return {
    settings: normalizeSystemSettings(data),
    bounds,
  }
})
