/**
 * Canonical migration system ids (shared by catalog + packs; no pack data here).
 */

/** @type {Record<string, string>} */
export const MIGRATION_SYSTEM_ID_ALIASES = {
  request_tracker: 'rt',
  requesttracker: 'rt',
  'request-tracker': 'rt',
  rtir: 'rt',
  best_practical: 'rt',
  bestpractical: 'rt',
}

/** Known catalog ids used for normalize (keep in sync with MIGRATION_SYSTEM_CATALOG). */
const KNOWN_SYSTEM_IDS = new Set([
  'rt',
  'zammad',
  'salesforce',
  'servicenow',
  'jira',
  'mysql',
  'postgresql',
  'mssql',
  'mongodb',
  'elasticsearch',
  'oracle',
  's3',
  'sftp',
  'csv_export',
  'rest_api',
  'custom',
])

/**
 * Normalize plan source/destination system ids so packs and enrichers match.
 * @param {string} systemId
 */
export function normalizeMigrationSystemId(systemId) {
  const raw = String(systemId || '').trim().toLowerCase()
  if (!raw || raw === 'custom') return raw
  if (MIGRATION_SYSTEM_ID_ALIASES[raw]) return MIGRATION_SYSTEM_ID_ALIASES[raw]
  if (KNOWN_SYSTEM_IDS.has(raw)) return raw
  if (/\brt\b|request.?tracker|rtir|best.?practical/.test(raw)) return 'rt'
  if (/zammad/.test(raw)) return 'zammad'
  return raw
}
