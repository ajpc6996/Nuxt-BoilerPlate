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
    return await loadContext(userClient, user.id, false)
  }
  catch (userErr) {
    console.warn(
      '[me/context] user-scoped load failed, trying service role:',
      userErr?.statusMessage || userErr?.message || userErr,
    )
  }

  try {
    const admin = useSupabaseAdmin()
    return await loadContext(admin, user.id, true)
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
 * @param {boolean} asAdmin
 */
async function loadContext(client, userId, asAdmin) {
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

  if (!items.length && (profile?.is_platform_admin || asAdmin)) {
    const { data: orgs, error: orgError } = await client
      .from('organizations')
      .select('id, name, slug, mfa_mode')
      .order('name')

    if (orgError) {
      throw createError({ statusCode: 500, statusMessage: orgError.message })
    }

    if (profile?.is_platform_admin) {
      items = (orgs || []).map((org) => ({
        id: `platform-${org.id}`,
        organization_id: org.id,
        status: 'active',
        organizations: org,
      }))
    }
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
  }
}
