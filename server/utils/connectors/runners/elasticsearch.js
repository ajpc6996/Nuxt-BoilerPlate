import { isOutbound, getMaxRows } from '~~/shared/runnerDirection.js'

/**
 * Elasticsearch — inbound search and outbound bulk index.
 * @param {{
 *   config: Record<string, unknown>,
 *   secrets?: Record<string, unknown>,
 *   mode?: string,
 *   direction?: string,
 *   rows?: Record<string, unknown>[],
 * }} ctx
 */
export async function runElasticsearch(ctx) {
  if (isOutbound(ctx)) return exportElasticsearch(ctx)
  return importElasticsearch(ctx)
}

/**
 * @param {import('./elasticsearch.js').runElasticsearch extends (ctx: infer C) => unknown ? C : never} ctx
 */
async function importElasticsearch(ctx) {
  const config = ctx.config || {}
  const secrets = ctx.secrets || {}
  const index = String(config.index || '').trim()
  const maxRows = getMaxRows(ctx, 10, 1000)

  if (!index) {
    throw createError({ statusCode: 400, statusMessage: 'index is required' })
  }

  let es
  try {
    es = await import('@elastic/elasticsearch')
  }
  catch {
    throw createError({
      statusCode: 503,
      statusMessage: 'Elasticsearch driver is not installed. Install it from Administration → Connector drivers.',
    })
  }

  const client = new es.Client({
    node: String(config.node || config.host || 'http://127.0.0.1:9200').trim(),
    auth: buildEsAuth(config, secrets),
    tls: config.tlsRejectUnauthorized === false ? { rejectUnauthorized: false } : undefined,
  })

  const query = config.query && typeof config.query === 'object'
    ? config.query
    : { match_all: {} }

  const result = await client.search({
    index,
    size: maxRows,
    query,
  })

  const hits = result.hits?.hits || []
  const rows = hits.map((hit) => ({
    _id: hit._id,
    ...(hit._source && typeof hit._source === 'object' ? hit._source : {}),
  }))

  return {
    rows,
    meta: { index, rowCount: rows.length },
  }
}

/**
 * @param {import('./elasticsearch.js').runElasticsearch extends (ctx: infer C) => unknown ? C : never} ctx
 */
async function exportElasticsearch(ctx) {
  const config = ctx.config || {}
  const secrets = ctx.secrets || {}
  const rows = Array.isArray(ctx.rows) ? ctx.rows : []
  const index = String(config.index || '').trim()
  const idField = String(config.idField || '_id').trim()

  if (!index) {
    throw createError({ statusCode: 400, statusMessage: 'index is required' })
  }
  if (!rows.length) {
    return { rows: [], rowsWritten: 0, meta: { index, rowCount: 0 } }
  }

  let es
  try {
    es = await import('@elastic/elasticsearch')
  }
  catch {
    throw createError({ statusCode: 503, statusMessage: 'Elasticsearch driver is not installed.' })
  }

  const client = new es.Client({
    node: String(config.node || config.host || 'http://127.0.0.1:9200').trim(),
    auth: buildEsAuth(config, secrets),
    tls: config.tlsRejectUnauthorized === false ? { rejectUnauthorized: false } : undefined,
  })

  const operations = []
  for (const row of rows) {
    const doc = { ...row }
    const id = idField && row[idField] != null ? String(row[idField]) : undefined
    if (id != null) delete doc[idField]
    operations.push({ index: { _index: index, ...(id ? { _id: id } : {}) } })
    operations.push(doc)
  }

  const result = await client.bulk({ operations, refresh: false })
  if (result.errors) {
    const first = (result.items || []).find((item) => item.index?.error)
    throw createError({
      statusCode: 500,
      statusMessage: first?.index?.error?.reason || 'Elasticsearch bulk index failed',
    })
  }

  const written = rows.length
  return { rows: [], rowsWritten: written, meta: { index, rowCount: written } }
}

/**
 * @param {Record<string, unknown>} config
 * @param {Record<string, unknown>} secrets
 */
function buildEsAuth(config, secrets) {
  const apiKey = secrets.apiKey || config.apiKey
  if (apiKey) return { apiKey: String(apiKey) }
  const username = String(secrets.username || config.username || '').trim()
  const password = secrets.password != null ? String(secrets.password) : ''
  if (username) return { username, password }
  return undefined
}
