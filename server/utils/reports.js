import {
  normalizeReportDisplayConfig,
  normalizeReportQueryConfig,
} from '~~/shared/report.js'

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {string} organizationId
 * @param {string} userId
 * @param {{ isPlatformAdmin?: boolean, isOrgAdmin?: boolean }} flags
 */
export async function listVisibleReports(admin, organizationId, userId, flags = {}) {
  const { data, error } = await admin
    .from('reports')
    .select('id, name, description, visibility, owner_user_id, created_at, updated_at, created_by')
    .eq('organization_id', organizationId)
    .order('name')

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  if (flags.isPlatformAdmin || flags.isOrgAdmin) {
    return data || []
  }

  return (data || []).filter((r) => {
    if (r.visibility === 'public') return true
    if (r.visibility === 'private') return r.owner_user_id === userId
    return false
  })
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {string} reportId
 * @param {string} organizationId
 * @param {string} userId
 * @param {{ isPlatformAdmin?: boolean, isOrgAdmin?: boolean }} flags
 */
export async function assertCanViewReport(admin, reportId, organizationId, userId, flags = {}) {
  const { data: report, error } = await admin
    .from('reports')
    .select('*')
    .eq('id', reportId)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }
  if (!report) {
    throw createError({ statusCode: 404, statusMessage: 'Report not found' })
  }

  if (flags.isPlatformAdmin || flags.isOrgAdmin) {
    return report
  }
  if (report.visibility === 'public') return report
  if (report.visibility === 'private' && report.owner_user_id === userId) return report

  throw createError({ statusCode: 403, statusMessage: 'You cannot view this report' })
}

/**
 * @param {unknown} body
 */
export function parseReportBody(body) {
  const name = String(body?.name || '').trim()
  const description = body?.description != null ? String(body.description) : null
  const visibility = body?.visibility === 'public' ? 'public' : 'private'
  const query_config = normalizeReportQueryConfig(body?.query_config ?? body?.queryConfig)
  const display_config = normalizeReportDisplayConfig(body?.display_config ?? body?.displayConfig)
  return {
    name,
    description,
    visibility,
    query_config,
    display_config,
  }
}
