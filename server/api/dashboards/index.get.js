import { listVisibleDashboards } from '~~/server/utils/dashboards.js'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const organizationId = String(query.organizationId || '')
  if (!organizationId) {
    throw createError({ statusCode: 400, statusMessage: 'organizationId is required' })
  }

  const member = await requireOrgMember(event, organizationId)
  const admin = useSupabaseAdmin()
  const items = await listVisibleDashboards(
    admin,
    organizationId,
    member.user.id,
    member,
  )

  return { items }
})
