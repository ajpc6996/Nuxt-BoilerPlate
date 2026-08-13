import { createClient } from '@supabase/supabase-js'
import {
  getSupabasePublishableKey,
  getSupabaseUrl,
} from '~~/shared/supabaseKeys.js'

/**
 * Load memberships + roles for the signed-in user.
 * Prefer user JWT (RLS); fall back to service-role admin client.
 */
export default defineEventHandler(async (event) => {
  const { user, token } = await requireUser(event)
  const config = useRuntimeConfig()

  const userClient = createClient(
    getSupabaseUrl(config),
    getSupabasePublishableKey(config),
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  )

  // Try as the signed-in user first (works once SELECT RLS is fixed).
  try {
    return await loadContext(userClient, user.id)
  }
  catch (userErr) {
    console.warn(
      '[me/context] user-scoped load failed, trying service role:',
      userErr?.statusMessage || userErr?.message || userErr,
    )
  }

  try {
    const admin = useSupabaseAdmin()
    return await loadContext(admin, user.id)
  }
  catch (adminErr) {
    throw createError({
      statusCode: 500,
      statusMessage:
        adminErr?.statusMessage
        || adminErr?.message
        || 'Failed to load memberships. Apply migration 20260804170000_service_role_grants_and_rls.sql',
    })
  }
})

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {string} userId
 */
async function loadContext(client, userId) {
  const { data: profile, error: profileError } = await client
    .from('profiles')
    .select('id, email, is_platform_admin')
    .eq('id', userId)
    .maybeSingle()

  if (profileError) {
    throw createError({ statusCode: 500, statusMessage: profileError.message })
  }

  const { data: memberships, error: memberError } = await client
    .from('organization_members')
    .select('id, organization_id, status, organizations(id, name, slug, mfa_mode)')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: true })

  if (memberError) {
    throw createError({ statusCode: 500, statusMessage: memberError.message })
  }

  let items = memberships || []

  // Platform admins can act in every tenant. Always list all orgs, keeping
  // real memberships where they exist and synthesizing the rest.
  if (profile?.is_platform_admin) {
    const { data: orgs, error: orgError } = await client
      .from('organizations')
      .select('id, name, slug, mfa_mode')
      .order('name')

    if (orgError) {
      throw createError({ statusCode: 500, statusMessage: orgError.message })
    }

    const byId = new Map(
      items
        .filter((m) => m.organization_id)
        .map((m) => [m.organization_id, m]),
    )

    items = (orgs || []).map((org) => {
      const existing = byId.get(org.id)
      if (existing) {
        return {
          ...existing,
          organizations: existing.organizations || org,
        }
      }
      return {
        id: `platform-${org.id}`,
        organization_id: org.id,
        status: 'active',
        organizations: org,
      }
    })
  }

  const { data: roleRows, error: roleError } = await client
    .from('user_roles')
    .select('organization_id, roles(id, name, description, is_system)')
    .eq('user_id', userId)

  if (roleError) {
    throw createError({ statusCode: 500, statusMessage: roleError.message })
  }

  /** @type {Record<string, Array<{ id: string, name: string, description?: string, is_system?: boolean }>>} */
  const rolesByOrg = {}
  for (const row of roleRows || []) {
    const orgId = row.organization_id
    if (!orgId || !row.roles) continue
    if (!rolesByOrg[orgId]) rolesByOrg[orgId] = []
    rolesByOrg[orgId].push(row.roles)
  }

  return {
    isPlatformAdmin: Boolean(profile?.is_platform_admin),
    memberships: items,
    rolesByOrg,
    licencesByOrg: await loadLicencesByOrg(client, items),
  }
}

/**
 * Compact licence snapshots for UI (not used for enforcement).
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {Array<{ organization_id: string }>} memberships
 */
async function loadLicencesByOrg(client, memberships) {
  const orgIds = [...new Set((memberships || []).map((m) => m.organization_id).filter(Boolean))]
  if (!orgIds.length) return {}

  const { data, error } = await client
    .from('organization_licences')
    .select('organization_id, plan_key, status, features, limits, trial_ends_at, current_period_end, grace_ends_at, data_purge_at, data_purged_at, overrides')
    .in('organization_id', orgIds)

  if (error) {
    console.warn('[me/context] licences load failed', error.message)
    return {}
  }

  /** @type {Record<string, object>} */
  const map = {}
  for (const row of data || []) {
    const merged = {
      features: row.features,
      limits: row.limits,
    }
    // Apply overrides shallowly for display
    const overrides = row.overrides && typeof row.overrides === 'object' ? row.overrides : {}
    map[row.organization_id] = {
      planKey: row.plan_key,
      status: row.status,
      features: { ...(merged.features || {}), ...(overrides.features || {}) },
      limits: { ...(merged.limits || {}), ...(overrides.limits || {}) },
      trialEndsAt: row.trial_ends_at,
      currentPeriodEnd: row.current_period_end,
      graceEndsAt: row.grace_ends_at,
      dataPurgeAt: row.data_purge_at,
      dataPurgedAt: row.data_purged_at,
    }
  }
  return map
}
