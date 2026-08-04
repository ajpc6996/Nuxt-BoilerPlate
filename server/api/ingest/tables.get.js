import { assertIngestIdent } from '../../utils/connectors/lookup.js'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const organizationId = String(query.organizationId || '')
  if (!organizationId) {
    throw createError({ statusCode: 400, statusMessage: 'organizationId is required' })
  }

  await requireOrgAdmin(event, organizationId)

  const admin = useSupabaseAdmin()
  const { data, error } = await admin.rpc('list_ingest_tables')
  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  const items = (data || [])
    .map((row) => (typeof row === 'string' ? row : row?.table_name))
    .filter(Boolean)
    .map((name) => {
      try {
        return assertIngestIdent(name, 'table')
      }
      catch {
        return null
      }
    })
    .filter(Boolean)

  return { items }
})
