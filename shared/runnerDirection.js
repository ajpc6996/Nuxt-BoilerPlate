/**
 * Runner direction helpers (inbound retrieve vs outbound export).
 */

/**
 * @param {{ direction?: string, operation?: string }} ctx
 */
export function isOutbound(ctx) {
  const d = String(ctx?.direction || ctx?.operation || '').toLowerCase()
  return d === 'outbound' || d === 'export' || d === 'write'
}

/**
 * @param {{ mode?: string, config?: Record<string, unknown> }} ctx
 * @param {number} [testDefault]
 * @param {number} [runDefault]
 */
export function getMaxRows(ctx, testDefault = 25, runDefault = 5000) {
  const cap = ctx.mode === 'test' ? 50 : 100_000
  const fallback = ctx.mode === 'test' ? testDefault : runDefault
  return Math.min(Number(ctx.config?.maxRows) || fallback, cap)
}
