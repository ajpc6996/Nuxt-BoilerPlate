import { isOutbound, getMaxRows } from '~~/shared/runnerDirection.js'

/**
 * MongoDB — inbound find and outbound insertMany.
 * @param {{
 *   config: Record<string, unknown>,
 *   secrets?: Record<string, unknown>,
 *   mode?: string,
 *   direction?: string,
 *   rows?: Record<string, unknown>[],
 * }} ctx
 */
export async function runMongodb(ctx) {
  if (isOutbound(ctx)) return exportMongodb(ctx)
  return importMongodb(ctx)
}

/**
 * @param {import('./mongodb.js').runMongodb extends (ctx: infer C) => unknown ? C : never} ctx
 */
async function importMongodb(ctx) {
  const config = ctx.config || {}
  const secrets = ctx.secrets || {}
  const database = String(config.database || '').trim()
  const collection = String(config.collection || '').trim()
  const maxRows = getMaxRows(ctx)

  if (!database || !collection) {
    throw createError({ statusCode: 400, statusMessage: 'database and collection are required' })
  }

  let mongodb
  try {
    mongodb = await import('mongodb')
  }
  catch {
    throw createError({
      statusCode: 503,
      statusMessage: 'MongoDB driver is not installed. Install it from Administration → Connector drivers.',
    })
  }

  const uri = buildMongoUri(config, secrets)
  const client = new mongodb.MongoClient(uri)
  await client.connect()
  try {
    const filter = config.filter && typeof config.filter === 'object' ? config.filter : {}
    const cursor = client.db(database).collection(collection).find(filter).limit(maxRows)
    const list = await cursor.toArray()
    return {
      rows: list.map((doc) => ({ ...doc, _id: doc._id != null ? String(doc._id) : undefined })),
      meta: { database, collection, rowCount: list.length },
    }
  }
  finally {
    await client.close()
  }
}

/**
 * @param {import('./mongodb.js').runMongodb extends (ctx: infer C) => unknown ? C : never} ctx
 */
async function exportMongodb(ctx) {
  const config = ctx.config || {}
  const secrets = ctx.secrets || {}
  const rows = Array.isArray(ctx.rows) ? ctx.rows : []
  const database = String(config.database || '').trim()
  const collection = String(config.collection || '').trim()
  if (!database || !collection) {
    throw createError({ statusCode: 400, statusMessage: 'database and collection are required' })
  }
  if (!rows.length) {
    return { rows: [], rowsWritten: 0, meta: { database, collection, rowCount: 0 } }
  }

  let mongodb
  try {
    mongodb = await import('mongodb')
  }
  catch {
    throw createError({ statusCode: 503, statusMessage: 'MongoDB driver is not installed.' })
  }

  const uri = buildMongoUri(config, secrets)
  const client = new mongodb.MongoClient(uri)
  await client.connect()
  try {
    const result = await client.db(database).collection(collection).insertMany(rows)
    const written = Number(result.insertedCount) || rows.length
    return { rows: [], rowsWritten: written, meta: { database, collection, rowCount: written } }
  }
  finally {
    await client.close()
  }
}

/**
 * @param {Record<string, unknown>} config
 * @param {Record<string, unknown>} secrets
 */
function buildMongoUri(config, secrets) {
  const connectionString = String(config.connectionString || secrets.connectionString || '').trim()
  if (connectionString) return connectionString

  const host = String(config.host || '127.0.0.1').trim()
  const port = Number(config.port) || 27017
  const database = String(config.database || '').trim()
  const user = String(secrets.username || config.username || '').trim()
  const password = secrets.password != null ? String(secrets.password) : ''
  if (user) {
    const encUser = encodeURIComponent(user)
    const encPass = encodeURIComponent(password)
    return `mongodb://${encUser}:${encPass}@${host}:${port}/${database}`
  }
  return `mongodb://${host}:${port}/${database}`
}
