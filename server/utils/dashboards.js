import { normalizeDataConfig } from '~~/shared/dashboard.js'

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {string} organizationId
 * @param {string} userId
 * @param {{ isPlatformAdmin?: boolean, isOrgAdmin?: boolean }} flags
 */
export async function listVisibleDashboards(admin, organizationId, userId, flags = {}) {
  const { data, error } = await admin
    .from('dashboards')
    .select('id, name, description, visibility, owner_user_id, layout, created_at, updated_at, created_by')
    .eq('organization_id', organizationId)
    .order('name')

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  if (flags.isPlatformAdmin || flags.isOrgAdmin) {
    return data || []
  }

  const { data: roleRows } = await admin
    .from('user_roles')
    .select('role_id')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)

  const roleIds = new Set((roleRows || []).map((r) => r.role_id))

  const dashboards = data || []
  const roleDashIds = dashboards
    .filter((d) => d.visibility === 'role')
    .map((d) => d.id)

  /** @type {Set<string>} */
  const allowedRoleDash = new Set()
  if (roleDashIds.length) {
    const { data: links } = await admin
      .from('dashboard_roles')
      .select('dashboard_id, role_id')
      .in('dashboard_id', roleDashIds)
    ;(links || []).forEach((link) => {
      if (roleIds.has(link.role_id)) allowedRoleDash.add(link.dashboard_id)
    })
  }

  return dashboards.filter((d) => {
    if (d.visibility === 'public') return true
    if (d.visibility === 'private') return d.owner_user_id === userId
    if (d.visibility === 'role') return allowedRoleDash.has(d.id)
    return false
  })
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {string} dashboardId
 * @param {string} organizationId
 * @param {string} userId
 * @param {{ isPlatformAdmin?: boolean, isOrgAdmin?: boolean }} flags
 */
export async function assertCanViewDashboard(admin, dashboardId, organizationId, userId, flags = {}) {
  const { data: dash, error } = await admin
    .from('dashboards')
    .select('*, dashboard_roles(role_id), dashboard_widgets(*)')
    .eq('id', dashboardId)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }
  if (!dash) {
    throw createError({ statusCode: 404, statusMessage: 'Dashboard not found' })
  }

  if (flags.isPlatformAdmin || flags.isOrgAdmin) {
    return dash
  }

  if (dash.visibility === 'public') return dash
  if (dash.visibility === 'private' && dash.owner_user_id === userId) return dash

  if (dash.visibility === 'role') {
    const roleIds = (dash.dashboard_roles || []).map((r) => r.role_id)
    if (roleIds.length) {
      const { data: hits } = await admin
        .from('user_roles')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('user_id', userId)
        .in('role_id', roleIds)
        .limit(1)
      if (hits?.length) return dash
    }
  }

  throw createError({ statusCode: 403, statusMessage: 'You cannot view this dashboard' })
}

/**
 * @param {unknown} body
 */
export function parseDashboardBody(body) {
  const name = String(body?.name || '').trim()
  const description = body?.description != null ? String(body.description) : null
  const visibility = ['private', 'role', 'public'].includes(body?.visibility)
    ? body.visibility
    : 'private'
  const layout = body?.layout && typeof body.layout === 'object'
    ? body.layout
    : { version: 1, cols: 12 }
  const roleIds = Array.isArray(body?.roleIds)
    ? body.roleIds.map((id) => String(id)).filter(Boolean)
    : []
  return { name, description, visibility, layout, roleIds }
}

/**
 * @param {unknown} body
 */
export function parseWidgetBody(body) {
  const widgetType = String(body?.widgetType || body?.widget_type || 'bar')
  const title = String(body?.title || 'Widget').trim() || 'Widget'
  const subtitle = body?.subtitle != null ? String(body.subtitle) : null
  const grid_x = Number(body?.grid_x ?? body?.gridX ?? 0) || 0
  const grid_y = Number(body?.grid_y ?? body?.gridY ?? 0) || 0
  const grid_w = Math.max(1, Number(body?.grid_w ?? body?.gridW ?? 6) || 6)
  const grid_h = Math.max(1, Number(body?.grid_h ?? body?.gridH ?? 4) || 4)
  const sort_order = Number(body?.sort_order ?? body?.sortOrder ?? 0) || 0
  const data_config = normalizeDataConfig(body?.data_config ?? body?.dataConfig)
  const display_config = body?.display_config && typeof body.display_config === 'object'
    ? body.display_config
    : (body?.displayConfig && typeof body.displayConfig === 'object' ? body.displayConfig : {})
  return {
    widget_type: widgetType,
    title,
    subtitle,
    grid_x,
    grid_y,
    grid_w,
    grid_h,
    sort_order,
    data_config,
    display_config,
  }
}
