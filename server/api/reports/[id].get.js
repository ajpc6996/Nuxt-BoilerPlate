import { assertCanViewReport } from '~~/server/utils/reports.js'
import {
  normalizeReportDisplayConfig,
  normalizeReportQueryConfig,
} from '~~/shared/report.js'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const query = getQuery(event)
  const organizationId = String(query.organizationId || '')
  if (!id || !organizationId) {
    throw createError({ statusCode: 400, statusMessage: 'id and organizationId are required' })
  }

  const member = await requireOrgMember(event, organizationId)
  const admin = useSupabaseAdmin()
  const report = await assertCanViewReport(
    admin,
    id,
    organizationId,
    member.user.id,
    member,
  )

  return {
    item: {
      ...report,
      query_config: normalizeReportQueryConfig(report.query_config),
      display_config: normalizeReportDisplayConfig(report.display_config),
    },
  }
})
