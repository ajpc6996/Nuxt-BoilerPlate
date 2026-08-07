import { parseReportBody } from '~~/server/utils/reports.js'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const organizationId = String(body?.organizationId || '')
  if (!organizationId) {
    throw createError({ statusCode: 400, statusMessage: 'organizationId is required' })
  }

  const { user } = await requireOrgAdmin(event, organizationId)
  const parsed = parseReportBody(body)
  if (!parsed.name) {
    throw createError({ statusCode: 400, statusMessage: 'Name is required' })
  }

  const admin = useSupabaseAdmin()
  const { data: report, error } = await admin
    .from('reports')
    .insert({
      organization_id: organizationId,
      name: parsed.name,
      description: parsed.description,
      visibility: parsed.visibility,
      owner_user_id: user.id,
      query_config: parsed.query_config,
      display_config: parsed.display_config,
      created_by: user.id,
    })
    .select('*')
    .single()

  if (error || !report) {
    throw createError({ statusCode: 500, statusMessage: error?.message || 'Create failed' })
  }

  return { item: report }
})
