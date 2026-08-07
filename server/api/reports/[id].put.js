import { parseReportBody } from '~~/server/utils/reports.js'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const body = await readBody(event)
  const organizationId = String(body?.organizationId || '')
  if (!id || !organizationId) {
    throw createError({ statusCode: 400, statusMessage: 'id and organizationId are required' })
  }

  await requireOrgAdmin(event, organizationId)
  const parsed = parseReportBody(body)
  if (!parsed.name) {
    throw createError({ statusCode: 400, statusMessage: 'Name is required' })
  }

  const admin = useSupabaseAdmin()
  const { data: report, error } = await admin
    .from('reports')
    .update({
      name: parsed.name,
      description: parsed.description,
      visibility: parsed.visibility,
      query_config: parsed.query_config,
      display_config: parsed.display_config,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select('*')
    .maybeSingle()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }
  if (!report) {
    throw createError({ statusCode: 404, statusMessage: 'Report not found' })
  }

  return { item: report }
})
