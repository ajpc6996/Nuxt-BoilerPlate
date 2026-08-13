import { normalizeDataConfig } from '~~/shared/dashboard.js'
import { normalizeDashboardLayout, normalizeDisplayConfig } from '~~/shared/dashboardLayout.js'

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
  const rawLayout = body?.layout && typeof body.layout === 'object' ? body.layout : {}
  // Prefer explicit toolsMenuEnabled / showToolsMenu body fields if present.
  const layout = normalizeDashboardLayout({
    ...rawLayout,
    showToolsMenu: body?.toolsMenuEnabled === true
      || body?.showToolsMenu === true
      || rawLayout.showToolsMenu === true
      || rawLayout?.tools?.enabled === true,
    tools: {
      ...(rawLayout.tools && typeof rawLayout.tools === 'object' ? rawLayout.tools : {}),
      enabled: body?.toolsMenuEnabled === true
        || body?.showToolsMenu === true
        || rawLayout.showToolsMenu === true
        || rawLayout?.tools?.enabled === true
        || rawLayout?.tools?.enabled === 'true'
        || rawLayout?.tools?.enabled === 1,
    },
  })
  const roleIds = Array.isArray(body?.roleIds)
    ? body.roleIds.map((id) => String(id)).filter(Boolean)
    : []
  return { name, description, visibility, layout, roleIds }
}

/**
 * Ensure selected role IDs belong to the organization.
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {string} organizationId
 * @param {string[]} roleIds
 */
export async function assertRolesInOrganization(admin, organizationId, roleIds) {
  const ids = [...new Set((roleIds || []).map((id) => String(id)).filter(Boolean))]
  if (!ids.length) return []

  const { data, error } = await admin
    .from('roles')
    .select('id')
    .eq('organization_id', organizationId)
    .in('id', ids)

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }
  if ((data || []).length !== ids.length) {
    throw createError({
      statusCode: 400,
      statusMessage: 'One or more selected roles are not in this organization',
    })
  }
  return ids
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
  const rawDisplay = body?.display_config && typeof body.display_config === 'object'
    ? body.display_config
    : (body?.displayConfig && typeof body.displayConfig === 'object' ? body.displayConfig : {})
  // Prefer explicit top-level showTools when present (mirrors dashboard toolsMenuEnabled).
  const display_config = normalizeDisplayConfig({
    ...rawDisplay,
    showTools: body?.showTools === true
      || body?.showTools === 'true'
      || body?.showTools === 1
      || body?.showTools === '1'
      || rawDisplay.showTools,
  })
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

/**
 * Persist polar as donut + display_config.polarArea so saves work before the
 * DB widget_type check includes 'polar'.
 * @param {{ widget_type: string, display_config?: Record<string, unknown> }} parsed
 */
export function encodeWidgetForDb(parsed) {
  const display = normalizeDisplayConfig(parsed.display_config || {})
  if (parsed.widget_type === 'polar') {
    return {
      ...parsed,
      widget_type: 'donut',
      display_config: { ...display, polarArea: true },
    }
  }
  return {
    ...parsed,
    display_config: { ...display, polarArea: false },
  }
}

/**
 * Surface stored polar-area widgets as widget_type polar for the client.
 * @param {Record<string, unknown> | null | undefined} widget
 */
export function decodeWidgetFromDb(widget) {
  if (!widget || typeof widget !== 'object') return widget
  const display = normalizeDisplayConfig(widget.display_config)
  if (display.polarArea || widget.widget_type === 'polar') {
    return {
      ...widget,
      widget_type: 'polar',
      display_config: { ...display, polarArea: true },
    }
  }
  return {
    ...widget,
    display_config: display,
  }
}
