import { createClient } from '@supabase/supabase-js'
import {
  getSupabasePublishableKey,
  getSupabaseUrl,
} from '~~/shared/supabaseKeys.js'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const email = String(body?.email || '').trim().toLowerCase()

  if (!email) {
    throw createError({ statusCode: 400, statusMessage: 'email is required' })
  }

  // Reset is allowed for org admins / platform admins with MFA.
  // organizationId may be omitted for platform-wide resets; still require a JWT + aal2.
  const authHeader = getHeader(event, 'authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) {
    throw createError({ statusCode: 401, statusMessage: 'Missing access token' })
  }

  const payload = (() => {
    try {
      return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'))
    } catch {
      return null
    }
  })()

  if (payload?.aal !== 'aal2') {
    throw createError({
      statusCode: 403,
      statusMessage: 'MFA (aal2) required',
    })
  }

  const organizationId = body?.organizationId
  if (organizationId) {
    await requireOrgAdmin(event, organizationId)
  } else {
    // Platform admin only when org is not specified
    const admin = useSupabaseAdmin()
    const config = useRuntimeConfig()
    const userClient = createClient(
      getSupabaseUrl(config),
      getSupabasePublishableKey(config),
      {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      },
    )
    const {
      data: { user },
    } = await userClient.auth.getUser()
    const { data: profile } = await admin
      .from('profiles')
      .select('is_platform_admin')
      .eq('id', user?.id)
      .maybeSingle()
    if (!profile?.is_platform_admin) {
      throw createError({
        statusCode: 403,
        statusMessage: 'Platform admin required for unscoped resets',
      })
    }
  }

  const admin = useSupabaseAdmin()
  const origin = getRequestURL(event).origin
  const { error } = await admin.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/reset-password`,
  })

  if (error) {
    throw createError({ statusCode: 400, statusMessage: error.message })
  }

  return { ok: true }
})
