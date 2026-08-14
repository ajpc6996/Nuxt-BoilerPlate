import { normalizeSystemSettings, DEFAULT_SYSTEM_SETTINGS } from '~~/shared/systemSettings.js'

/**
 * @param {ReturnType<import('@supabase/supabase-js').createClient>} admin
 */
export async function loadSystemSettings(admin) {
  const { data, error } = await admin
    .from('platform_system_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle()

  if (error) {
    console.warn('[system-settings] load failed', error.message)
    return { ...DEFAULT_SYSTEM_SETTINGS }
  }

  return normalizeSystemSettings(data || {})
}

/**
 * Split rows so each chunk stays under row and JSON-byte caps.
 * @param {Record<string, unknown>[]} rows
 * @param {{ maxRows: number, maxBytes: number }} caps
 * @returns {Record<string, unknown>[][]}
 */
export function chunkRowsForStage(rows, caps) {
  const list = Array.isArray(rows) ? rows : []
  const maxRows = Math.max(1, Number(caps.maxRows) || 1000)
  const maxBytes = Math.max(1024, Number(caps.maxBytes) || 2_000_000)
  /** @type {Record<string, unknown>[][]} */
  const chunks = []
  /** @type {Record<string, unknown>[]} */
  let current = []
  let currentBytes = 2

  for (const row of list) {
    const encoded = Buffer.byteLength(JSON.stringify(row ?? {}), 'utf8') + 1
    const wouldRows = current.length + 1
    const wouldBytes = currentBytes + encoded
    if (current.length && (wouldRows > maxRows || wouldBytes > maxBytes)) {
      chunks.push(current)
      current = []
      currentBytes = 2
    }
    current.push(row)
    currentBytes += encoded
  }
  if (current.length) chunks.push(current)
  return chunks
}
