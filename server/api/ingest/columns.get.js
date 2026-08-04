import { assertIngestIdent } from '../../utils/connectors/lookup.js'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const organizationId = String(query.organizationId || '')
  const table = String(query.table || '')

  if (!organizationId || !table) {
    throw createError({
      statusCode: 400,
      statusMessage: 'organizationId and table are required',
    })
  }

  await requireOrgAdmin(event, organizationId)
  const safeTable = assertIngestIdent(table, 'table')

  const admin = useSupabaseAdmin()
  const { data, error } = await admin.rpc('list_ingest_columns', {
    p_table: safeTable,
  })

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  const meta = new Set([
    'id',
    'organization_id',
    'connection_id',
    'run_id',
    'row_index',
    'data',
    'ingested_at',
  ])

  const items = (data || [])
    .map((row) => ({
      name: row.column_name || row.name,
      dataType: row.data_type || row.dataType || '',
    }))
    .filter((c) => c.name && !meta.has(c.name))

  return { items, table: safeTable }
})
