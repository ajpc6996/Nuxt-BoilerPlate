export const CONNECTION_DIRECTIONS = ['inbound', 'outbound']

/**
 * @param {unknown} value
 * @returns {'inbound'|'outbound'}
 */
export function normalizeConnectionDirection(value) {
  return String(value || '').trim().toLowerCase() === 'outbound'
    ? 'outbound'
    : 'inbound'
}
