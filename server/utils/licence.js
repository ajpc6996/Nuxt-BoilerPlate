import { createHmac, timingSafeEqual } from 'node:crypto'
import {
  LICENCE_OPERATIONAL_STATUSES,
  billingPeriodStart,
  isWithinLimit,
  mergeLicenceOverrides,
  normalizeLicenceFeatures,
  normalizeLicenceLimits,
} from '~~/shared/licence.js'
import { getIngestBackend } from '~~/server/utils/ingestBackend.js'

/**
 * @returns {string}
 */
function licenceSigningSecret() {
  const config = useRuntimeConfig()
  const secret = String(config.licenceSigningSecret || config.supabaseSecretKey || '').trim()
  if (!secret) {
    throw createError({
      statusCode: 500,
      statusMessage: 'LICENCE_SIGNING_SECRET (or SUPABASE_SECRET_KEY) is required',
    })
  }
  return secret
}

/**
 * Sign a licence payload. Clients may display this; they must never be trusted
 * for enforcement — server always re-resolves from the database.
 * @param {Record<string, unknown>} payload
 */
export function signLicenceToken(payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  const sig = createHmac('sha256', licenceSigningSecret()).update(body).digest('base64url')
  return `${body}.${sig}`
}

/**
 * @param {string} token
 * @returns {Record<string, unknown>|null}
 */
export function verifyLicenceToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  try {
    const expected = createHmac('sha256', licenceSigningSecret()).update(body).digest('base64url')
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  }
  catch {
    return null
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 */
export async function getLicencePlatformSettings(admin) {
  const { data, error } = await admin
    .from('licence_platform_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return {
    graceDays: Number(data?.grace_days ?? 3),
    dataRetentionDays: Number(data?.data_retention_days ?? 15),
    renewRefreshHours: Number(data?.renew_refresh_hours ?? 72),
  }
}

/**
 * Apply time-based status transitions (trial/period end → past_due → locked).
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {Record<string, unknown>} row
 */
export async function refreshLicenceStatus(admin, row) {
  if (!row?.id) return row

  const settings = await getLicencePlatformSettings(admin)
  const now = Date.now()
  let status = String(row.status || 'locked')
  const patch = {}

  const periodEnd = row.current_period_end || row.trial_ends_at
  const periodEndMs = periodEnd ? new Date(periodEnd).getTime() : null

  if (
    (status === 'trialing' || status === 'active')
    && periodEndMs
    && periodEndMs < now
  ) {
    status = 'past_due'
    patch.status = 'past_due'
    const graceEnds = new Date(now + settings.graceDays * 24 * 60 * 60 * 1000)
    patch.grace_ends_at = graceEnds.toISOString()
  }

  const graceEndsMs = (patch.grace_ends_at || row.grace_ends_at)
    ? new Date(patch.grace_ends_at || row.grace_ends_at).getTime()
    : null

  if (status === 'past_due' && graceEndsMs && graceEndsMs < now) {
    status = 'locked'
    patch.status = 'locked'
    const purgeAt = new Date(now + settings.dataRetentionDays * 24 * 60 * 60 * 1000)
    patch.data_purge_at = purgeAt.toISOString()
  }

  if (status === 'canceled') {
    // Canceled still gets renew_refresh window then lock
    const canceledAt = row.updated_at ? new Date(row.updated_at).getTime() : now
    const refreshEnds = canceledAt + settings.renewRefreshHours * 60 * 60 * 1000
    if (refreshEnds < now && status !== 'locked') {
      status = 'locked'
      patch.status = 'locked'
      if (!row.data_purge_at) {
        patch.data_purge_at = new Date(
          now + settings.dataRetentionDays * 24 * 60 * 60 * 1000,
        ).toISOString()
      }
    }
  }

  if (Object.keys(patch).length) {
    patch.last_validated_at = new Date().toISOString()
    const { data, error } = await admin
      .from('organization_licences')
      .update(patch)
      .eq('id', row.id)
      .select('*')
      .single()
    if (error) {
      console.warn('[licence] status refresh failed', error.message)
      return { ...row, ...patch, status }
    }
    return data
  }

  return row
}

/**
 * Resolve effective entitlements for an org (server-side source of truth).
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {string} organizationId
 */
export async function resolveOrgLicence(admin, organizationId) {
  if (!organizationId) {
    throw createError({ statusCode: 400, statusMessage: 'organizationId is required' })
  }

  const { data: row, error } = await admin
    .from('organization_licences')
    .select('*, licence_plans(key, name, description)')
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  if (!row) {
    throw createError({
      statusCode: 403,
      statusMessage: 'No licence assigned for this organization',
    })
  }

  const refreshed = await refreshLicenceStatus(admin, row)
  const merged = mergeLicenceOverrides(
    { features: refreshed.features, limits: refreshed.limits },
    refreshed.overrides || {},
  )

  // Keep org MFA policy aligned with licence feature flag.
  await syncOrgMfaFromLicence(admin, organizationId, merged.features)

  // Auto-purge retained data when retention window has elapsed.
  const purgeResult = await maybePurgeOrgData(admin, {
    organizationId,
    status: refreshed.status,
    dataPurgeAt: refreshed.data_purge_at,
    dataPurgedAt: refreshed.data_purged_at,
  })

  const settings = await getLicencePlatformSettings(admin)
  const operational = LICENCE_OPERATIONAL_STATUSES.includes(
    purgeResult?.status || refreshed.status,
  )

  const finalRow = purgeResult?.row || refreshed

  const tokenPayload = {
    v: finalRow.licence_version || 1,
    orgId: organizationId,
    planKey: finalRow.plan_key,
    status: finalRow.status,
    features: merged.features,
    limits: merged.limits,
    periodEnd: finalRow.current_period_end || finalRow.trial_ends_at || null,
    graceEndsAt: finalRow.grace_ends_at || null,
    issuedAt: new Date().toISOString(),
  }

  return {
    organizationId,
    planKey: finalRow.plan_key,
    planName: finalRow.licence_plans?.name || refreshed.licence_plans?.name || finalRow.plan_key,
    status: finalRow.status,
    operational,
    features: merged.features,
    limits: merged.limits,
    trialEndsAt: finalRow.trial_ends_at,
    currentPeriodStart: finalRow.current_period_start,
    currentPeriodEnd: finalRow.current_period_end,
    graceEndsAt: finalRow.grace_ends_at,
    dataPurgeAt: finalRow.data_purge_at,
    dataPurgedAt: finalRow.data_purged_at || null,
    settings,
    licenceToken: signLicenceToken(tokenPayload),
    raw: finalRow,
  }
}

/**
 * Live usage counts for an organization.
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {string} organizationId
 */
export async function measureOrgUsage(admin, organizationId) {
  const periodStart = billingPeriodStart()

  const [
    usersRes,
    connectionsRes,
    sourcesRes,
    dashboardsRes,
    reportsRes,
    ingestRes,
  ] = await Promise.all([
    admin
      .from('organization_members')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('status', 'active'),
    admin
      .from('connections')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId),
    admin
      .from('data_sources')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId),
    admin
      .from('dashboards')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId),
    admin
      .from('reports')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId),
    admin
      .from('connection_runs')
      .select('rows_written')
      .eq('organization_id', organizationId)
      .eq('status', 'success')
      .eq('mode', 'run')
      .gte('started_at', `${periodStart}T00:00:00.000Z`),
  ])

  const ingestRows = (ingestRes.data || []).reduce(
    (sum, row) => sum + Number(row.rows_written || 0),
    0,
  )

  const usage = {
    periodStart,
    usersActive: usersRes.count || 0,
    connections: connectionsRes.count || 0,
    dataSources: sourcesRes.count || 0,
    dashboards: dashboardsRes.count || 0,
    reports: reportsRes.count || 0,
    ingestRowsPeriod: ingestRows,
  }

  await admin.from('organization_usage').upsert({
    organization_id: organizationId,
    period_start: periodStart,
    users_active: usage.usersActive,
    connections: usage.connections,
    data_sources: usage.dataSources,
    dashboards: usage.dashboards,
    reports: usage.reports,
    ingest_rows_period: usage.ingestRowsPeriod,
    updated_at: new Date().toISOString(),
  })

  return usage
}

/**
 * @param {string} message
 * @param {Record<string, unknown>} [extra]
 */
function licenceDenied(message, extra = {}) {
  throw createError({
    statusCode: 403,
    statusMessage: message,
    data: { code: 'LICENCE_DENIED', ...extra },
  })
}

/**
 * Enforce feature + hard limits. Platform admins are never restricted.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {{
 *   organizationId: string,
 *   isPlatformAdmin?: boolean,
 *   feature?: keyof ReturnType<typeof normalizeLicenceFeatures>,
 *   limitKey?: keyof ReturnType<typeof normalizeLicenceLimits>,
 *   used?: number,
 *   delta?: number,
 *   skipOperationalCheck?: boolean,
 * }} opts
 */
export async function assertLicenceAllows(admin, opts) {
  if (opts.isPlatformAdmin) {
    return {
      bypass: true,
      licence: null,
      usage: null,
    }
  }

  const licence = await resolveOrgLicence(admin, opts.organizationId)

  if (!opts.skipOperationalCheck && !licence.operational) {
    licenceDenied(
      'Organization licence is locked. Renew or upgrade to restore access.',
      {
        status: licence.status,
        graceEndsAt: licence.graceEndsAt,
        dataPurgeAt: licence.dataPurgeAt,
        upgradeHint: true,
      },
    )
  }

  if (opts.feature && licence.features[opts.feature] !== true) {
    licenceDenied(`Feature “${opts.feature}” is not included in your licence.`, {
      feature: opts.feature,
      upgradeHint: true,
    })
  }

  if (opts.limitKey) {
    const usage = opts.used != null
      ? null
      : await measureOrgUsage(admin, opts.organizationId)

    const usedMap = {
      maxUsers: usage?.usersActive,
      maxConnections: usage?.connections,
      maxDataSources: usage?.dataSources,
      maxDashboards: usage?.dashboards,
      maxReports: usage?.reports,
      maxIngestRowsPerMonth: usage?.ingestRowsPeriod,
    }

    const used = opts.used != null ? Number(opts.used) : Number(usedMap[opts.limitKey] || 0)
    const limit = licence.limits[opts.limitKey]
    const delta = opts.delta != null ? Number(opts.delta) : 1

    if (!isWithinLimit(limit, used, delta)) {
      licenceDenied(
        `Licence limit reached for ${opts.limitKey} (${used}/${limit === -1 ? '∞' : limit}).`,
        {
          limitKey: opts.limitKey,
          used,
          limit,
          upgradeHint: true,
        },
      )
    }

    return { bypass: false, licence, usage: usage || { [opts.limitKey]: used } }
  }

  return { bypass: false, licence, usage: null }
}

/**
 * Assign or update an org licence (platform admin API).
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {{
 *   organizationId: string,
 *   planKey: string,
 *   status?: string,
 *   overrides?: { features?: object, limits?: object },
 *   periodDays?: number,
 *   notes?: string,
 *   assignedBy?: string,
 * }} opts
 */
export async function assignOrgLicence(admin, opts) {
  const { data: plan, error: planError } = await admin
    .from('licence_plans')
    .select('*')
    .eq('key', opts.planKey)
    .eq('is_active', true)
    .maybeSingle()

  if (planError || !plan) {
    throw createError({ statusCode: 400, statusMessage: 'Unknown or inactive plan' })
  }

  const settings = await getLicencePlatformSettings(admin)
  const now = new Date()
  const periodDays = Math.max(
    1,
    Number(opts.periodDays) || (plan.trial_days > 0 ? plan.trial_days : 30),
  )
  const periodEnd = new Date(now.getTime() + periodDays * 24 * 60 * 60 * 1000)
  const status = opts.status
    || (plan.trial_days > 0 && opts.planKey === 'trial' ? 'trialing' : 'active')

  const features = normalizeLicenceFeatures(plan.features)
  const limits = normalizeLicenceLimits(plan.limits)
  const overrides = opts.overrides && typeof opts.overrides === 'object'
    ? opts.overrides
    : {}

  const { data: existing } = await admin
    .from('organization_licences')
    .select('id, licence_version')
    .eq('organization_id', opts.organizationId)
    .maybeSingle()

  const payload = {
    organization_id: opts.organizationId,
    plan_key: plan.key,
    status,
    features,
    limits,
    overrides,
    trial_ends_at: status === 'trialing' ? periodEnd.toISOString() : null,
    current_period_start: now.toISOString(),
    current_period_end: periodEnd.toISOString(),
    grace_ends_at: null,
    data_purge_at: null,
    data_purged_at: null,
    licence_version: (existing?.licence_version || 0) + 1,
    notes: String(opts.notes || ''),
    assigned_by: opts.assignedBy || null,
    last_validated_at: now.toISOString(),
  }

  const { data, error } = await admin
    .from('organization_licences')
    .upsert(payload, { onConflict: 'organization_id' })
    .select('*, licence_plans(key, name)')
    .single()

  if (error || !data) {
    throw createError({
      statusCode: 500,
      statusMessage: error?.message || 'Failed to assign licence',
    })
  }

  await syncOrgMfaFromLicence(admin, opts.organizationId, features)

  return {
    item: data,
    settings,
  }
}

/**
 * When licence requires MFA, force org mfa_mode to `required`.
 * Does not lower MFA when the flag is off (org may keep required voluntarily).
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {string} organizationId
 * @param {ReturnType<typeof normalizeLicenceFeatures>} features
 */
export async function syncOrgMfaFromLicence(admin, organizationId, features) {
  if (!features?.mfaRequired || !organizationId) return null

  const { data: org, error } = await admin
    .from('organizations')
    .select('id, mfa_mode')
    .eq('id', organizationId)
    .maybeSingle()

  if (error || !org) return null
  if (org.mfa_mode === 'required') return org

  const { data: updated, error: updateError } = await admin
    .from('organizations')
    .update({ mfa_mode: 'required' })
    .eq('id', organizationId)
    .select('id, mfa_mode')
    .single()

  if (updateError) {
    console.warn('[licence] MFA sync failed', updateError.message)
    return org
  }
  return updated
}

/**
 * Validate a requested org MFA mode against the org licence.
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {string} organizationId
 * @param {string} nextMode
 */
export async function assertOrgMfaModeAllowed(admin, organizationId, nextMode) {
  const mode = String(nextMode || '')
  if (!['off', 'optional', 'required'].includes(mode)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid mfa_mode' })
  }

  const { data: row } = await admin
    .from('organization_licences')
    .select('plan_key, features, overrides')
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (!row) {
    return { mode, licenceForced: false }
  }

  const merged = mergeLicenceOverrides(
    { features: row.features, limits: {} },
    row.overrides || {},
  )

  if (merged.features?.mfaRequired && mode !== 'required') {
    throw createError({
      statusCode: 403,
      statusMessage: 'Licence requires MFA. Organization MFA mode must stay “required”. Change plan to relax this.',
      data: { code: 'LICENCE_MFA_REQUIRED', planKey: row.plan_key },
    })
  }

  return { mode, licenceForced: Boolean(merged.features?.mfaRequired) }
}

/**
 * Purge retained tenant data after data_purge_at (ingest + run history).
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {{
 *   organizationId: string,
 *   status?: string,
 *   dataPurgeAt?: string|null,
 *   dataPurgedAt?: string|null,
 *   force?: boolean,
 * }} opts
 */
export async function maybePurgeOrgData(admin, opts) {
  const organizationId = opts.organizationId
  if (!organizationId) return null
  if (opts.dataPurgedAt && !opts.force) return null

  const status = String(opts.status || '')
  const purgeAtMs = opts.dataPurgeAt ? new Date(opts.dataPurgeAt).getTime() : null
  const due = opts.force || (status === 'locked' && purgeAtMs && purgeAtMs <= Date.now())
  if (!due) return null

  return purgeOrgRetainedData(admin, organizationId)
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {string} organizationId
 */
export async function purgeOrgRetainedData(admin, organizationId) {
  const counts = {
    ingestRows: 0,
    auditRows: 0,
    runs: 0,
  }

  const ingestBackend = await getIngestBackend(admin, organizationId)
  const ingestDeleted = await ingestBackend.licencePurgeIngestRows(organizationId)
  counts.ingestRows = Number(ingestDeleted) || 0

  const { count: auditCount, error: auditError } = await admin
    .from('connection_ingest_rows')
    .delete({ count: 'exact' })
    .eq('organization_id', organizationId)
  if (auditError) {
    console.warn('[licence] audit row purge failed', auditError.message)
  }
  else {
    counts.auditRows = auditCount || 0
  }

  const { count: runCount, error: runError } = await admin
    .from('connection_runs')
    .delete({ count: 'exact' })
    .eq('organization_id', organizationId)
  if (runError) {
    console.warn('[licence] run purge failed', runError.message)
  }
  else {
    counts.runs = runCount || 0
  }

  // Clear sync_state row counts on data sources (definitions kept)
  await admin
    .from('data_sources')
    .update({
      sync_state: {},
      last_error: 'Data purged after licence retention window',
    })
    .eq('organization_id', organizationId)

  const purgedAt = new Date().toISOString()
  const { data: row, error } = await admin
    .from('organization_licences')
    .update({
      data_purged_at: purgedAt,
      last_validated_at: purgedAt,
      notes: 'Retained data purged after licence retention window',
    })
    .eq('organization_id', organizationId)
    .select('*, licence_plans(key, name, description)')
    .single()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return {
    organizationId,
    status: row.status,
    row,
    counts,
    dataPurgedAt: purgedAt,
  }
}

/**
 * Process all locked orgs whose retention window has elapsed.
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 */
export async function processDueLicencePurges(admin) {
  const nowIso = new Date().toISOString()
  const { data: due, error } = await admin
    .from('organization_licences')
    .select('organization_id, status, data_purge_at, data_purged_at')
    .eq('status', 'locked')
    .is('data_purged_at', null)
    .lte('data_purge_at', nowIso)

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  const results = []
  for (const item of due || []) {
    try {
      const purged = await purgeOrgRetainedData(admin, item.organization_id)
      results.push({ organizationId: item.organization_id, ok: true, counts: purged.counts })
    }
    catch (err) {
      results.push({
        organizationId: item.organization_id,
        ok: false,
        error: err?.statusMessage || err?.message || 'Purge failed',
      })
    }
  }

  return {
    processed: results.length,
    results,
  }
}

export { normalizeLicenceFeatures, normalizeLicenceLimits }
