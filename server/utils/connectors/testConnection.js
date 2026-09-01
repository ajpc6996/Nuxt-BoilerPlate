import { decryptSecrets } from '../connectorCrypto.js'
import { normalizeConnectionDirection } from '~~/shared/connectionDirection.js'
import { isRunnerOperational, loadEnabledRunnersMap } from './capabilities.js'

/**
 * Probe host/auth for a connection without running a data flow.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {{
 *   organizationId: string,
 *   connectionId?: string,
 *   connectorTypeId?: string,
 *   config?: Record<string, unknown>,
 *   credentials?: Record<string, unknown>,
 *   direction?: string,
 * }} opts
 */
export async function testConnectionConnectivity(admin, opts) {
  const organizationId = String(opts.organizationId || '').trim()
  if (!organizationId) {
    throw createError({ statusCode: 400, statusMessage: 'organizationId is required' })
  }

  let connectionId = opts.connectionId ? String(opts.connectionId) : ''
  /** @type {Record<string, unknown>} */
  let config = opts.config && typeof opts.config === 'object' ? { ...opts.config } : {}
  /** @type {Record<string, unknown>} */
  let credentials = opts.credentials && typeof opts.credentials === 'object'
    ? { ...opts.credentials }
    : {}
  let direction = normalizeConnectionDirection(opts.direction)
  let connectorTypeId = opts.connectorTypeId ? String(opts.connectorTypeId) : ''
  /** @type {Record<string, unknown> | null} */
  let type = null

  if (connectionId) {
    const { data: connection, error } = await admin
      .from('connections')
      .select('id, organization_id, direction, config, connector_type_id, connector_types(*)')
      .eq('id', connectionId)
      .eq('organization_id', organizationId)
      .maybeSingle()

    if (error || !connection) {
      throw createError({ statusCode: 404, statusMessage: 'Connection not found' })
    }

    type = connection.connector_types
    connectorTypeId = connection.connector_type_id
    direction = normalizeConnectionDirection(
      opts.direction != null ? opts.direction : connection.direction,
    )
    config = {
      ...(connection.config && typeof connection.config === 'object' ? connection.config : {}),
      ...config,
    }

    const { data: secretRow } = await admin
      .from('connection_secrets')
      .select('ciphertext')
      .eq('connection_id', connectionId)
      .maybeSingle()

    const previous = secretRow?.ciphertext ? decryptSecrets(secretRow.ciphertext) : {}
    const mergedSecrets = { ...previous }
    Object.entries(credentials).forEach(([key, value]) => {
      if (value != null && String(value).trim() !== '') {
        mergedSecrets[key] = value
      }
    })
    credentials = mergedSecrets
  }
  else if (connectorTypeId) {
    const { data: typeRow, error } = await admin
      .from('connector_types')
      .select('*')
      .eq('id', connectorTypeId)
      .maybeSingle()
    if (error || !typeRow) {
      throw createError({ statusCode: 400, statusMessage: 'Unknown connector type' })
    }
    type = typeRow
  }
  else {
    throw createError({
      statusCode: 400,
      statusMessage: 'connectionId or connectorTypeId is required',
    })
  }

  if (!type?.is_enabled) {
    throw createError({ statusCode: 400, statusMessage: 'Connector type is disabled' })
  }

  const runnerKey = String(type.runner_key || '').trim()
  const enabledMap = await loadEnabledRunnersMap(admin)
  const builtIn = ['rest_generic', 'csv_file', 'json_file'].includes(runnerKey)
  if (!builtIn) {
    const operational = await isRunnerOperational(runnerKey, enabledMap)
    if (!operational) {
      throw createError({
        statusCode: 400,
        statusMessage: `Connector runner “${runnerKey}” is not available. Enable it under Administration → Connector drivers.`,
      })
    }
  }

  const startedAt = Date.now()
  try {
    const meta = await probeRunner({
      runnerKey,
      config,
      secrets: credentials,
      direction,
    })
    const latencyMs = Date.now() - startedAt

    if (connectionId) {
      await admin
        .from('connections')
        .update({
          status: 'ready',
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', connectionId)
    }

    return {
      ok: true,
      direction,
      runnerKey,
      latencyMs,
      message: meta.message || 'Connection successful',
      meta,
    }
  }
  catch (err) {
    const message = err?.statusMessage || err?.message || 'Connection test failed'
    if (connectionId) {
      await admin
        .from('connections')
        .update({
          status: 'error',
          last_error: message,
          updated_at: new Date().toISOString(),
        })
        .eq('id', connectionId)
    }
    throw createError({
      statusCode: err?.statusCode || 400,
      statusMessage: message,
    })
  }
}

/**
 * @param {{
 *   runnerKey: string,
 *   config: Record<string, unknown>,
 *   secrets: Record<string, unknown>,
 *   direction: 'inbound'|'outbound',
 * }} opts
 */
async function probeRunner(opts) {
  switch (opts.runnerKey) {
    case 'postgres':
      return probePostgres(opts)
    case 'mysql':
      return probeMysql(opts)
    case 'mssql':
      return probeMssql(opts)
    case 'oracle':
      return probeOracle(opts)
    case 'mongodb':
      return probeMongodb(opts)
    case 'elasticsearch':
      return probeElasticsearch(opts)
    case 'rest_generic':
      return probeRest(opts)
    case 's3':
      return probeS3(opts)
    case 'sftp':
      return probeSftp(opts)
    case 'csv_file':
    case 'json_file':
      return probeFile(opts)
    default:
      throw createError({
        statusCode: 400,
        statusMessage: `No connectivity probe for runner “${opts.runnerKey}”`,
      })
  }
}

async function probePostgres(opts) {
  let pg
  try {
    pg = await import('pg')
  }
  catch {
    throw createError({ statusCode: 503, statusMessage: 'PostgreSQL driver (pg) is not installed.' })
  }
  const config = opts.config || {}
  const secrets = opts.secrets || {}
  const client = new pg.Client({
    host: String(config.host || '127.0.0.1').trim(),
    port: Number(config.port) || 5432,
    database: String(config.database || '').trim(),
    user: String(secrets.username || config.username || '').trim(),
    password: secrets.password != null ? String(secrets.password) : '',
    ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: 8000,
  })
  if (!String(config.database || '').trim()) {
    throw createError({ statusCode: 400, statusMessage: 'database is required' })
  }
  await client.connect()
  try {
    await client.query('select 1 as ok')
  }
  finally {
    await client.end()
  }
  return {
    message: `PostgreSQL reachable at ${config.host || '127.0.0.1'}:${Number(config.port) || 5432}`,
    host: config.host || '127.0.0.1',
    port: Number(config.port) || 5432,
    database: config.database,
  }
}

async function probeMysql(opts) {
  let mysql
  try {
    mysql = await import('mysql2/promise')
  }
  catch {
    throw createError({ statusCode: 503, statusMessage: 'MySQL driver (mysql2) is not installed.' })
  }
  const config = opts.config || {}
  const secrets = opts.secrets || {}
  if (!String(config.database || '').trim()) {
    throw createError({ statusCode: 400, statusMessage: 'database is required' })
  }
  const connection = await mysql.createConnection({
    host: String(config.host || '127.0.0.1').trim(),
    port: Number(config.port) || 3306,
    database: String(config.database || '').trim(),
    user: String(secrets.username || config.username || '').trim(),
    password: secrets.password != null ? String(secrets.password) : '',
    ssl: config.ssl ? {} : undefined,
    connectTimeout: 8000,
  })
  try {
    await connection.query('select 1 as ok')
  }
  finally {
    await connection.end()
  }
  return {
    message: `MySQL reachable at ${config.host || '127.0.0.1'}:${Number(config.port) || 3306}`,
    host: config.host || '127.0.0.1',
    port: Number(config.port) || 3306,
    database: config.database,
  }
}

async function probeMssql(opts) {
  let sql
  try {
    sql = await import('mssql')
  }
  catch {
    throw createError({ statusCode: 503, statusMessage: 'MSSQL driver (mssql) is not installed.' })
  }
  const config = opts.config || {}
  const secrets = opts.secrets || {}
  if (!String(config.database || '').trim()) {
    throw createError({ statusCode: 400, statusMessage: 'database is required' })
  }
  const pool = await sql.connect({
    server: String(config.host || '127.0.0.1').trim(),
    port: Number(config.port) || 1433,
    database: String(config.database || '').trim(),
    user: String(secrets.username || config.username || '').trim(),
    password: secrets.password != null ? String(secrets.password) : '',
    options: {
      encrypt: Boolean(config.encrypt ?? config.ssl),
      trustServerCertificate: true,
    },
    connectionTimeout: 8000,
  })
  try {
    await pool.request().query('select 1 as ok')
  }
  finally {
    await pool.close()
  }
  return {
    message: `SQL Server reachable at ${config.host || '127.0.0.1'}:${Number(config.port) || 1433}`,
    host: config.host || '127.0.0.1',
    port: Number(config.port) || 1433,
    database: config.database,
  }
}

async function probeOracle(opts) {
  let oracledb
  try {
    oracledb = await import('oracledb')
  }
  catch {
    throw createError({ statusCode: 503, statusMessage: 'Oracle driver (oracledb) is not installed.' })
  }
  const config = opts.config || {}
  const secrets = opts.secrets || {}
  const connectString = String(config.connectString || config.connectionString || '').trim()
    || `${String(config.host || '127.0.0.1').trim()}:${Number(config.port) || 1521}/${String(config.serviceName || config.database || '').trim()}`
  const conn = await oracledb.getConnection({
    user: String(secrets.username || config.username || '').trim(),
    password: secrets.password != null ? String(secrets.password) : '',
    connectString,
  })
  try {
    await conn.execute('select 1 from dual')
  }
  finally {
    await conn.close()
  }
  return { message: `Oracle reachable (${connectString})`, connectString }
}

async function probeMongodb(opts) {
  let mongodb
  try {
    mongodb = await import('mongodb')
  }
  catch {
    throw createError({ statusCode: 503, statusMessage: 'MongoDB driver is not installed.' })
  }
  const config = opts.config || {}
  const secrets = opts.secrets || {}
  const uri = String(config.uri || config.connectionString || '').trim()
  if (!uri) {
    throw createError({ statusCode: 400, statusMessage: 'uri is required' })
  }
  const client = new mongodb.MongoClient(uri, {
    auth: secrets.username
      ? {
          username: String(secrets.username),
          password: secrets.password != null ? String(secrets.password) : '',
        }
      : undefined,
    serverSelectionTimeoutMS: 8000,
  })
  try {
    await client.connect()
    await client.db().command({ ping: 1 })
  }
  finally {
    await client.close()
  }
  return { message: 'MongoDB ping ok' }
}

async function probeElasticsearch(opts) {
  const config = opts.config || {}
  const secrets = opts.secrets || {}
  const node = String(config.node || config.baseUrl || '').trim().replace(/\/$/, '')
  if (!node) {
    throw createError({ statusCode: 400, statusMessage: 'node / baseUrl is required' })
  }
  const headers = { Accept: 'application/json' }
  if (secrets.apiKey) {
    headers.Authorization = `ApiKey ${secrets.apiKey}`
  }
  else if (secrets.username) {
    const token = Buffer.from(`${secrets.username}:${secrets.password || ''}`).toString('base64')
    headers.Authorization = `Basic ${token}`
  }
  const res = await fetch(`${node}/`, { method: 'GET', headers, signal: AbortSignal.timeout(8000) })
  if (!res.ok) {
    throw createError({
      statusCode: 400,
      statusMessage: `Elasticsearch responded HTTP ${res.status}`,
    })
  }
  return { message: `Elasticsearch reachable at ${node}`, status: res.status }
}

async function probeRest(opts) {
  const config = opts.config || {}
  const secrets = opts.secrets || {}
  const baseUrl = String(config.baseUrl || '').trim().replace(/\/$/, '')
  if (!baseUrl) {
    throw createError({ statusCode: 400, statusMessage: 'baseUrl is required' })
  }
  if (!/^https?:\/\//i.test(baseUrl)) {
    throw createError({ statusCode: 400, statusMessage: 'baseUrl must be http(s)' })
  }
  const headers = { Accept: 'application/json' }
  const authMode = String(config.authMode || '').trim().toLowerCase()
  const apiKey = secrets.apiKey
  if (authMode !== 'none' && apiKey) {
    const headerName = String(config.authHeader || 'Authorization')
    const prefix = String(config.authPrefix || 'Bearer').trim()
    headers[headerName] = prefix ? `${prefix} ${apiKey}` : String(apiKey)
  }
  const res = await fetch(baseUrl, {
    method: 'GET',
    headers,
    signal: AbortSignal.timeout(8000),
    redirect: 'follow',
  })
  // Any HTTP response means TCP/TLS + host are reachable; 401/403 still prove auth endpoint is up.
  if (res.status >= 500) {
    throw createError({
      statusCode: 400,
      statusMessage: `REST host responded HTTP ${res.status}`,
    })
  }
  return {
    message: `REST host reachable (HTTP ${res.status})`,
    status: res.status,
    baseUrl,
  }
}

async function probeS3(opts) {
  let AWS
  try {
    AWS = await import('@aws-sdk/client-s3')
  }
  catch {
    throw createError({ statusCode: 503, statusMessage: 'S3 driver (@aws-sdk/client-s3) is not installed.' })
  }
  const config = opts.config || {}
  const secrets = opts.secrets || {}
  const bucket = String(config.bucket || '').trim()
  if (!bucket) {
    throw createError({ statusCode: 400, statusMessage: 'bucket is required' })
  }
  const client = new AWS.S3Client({
    region: String(config.region || 'us-east-1'),
    endpoint: config.endpoint ? String(config.endpoint) : undefined,
    forcePathStyle: Boolean(config.forcePathStyle),
    credentials: secrets.accessKeyId
      ? {
          accessKeyId: String(secrets.accessKeyId),
          secretAccessKey: String(secrets.secretAccessKey || ''),
        }
      : undefined,
  })
  await client.send(new AWS.HeadBucketCommand({ Bucket: bucket }))
  return { message: `S3 bucket “${bucket}” reachable`, bucket }
}

async function probeSftp(opts) {
  let SftpClient
  try {
    const mod = await import('ssh2-sftp-client')
    SftpClient = mod.default || mod
  }
  catch {
    throw createError({ statusCode: 503, statusMessage: 'SFTP driver (ssh2-sftp-client) is not installed.' })
  }
  const config = opts.config || {}
  const secrets = opts.secrets || {}
  const host = String(config.host || '').trim()
  if (!host) {
    throw createError({ statusCode: 400, statusMessage: 'host is required' })
  }
  const sftp = new SftpClient()
  try {
    await sftp.connect({
      host,
      port: Number(config.port) || 22,
      username: String(secrets.username || config.username || '').trim(),
      password: secrets.password != null ? String(secrets.password) : undefined,
      privateKey: secrets.privateKey ? String(secrets.privateKey) : undefined,
      readyTimeout: 8000,
    })
    await sftp.cwd()
  }
  finally {
    try {
      await sftp.end()
    }
    catch {
      // ignore close errors
    }
  }
  return { message: `SFTP reachable at ${host}:${Number(config.port) || 22}`, host }
}

async function probeFile(opts) {
  const { access } = await import('node:fs/promises')
  const { constants } = await import('node:fs')
  const config = opts.config || {}
  const filePath = String(config.path || config.filePath || '').trim()
  if (!filePath) {
    throw createError({ statusCode: 400, statusMessage: 'path is required' })
  }
  const mode = opts.direction === 'outbound'
    ? constants.W_OK
    : constants.R_OK
  try {
    await access(filePath, mode)
  }
  catch {
    // For outbound, parent directory may be enough if file does not exist yet
    if (opts.direction === 'outbound') {
      const { dirname } = await import('node:path')
      await access(dirname(filePath), constants.W_OK)
      return { message: `Writable path available for ${filePath}`, path: filePath }
    }
    throw createError({
      statusCode: 400,
      statusMessage: `Cannot read file path: ${filePath}`,
    })
  }
  return { message: `File path accessible: ${filePath}`, path: filePath }
}
