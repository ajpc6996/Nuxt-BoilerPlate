const MAX_FETCH_DEPTH = 6

/**
 * Load rows for every Fetch node in parallel (non-blocking).
 * Default mode: last_ingest. Optional refresh re-runs the child source.
 *
 * @param {{
 *   pipeline: { nodes: Array },
 *   organizationId: string,
 *   parentMode: 'test' | 'run',
 *   userId?: string,
 *   excludeSourceId: string,
 *   fetchStack?: string[],
 *   forceLastIngest?: boolean,
 * }} opts
 * @returns {Promise<Record<string, Record<string, unknown>[]>>}
 */
export async function loadFetchInputs(opts) {
  const fetchNodes = (opts.pipeline?.nodes || []).filter((n) => n.type === 'fetch')
  if (!fetchNodes.length) {
    throw createError({ statusCode: 400, statusMessage: 'Merge pipeline has no Fetch nodes' })
  }

  const stack = Array.isArray(opts.fetchStack) ? [...opts.fetchStack] : []
  if (stack.length >= MAX_FETCH_DEPTH) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Fetch depth exceeded (possible circular source dependency)',
    })
  }

  const pairs = await Promise.all(
    fetchNodes.map(async (node) => {
      const rows = await loadOneFetch(node, {
        organizationId: opts.organizationId,
        parentMode: opts.parentMode,
        userId: opts.userId,
        excludeSourceId: opts.excludeSourceId,
        fetchStack: stack,
        forceLastIngest: Boolean(opts.forceLastIngest),
      })
      return [node.id, rows]
    }),
  )

  return Object.fromEntries(pairs)
}

/**
 * @param {{ id: string, data?: Record<string, unknown> }} node
 * @param {{
 *   organizationId: string,
 *   parentMode: 'test' | 'run',
 *   userId?: string,
 *   excludeSourceId: string,
 *   fetchStack: string[],
 *   forceLastIngest?: boolean,
 * }} opts
 */
async function loadOneFetch(node, opts) {
  const sourceId = String(node.data?.sourceId || '').trim()
  if (!sourceId) {
    throw createError({
      statusCode: 400,
      statusMessage: `Fetch “${node.id}” has no source selected`,
    })
  }

  if (sourceId === opts.excludeSourceId) {
    throw createError({
      statusCode: 400,
      statusMessage: `Fetch “${node.id}” cannot reference this same source`,
    })
  }

  if (opts.fetchStack.includes(sourceId)) {
    throw createError({
      statusCode: 400,
      statusMessage: `Circular Fetch dependency involving source ${sourceId}`,
    })
  }

  const admin = useSupabaseAdmin()
  const { data: child, error } = await admin
    .from('data_sources')
    .select('id, organization_id, connection_id, destination_table, name, pipeline')
    .eq('id', sourceId)
    .maybeSingle()

  if (error || !child) {
    throw createError({
      statusCode: 400,
      statusMessage: `Fetch “${node.id}”: source not found`,
    })
  }

  if (child.organization_id !== opts.organizationId) {
    throw createError({
      statusCode: 403,
      statusMessage: `Fetch “${node.id}”: source is outside the active organization`,
    })
  }

  const mode = opts.forceLastIngest
    ? 'last_ingest'
    : (node.data?.mode === 'refresh' ? 'refresh' : 'last_ingest')

  if (mode === 'last_ingest') {
    return readLastIngest(child)
  }

  // Refresh now — re-run child asynchronously (nested execute).
  // Dynamic import avoids a circular dependency with executeConnection.
  const { executeDataSource } = await import('../executeConnection.js')
  const nextStack = [...opts.fetchStack, opts.excludeSourceId].filter(Boolean)
  const result = await executeDataSource({
    dataSourceId: sourceId,
    mode: opts.parentMode,
    userId: opts.userId,
    fetchStack: nextStack,
    returnRows: true,
  })

  return Array.isArray(result.rows) ? result.rows : []
}

/**
 * @param {{ destination_table: string, organization_id: string, connection_id: string, name?: string }} child
 */
async function readLastIngest(child) {
  const admin = useSupabaseAdmin()
  const { data, error } = await admin.rpc('ingest_read_rows', {
    p_table: child.destination_table,
    p_organization_id: child.organization_id,
    p_connection_id: child.connection_id,
    p_limit: 100000,
  })

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to read last ingest for “${child.name || child.destination_table}”: ${error.message}`,
    })
  }

  if (!Array.isArray(data)) return []
  return data.filter((row) => row && typeof row === 'object' && !Array.isArray(row))
}
