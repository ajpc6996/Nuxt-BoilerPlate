import { isOutbound } from '~~/shared/runnerDirection.js'
import { parseCsv, rowsToCsv, toRowArray } from '../helpers.js'

/**
 * SFTP — inbound download and outbound upload (CSV/JSON).
 * @param {{
 *   config: Record<string, unknown>,
 *   secrets?: Record<string, unknown>,
 *   mode?: string,
 *   direction?: string,
 *   rows?: Record<string, unknown>[],
 * }} ctx
 */
export async function runSftp(ctx) {
  if (isOutbound(ctx)) return exportSftp(ctx)
  return importSftp(ctx)
}

/**
 * @param {import('./sftp.js').runSftp extends (ctx: infer C) => unknown ? C : never} ctx
 */
async function importSftp(ctx) {
  const config = ctx.config || {}
  const remotePath = String(config.remotePath || '').trim()
  const format = String(config.format || 'json').toLowerCase()

  if (!remotePath) {
    throw createError({ statusCode: 400, statusMessage: 'remotePath is required' })
  }

  const text = await withSftpClient(config, ctx.secrets || {}, async (sftp) => {
    const buf = await sftp.get(remotePath)
    return Buffer.isBuffer(buf) ? buf.toString('utf8') : String(buf || '')
  })

  if (format === 'csv') {
    const rows = parseCsv(text, String(config.delimiter || ','))
    return { rows, meta: { remotePath, format, count: rows.length } }
  }

  let payload
  try {
    payload = JSON.parse(text)
  }
  catch {
    throw createError({ statusCode: 400, statusMessage: 'Remote file is not valid JSON' })
  }
  const rows = toRowArray(payload, String(config.itemsPath || ''))
  return { rows, meta: { remotePath, format: 'json', count: rows.length } }
}

/**
 * @param {import('./sftp.js').runSftp extends (ctx: infer C) => unknown ? C : never} ctx
 */
async function exportSftp(ctx) {
  const config = ctx.config || {}
  const secrets = ctx.secrets || {}
  const rows = Array.isArray(ctx.rows) ? ctx.rows : []
  const remotePath = String(config.remotePath || '').trim()
  const format = String(config.format || 'json').toLowerCase()

  if (!remotePath) {
    throw createError({ statusCode: 400, statusMessage: 'remotePath is required' })
  }

  const body = format === 'csv'
    ? rowsToCsv(rows, String(config.delimiter || ','))
    : JSON.stringify(rows, null, 2)

  await withSftpClient(config, secrets, async (sftp) => {
    await sftp.put(Buffer.from(body, 'utf8'), remotePath)
  })

  return {
    rows: [],
    rowsWritten: rows.length,
    meta: { remotePath, format, rowCount: rows.length },
  }
}

/**
 * @param {Record<string, unknown>} config
 * @param {Record<string, unknown>} secrets
 * @param {(client: import('ssh2-sftp-client')) => Promise<unknown>} fn
 */
async function withSftpClient(config, secrets, fn) {
  let SftpClient
  try {
    const mod = await import('ssh2-sftp-client')
    SftpClient = mod.default
  }
  catch {
    throw createError({
      statusCode: 503,
      statusMessage: 'SFTP driver (ssh2-sftp-client) is not installed.',
    })
  }

  const sftp = new SftpClient()
  const host = String(config.host || '').trim()
  const port = Number(config.port) || 22
  const username = String(secrets.username || config.username || '').trim()
  const password = secrets.password != null ? String(secrets.password) : undefined
  const privateKey = secrets.privateKey != null ? String(secrets.privateKey) : undefined

  if (!host || !username) {
    throw createError({ statusCode: 400, statusMessage: 'host and username are required' })
  }
  if (!password && !privateKey) {
    throw createError({ statusCode: 400, statusMessage: 'password or privateKey is required' })
  }

  await sftp.connect({
    host,
    port,
    username,
    password,
    privateKey,
  })

  try {
    return await fn(sftp)
  }
  finally {
    await sftp.end()
  }
}
