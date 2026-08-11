/**
 * Licence entitlements helpers (shared).
 * Numeric limits: -1 means unlimited. Clients must treat this as display-only;
 * enforcement always happens on the server.
 */

export const LICENCE_STATUSES = Object.freeze([
  'trialing',
  'active',
  'past_due',
  'locked',
  'canceled',
])

/** Statuses that still allow create/run under hard limits. */
export const LICENCE_OPERATIONAL_STATUSES = Object.freeze([
  'trialing',
  'active',
  'past_due',
])

export const DEFAULT_FEATURES = Object.freeze({
  dataSources: true,
  dashboards: true,
  reports: true,
  export: true,
  mfaRequired: false,
  connectorTypes: false,
})

export const DEFAULT_LIMITS = Object.freeze({
  maxUsers: 3,
  maxConnections: 2,
  maxDataSources: 2,
  maxDashboards: 3,
  maxReports: 3,
  maxIngestRowsPerMonth: 50000,
})

/**
 * @param {unknown} raw
 */
export function normalizeLicenceFeatures(raw) {
  const src = raw && typeof raw === 'object' ? raw : {}
  return {
    dataSources: src.dataSources !== false,
    dashboards: src.dashboards !== false,
    reports: src.reports !== false,
    export: src.export !== false,
    mfaRequired: Boolean(src.mfaRequired),
    connectorTypes: Boolean(src.connectorTypes),
  }
}

/**
 * @param {unknown} raw
 */
export function normalizeLicenceLimits(raw) {
  const src = raw && typeof raw === 'object' ? raw : {}
  const pick = (key, fallback) => {
    const n = Number(src[key])
    if (!Number.isFinite(n)) return fallback
    if (n === -1) return -1
    return Math.max(0, Math.floor(n))
  }
  return {
    maxUsers: pick('maxUsers', DEFAULT_LIMITS.maxUsers),
    maxConnections: pick('maxConnections', DEFAULT_LIMITS.maxConnections),
    maxDataSources: pick('maxDataSources', DEFAULT_LIMITS.maxDataSources),
    maxDashboards: pick('maxDashboards', DEFAULT_LIMITS.maxDashboards),
    maxReports: pick('maxReports', DEFAULT_LIMITS.maxReports),
    maxIngestRowsPerMonth: pick('maxIngestRowsPerMonth', DEFAULT_LIMITS.maxIngestRowsPerMonth),
  }
}

/**
 * Merge plan snapshot with org overrides (overrides win).
 * @param {{ features?: object, limits?: object }} base
 * @param {{ features?: object, limits?: object }} overrides
 */
export function mergeLicenceOverrides(base, overrides) {
  const o = overrides && typeof overrides === 'object' ? overrides : {}
  return {
    features: normalizeLicenceFeatures({ ...(base?.features || {}), ...(o.features || {}) }),
    limits: normalizeLicenceLimits({ ...(base?.limits || {}), ...(o.limits || {}) }),
  }
}

/**
 * @param {number} limit
 * @param {number} used
 * @param {number} [delta=1]
 */
export function isWithinLimit(limit, used, delta = 1) {
  if (limit === -1) return true
  return Number(used) + Number(delta) <= Number(limit)
}

/**
 * UTC month start as ISO date (YYYY-MM-DD).
 * @param {Date} [now]
 */
export function billingPeriodStart(now = new Date()) {
  const y = now.getUTCFullYear()
  const m = String(now.getUTCMonth() + 1).padStart(2, '0')
  return `${y}-${m}-01`
}
