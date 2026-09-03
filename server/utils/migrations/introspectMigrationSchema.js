import { decryptSecrets } from '~~/server/utils/connectorCrypto.js'
import { cleanEntityKey, resolveRunnerTableConfig } from '~~/shared/migration.js'

/**
 * Introspect source/destination table columns for migration plan schemas.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {{
 *   organizationId: string,
 *   sourceConnectionId?: string,
 *   destinationConnectionId?: string,
 *   entities?: Array<{ key?: string, sourceEntity?: string, destinationEntity?: string }>,
 * }} opts
 */
export async function introspectMigrationSchemas(admin, opts) {
  const organizationId = String(opts.organizationId || '').trim()
  const entities = Array.isArray(opts.entities) ? opts.entities : []

  const source = opts.sourceConnectionId
    ? await introspectConnectionSide(admin, {
      organizationId,
      connectionId: String(opts.sourceConnectionId),
      entities,
      side: 'source',
    })
    : { connectorId: '', dialect: '', entities: {}, introspectedAt: null }

  const destination = opts.destinationConnectionId
    ? await introspectConnectionSide(admin, {
      organizationId,
      connectionId: String(opts.destinationConnectionId),
      entities,
      side: 'destination',
    })
    : { connectorId: '', dialect: '', entities: {}, introspectedAt: null }

  return {
    source,
    destination,
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {{
 *   organizationId: string,
 *   connectionId: string,
 *   entities: Array<Record<string, unknown>>,
 *   side: 'source' | 'destination',
 * }} opts
 */
async function introspectConnectionSide(admin, opts) {
  const { data: connection, error } = await admin
    .from('connections')
    .select('id, config, connector_types(runner_key)')
    .eq('id', opts.connectionId)
    .eq('organization_id', opts.organizationId)
    .maybeSingle()

  if (error || !connection) {
    throw createError({ statusCode: 404, statusMessage: 'Connection not found for schema introspection' })
  }

  const runnerKey = String(connection.connector_types?.runner_key || '').toLowerCase()
  const { data: secretRow } = await admin
    .from('connection_secrets')
    .select('ciphertext')
    .eq('connection_id', connection.id)
    .maybeSingle()

  const secrets = secretRow?.ciphertext ? decryptSecrets(secretRow.ciphertext) : {}
  const config = connection.config && typeof connection.config === 'object' ? connection.config : {}

  /** @type {Record<string, { table: string, columns: Record<string, unknown> }>} */
  const entitySchemas = {}

  for (const ent of opts.entities) {
    const entityKey = cleanEntityKey(ent?.key)
    if (!entityKey) continue
    const tableRef = opts.side === 'source'
      ? String(ent?.sourceEntity || ent?.key || '').trim()
      : String(ent?.destinationEntity || ent?.key || '').trim()
    if (!tableRef || /^select\s/i.test(tableRef)) continue

    const resolved = resolveRunnerTableConfig(tableRef, entityKey)
    const table = String(resolved.table || tableRef.split('.').pop() || tableRef).trim()
    try {
      const columns = await listTableColumns(runnerKey, config, secrets, table)
      entitySchemas[entityKey] = { table: resolved.table || tableRef, columns }
    }
    catch (err) {
      entitySchemas[entityKey] = {
        table: tableRef,
        columns: {},
        error: err?.message || 'Introspection failed',
      }
    }
  }

  return {
    connectorId: connection.id,
    dialect: runnerKey === 'mysql' ? 'mysql' : (runnerKey === 'postgres' ? 'postgres' : runnerKey),
    entities: entitySchemas,
    introspectedAt: new Date().toISOString(),
  }
}

/**
 * @param {string} runnerKey
 * @param {Record<string, unknown>} config
 * @param {Record<string, unknown>} secrets
 * @param {string} table
 */
async function listTableColumns(runnerKey, config, secrets, table) {
  const safeTable = String(table || '').replace(/[^a-zA-Z0-9_]/g, '')
  if (!safeTable) return {}

  if (runnerKey === 'postgres') {
    let pg
    try {
      pg = await import('pg')
    }
    catch {
      throw createError({ statusCode: 503, statusMessage: 'PostgreSQL driver not installed' })
    }
    const client = new pg.Client({
      host: String(config.host || '127.0.0.1').trim(),
      port: Number(config.port) || 5432,
      database: String(config.database || '').trim(),
      user: String(secrets.username || config.username || '').trim(),
      password: secrets.password != null ? String(secrets.password) : '',
      ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
    })
    await client.connect()
    try {
      const schema = String(config.schema || 'public').trim() || 'public'
      const result = await client.query(
        `SELECT column_name, data_type, is_nullable
         FROM information_schema.columns
         WHERE table_schema = $1 AND LOWER(table_name) = LOWER($2)
         ORDER BY ordinal_position`,
        [schema, safeTable],
      )
      return columnsFromRows(result.rows || [], 'postgres')
    }
    finally {
      await client.end()
    }
  }

  if (runnerKey === 'mysql') {
    let mysql
    try {
      mysql = await import('mysql2/promise')
    }
    catch {
      throw createError({ statusCode: 503, statusMessage: 'MySQL driver not installed' })
    }
    const connection = await mysql.createConnection({
      host: String(config.host || '127.0.0.1').trim(),
      port: Number(config.port) || 3306,
      database: String(config.database || '').trim(),
      user: String(secrets.username || config.username || '').trim(),
      password: secrets.password != null ? String(secrets.password) : '',
      ssl: config.ssl ? {} : undefined,
    })
    try {
      const db = String(config.database || '').trim()
      const [rows] = await connection.query(
        `SELECT COLUMN_NAME AS column_name, DATA_TYPE AS data_type, IS_NULLABLE AS is_nullable
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND LOWER(TABLE_NAME) = LOWER(?)
         ORDER BY ORDINAL_POSITION`,
        [db, safeTable],
      )
      return columnsFromRows(rows || [], 'mysql')
    }
    finally {
      await connection.end()
    }
  }

  throw createError({
    statusCode: 400,
    statusMessage: `Schema introspection not supported for runner “${runnerKey || 'unknown'}”`,
  })
}

/**
 * @param {Array<Record<string, unknown>>} rows
 * @param {'postgres'|'mysql'} dialect
 */
function columnsFromRows(rows, dialect) {
  /** @type {Record<string, unknown>} */
  const columns = {}
  for (const row of rows) {
    const name = String(row.column_name || row.COLUMN_NAME || '').trim()
    if (!name) continue
    const dataType = String(row.data_type || row.DATA_TYPE || '').toLowerCase()
    const nullable = String(row.is_nullable || row.IS_NULLABLE || 'YES').toUpperCase() === 'YES'
    columns[name] = {
      type: mapSqlType(dataType, dialect),
      nullable,
      pk: name.toLowerCase() === 'id',
    }
  }
  return columns
}

/**
 * @param {string} sqlType
 * @param {'postgres'|'mysql'} dialect
 */
function mapSqlType(sqlType, dialect) {
  const t = String(sqlType || '').toLowerCase()
  if (t.includes('bool')) return 'boolean'
  if (t.includes('int') || t === 'serial' || t === 'bigint' || t === 'smallint') return 'integer'
  if (t.includes('numeric') || t.includes('decimal') || t.includes('double') || t.includes('float') || t.includes('real')) {
    return 'number'
  }
  if (t.includes('timestamp') || t === 'datetime' || t.includes('date')) return 'timestamp'
  if (t.includes('json')) return 'json'
  return 'string'
}
