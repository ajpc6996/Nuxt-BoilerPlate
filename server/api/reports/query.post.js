import { assertCanViewReport } from '~~/server/utils/reports.js'
import {
  normalizeReportQueryConfig,
  validateReportQuery,
} from '~~/shared/report.js'
import { getIngestBackend } from '~~/server/utils/ingestBackend.js'

/**
 * Run a saved report or ad-hoc preview query.
 * Body: { organizationId, reportId?, queryConfig?, limit? }
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const organizationId = String(body?.organizationId || '')
  if (!organizationId) {
    throw createError({ statusCode: 400, statusMessage: 'organizationId is required' })
  }

  const member = await requireOrgMember(event, organizationId)
  const admin = useSupabaseAdmin()

  let queryConfig = normalizeReportQueryConfig(body?.queryConfig ?? body?.query_config)

  if (body?.reportId) {
    const report = await assertCanViewReport(
      admin,
      String(body.reportId),
      organizationId,
      member.user.id,
      member,
    )
    queryConfig = normalizeReportQueryConfig(report.query_config)
  }
  else {
    await requireOrgAdmin(event, organizationId)
  }

  const validationError = validateReportQuery(queryConfig)
  if (validationError) {
    throw createError({ statusCode: 400, statusMessage: validationError })
  }

  const limit = Math.max(
    1,
    Math.min(Number(body?.limit) || queryConfig.limit || 500, 10000),
  )

  const ingestBackend = await getIngestBackend(admin, organizationId)
  const rows = await ingestBackend.reportRunQuery({
    organizationId,
    sources: queryConfig.sources,
    joins: queryConfig.joins,
    fields: queryConfig.fields.map((f) => ({
      field: f.field,
      as: f.as,
    })),
    limit,
  })
  return {
    rows,
    fields: queryConfig.fields,
    rowCount: rows.length,
  }
})
