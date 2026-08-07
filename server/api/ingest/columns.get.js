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

  /** @type {Map<string, string>} */
  const byName = new Map()

  for (const row of data || []) {
    const name = row.column_name || row.name
    if (!name || meta.has(name)) continue
    byName.set(name, row.data_type || row.dataType || '')
  }

  // Business fields live in ingest.<table>.data jsonb — sample keys for the org.
  try {
    const { data: samples, error: sampleError } = await admin
      .schema('ingest')
      .from(safeTable)
      .select('data')
      .eq('organization_id', organizationId)
      .limit(80)

    if (!sampleError && Array.isArray(samples)) {
      for (const row of samples) {
        const payload = row?.data
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) continue
        for (const key of Object.keys(payload)) {
          if (!key || meta.has(key) || byName.has(key)) continue
          byName.set(key, 'json')
        }
      }
    }
  }
  catch {
    // Table may be empty / missing — physical columns alone still returned.
  }

  const items = [...byName.entries()]
    .map(([name, dataType]) => ({ name, dataType }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return { items, table: safeTable }
})
