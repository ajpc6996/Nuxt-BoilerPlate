import { isOutbound } from '~~/shared/runnerDirection.js'
import { parseCsv, rowsToCsv, toRowArray } from '../helpers.js'

/**
 * S3-compatible object storage — inbound GetObject and outbound PutObject.
 * @param {{
 *   config: Record<string, unknown>,
 *   secrets?: Record<string, unknown>,
 *   mode?: string,
 *   direction?: string,
 *   rows?: Record<string, unknown>[],
 * }} ctx
 */
export async function runS3(ctx) {
  if (isOutbound(ctx)) return exportS3(ctx)
  return importS3(ctx)
}

/**
 * @param {import('./s3.js').runS3 extends (ctx: infer C) => unknown ? C : never} ctx
 */
async function importS3(ctx) {
  const config = ctx.config || {}
  const bucket = String(config.bucket || '').trim()
  const key = String(config.key || config.objectKey || '').trim()
  const format = String(config.format || 'json').toLowerCase()

  if (!bucket || !key) {
    throw createError({ statusCode: 400, statusMessage: 'bucket and key are required' })
  }

  const body = await getObjectBody(config, ctx.secrets || {}, bucket, key)
  const text = await bodyToString(body)

  if (format === 'csv') {
    const delimiter = String(config.delimiter || ',')
    const rows = parseCsv(text, delimiter)
    return { rows, meta: { bucket, key, format, count: rows.length } }
  }

  let payload
  try {
    payload = JSON.parse(text)
  }
  catch {
    throw createError({ statusCode: 400, statusMessage: 'S3 object is not valid JSON' })
  }
  const rows = toRowArray(payload, String(config.itemsPath || ''))
  return { rows, meta: { bucket, key, format: 'json', count: rows.length } }
}

/**
 * @param {import('./s3.js').runS3 extends (ctx: infer C) => unknown ? C : never} ctx
 */
async function exportS3(ctx) {
  const config = ctx.config || {}
  const secrets = ctx.secrets || {}
  const rows = Array.isArray(ctx.rows) ? ctx.rows : []
  const bucket = String(config.bucket || '').trim()
  const key = String(config.key || config.objectKey || '').trim()
  const format = String(config.format || 'json').toLowerCase()

  if (!bucket || !key) {
    throw createError({ statusCode: 400, statusMessage: 'bucket and key are required' })
  }

  const body = format === 'csv'
    ? rowsToCsv(rows, String(config.delimiter || ','))
    : JSON.stringify(rows, null, 2)

  const contentType = format === 'csv' ? 'text/csv' : 'application/json'
  await putObjectBody(config, secrets, bucket, key, body, contentType)

  return {
    rows: [],
    rowsWritten: rows.length,
    meta: { bucket, key, format, rowCount: rows.length },
  }
}

/**
 * @param {Record<string, unknown>} config
 * @param {Record<string, unknown>} secrets
 * @param {string} bucket
 * @param {string} key
 */
async function getObjectBody(config, secrets, bucket, key) {
  let aws
  try {
    aws = await import('@aws-sdk/client-s3')
  }
  catch {
    throw createError({
      statusCode: 503,
      statusMessage: 'S3 driver (@aws-sdk/client-s3) is not installed.',
    })
  }

  const client = new aws.S3Client(buildS3ClientConfig(config, secrets))
  const result = await client.send(new aws.GetObjectCommand({ Bucket: bucket, Key: key }))
  return result.Body
}

/**
 * @param {Record<string, unknown>} config
 * @param {Record<string, unknown>} secrets
 * @param {string} bucket
 * @param {string} key
 * @param {string} body
 * @param {string} contentType
 */
async function putObjectBody(config, secrets, bucket, key, body, contentType) {
  let aws
  try {
    aws = await import('@aws-sdk/client-s3')
  }
  catch {
    throw createError({ statusCode: 503, statusMessage: 'S3 driver (@aws-sdk/client-s3) is not installed.' })
  }

  const client = new aws.S3Client(buildS3ClientConfig(config, secrets))
  await client.send(new aws.PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
  }))
}

/**
 * @param {Record<string, unknown>} config
 * @param {Record<string, unknown>} secrets
 */
function buildS3ClientConfig(config, secrets) {
  const region = String(config.region || 'us-east-1').trim()
  const endpoint = String(config.endpoint || '').trim()
  const accessKeyId = String(secrets.accessKeyId || config.accessKeyId || '').trim()
  const secretAccessKey = secrets.secretAccessKey != null
    ? String(secrets.secretAccessKey)
    : String(config.secretAccessKey || '')

  /** @type {Record<string, unknown>} */
  const out = { region }
  if (endpoint) {
    out.endpoint = endpoint
    out.forcePathStyle = Boolean(config.forcePathStyle ?? true)
  }
  if (accessKeyId && secretAccessKey) {
    out.credentials = { accessKeyId, secretAccessKey }
  }
  return out
}

/**
 * @param {unknown} body
 */
async function bodyToString(body) {
  if (!body) return ''
  if (typeof body === 'string') return body
  if (body instanceof Uint8Array) return new TextDecoder().decode(body)
  if (typeof body.transformToString === 'function') {
    return body.transformToString('utf-8')
  }
  const chunks = []
  // @ts-ignore stream
  for await (const chunk of body) {
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}
