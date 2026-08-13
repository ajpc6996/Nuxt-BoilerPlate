import { assertCanViewDashboard, decodeWidgetFromDb } from '~~/server/utils/dashboards.js'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const query = getQuery(event)
  const organizationId = String(query.organizationId || '')
  if (!id || !organizationId) {
    throw createError({ statusCode: 400, statusMessage: 'id and organizationId are required' })
  }

  const member = await requireOrgMember(event, organizationId)
  const admin = useSupabaseAdmin()
  const dash = await assertCanViewDashboard(
    admin,
    id,
    organizationId,
    member.user.id,
    member,
  )

  const widgets = (dash.dashboard_widgets || [])
    .slice()
    .sort((a, b) => (a.sort_order - b.sort_order) || (a.grid_y - b.grid_y) || (a.grid_x - b.grid_x))
    .map((w) => decodeWidgetFromDb(w))

  return {
    item: {
      ...dash,
      dashboard_widgets: undefined,
      widgets,
      roleIds: (dash.dashboard_roles || []).map((r) => r.role_id),
      dashboard_roles: undefined,
    },
  }
})
