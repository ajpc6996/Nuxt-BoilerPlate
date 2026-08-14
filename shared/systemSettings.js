/**
 * Platform-wide staging / export buffer knobs.
 * Display-only on the client; Nitro + RPCs enforce the values.
 */

export const DEFAULT_SYSTEM_SETTINGS = Object.freeze({
  maxStageRowsPerBatch: 1000,
  maxStageBytesPerBatch: 2_000_000,
  maxConcurrentStageRowsPerOrg: 2000,
  stageStaleTtlMinutes: 30,
})

export const SYSTEM_SETTING_BOUNDS = Object.freeze({
  maxStageRowsPerBatch: { min: 50, max: 50_000 },
  maxStageBytesPerBatch: { min: 65_536, max: 16_777_216 },
  maxConcurrentStageRowsPerOrg: { min: 100, max: 500_000 },
  stageStaleTtlMinutes: { min: 5, max: 1_440 },
})

export const DEFAULT_INGEST_RETENTION_DAYS = 7

/**
 * @param {unknown} raw
 */
export function normalizeSystemSettings(raw) {
  const src = raw && typeof raw === 'object' ? raw : {}
  return {
    maxStageRowsPerBatch: clampInt(
      src.maxStageRowsPerBatch ?? src.max_stage_rows_per_batch,
      DEFAULT_SYSTEM_SETTINGS.maxStageRowsPerBatch,
      SYSTEM_SETTING_BOUNDS.maxStageRowsPerBatch,
    ),
    maxStageBytesPerBatch: clampInt(
      src.maxStageBytesPerBatch ?? src.max_stage_bytes_per_batch,
      DEFAULT_SYSTEM_SETTINGS.maxStageBytesPerBatch,
      SYSTEM_SETTING_BOUNDS.maxStageBytesPerBatch,
    ),
    maxConcurrentStageRowsPerOrg: clampInt(
      src.maxConcurrentStageRowsPerOrg ?? src.max_concurrent_stage_rows_per_org,
      DEFAULT_SYSTEM_SETTINGS.maxConcurrentStageRowsPerOrg,
      SYSTEM_SETTING_BOUNDS.maxConcurrentStageRowsPerOrg,
    ),
    stageStaleTtlMinutes: clampInt(
      src.stageStaleTtlMinutes ?? src.stage_stale_ttl_minutes,
      DEFAULT_SYSTEM_SETTINGS.stageStaleTtlMinutes,
      SYSTEM_SETTING_BOUNDS.stageStaleTtlMinutes,
    ),
  }
}

/**
 * @param {unknown} value
 * @param {number} fallback
 * @param {{ min: number, max: number }} bounds
 */
function clampInt(value, fallback, bounds) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(bounds.min, Math.min(bounds.max, Math.floor(n)))
}

/**
 * @param {unknown} value
 * @param {number} [fallback]
 */
export function normalizeRetentionDays(value, fallback = DEFAULT_INGEST_RETENTION_DAYS) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(1, Math.min(365, Math.floor(n)))
}
