import ExcelJS from 'exceljs'
import { assertCanViewReport } from '~~/server/utils/reports.js'
import {
  normalizeReportQueryConfig,
  validateReportQuery,
} from '~~/shared/report.js'

/**
 * Export report rows as excel | json.
 * Body: { organizationId, reportId?, queryConfig?, format: 'excel'|'json', limit? }
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const organizationId = String(body?.organizationId || '')
  const format = String(body?.format || 'json').toLowerCase()
  if (!organizationId) {
    throw createError({ statusCode: 400, statusMessage: 'organizationId is required' })
  }
  if (!['excel', 'json'].includes(format)) {
    throw createError({ statusCode: 400, statusMessage: 'format must be excel or json' })
  }

  const member = await requireOrgMember(event, organizationId)
  const admin = useSupabaseAdmin()

  await assertLicenceAllows(admin, {
    organizationId,
    isPlatformAdmin: member.isPlatformAdmin,
    feature: 'export',
  })

  let queryConfig = normalizeReportQueryConfig(body?.queryConfig ?? body?.query_config)
  let reportName = 'report'

  if (body?.reportId) {
    const report = await assertCanViewReport(
      admin,
      String(body.reportId),
      organizationId,
      member.user.id,
      member,
    )
    queryConfig = normalizeReportQueryConfig(report.query_config)
    reportName = String(report.name || 'report').replace(/[^\w\-]+/g, '_').slice(0, 80) || 'report'
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
    Math.min(Number(body?.limit) || queryConfig.limit || 5000, 10000),
  )

  const { data, error } = await admin.rpc('report_run_query', {
    p_organization_id: organizationId,
    p_sources: queryConfig.sources,
    p_joins: queryConfig.joins,
    p_fields: queryConfig.fields.map((f) => ({
      field: f.field,
      as: f.as,
    })),
    p_limit: limit,
  })

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: error.message || 'Report export query failed',
    })
  }

  const rows = Array.isArray(data) ? data : []
  const fields = queryConfig.fields

  if (format === 'json') {
    setHeader(event, 'Content-Type', 'application/json; charset=utf-8')
    setHeader(event, 'Content-Disposition', `attachment; filename="${reportName}.json"`)
    return {
      name: reportName,
      exportedAt: new Date().toISOString(),
      fields,
      rows,
    }
  }

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Zorro'
  const sheet = workbook.addWorksheet('Report', {
    views: [{ state: 'frozen', ySplit: 1 }],
  })

  sheet.columns = fields.map((f) => ({
    header: f.header || f.as,
    key: f.as,
    width: Math.min(40, Math.max(12, String(f.header || f.as).length + 4)),
  }))

  for (const row of rows) {
    const values = {}
    for (const f of fields) {
      values[f.as] = row?.[f.as] ?? ''
    }
    sheet.addRow(values)
  }

  const buffer = await workbook.xlsx.writeBuffer()
  setHeader(event, 'Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  setHeader(event, 'Content-Disposition', `attachment; filename="${reportName}.xlsx"`)
  return Buffer.from(buffer)
})
