import { runJsonFile } from './runners/jsonFile.js'
import { runCsvFile } from './runners/csvFile.js'
import { runRestGeneric } from './runners/restGeneric.js'
import { runMysql } from './runners/mysql.js'
import { runPostgres } from './runners/postgres.js'
import { runMssql } from './runners/mssql.js'
import { runMongodb } from './runners/mongodb.js'
import { runElasticsearch } from './runners/elasticsearch.js'
import { runOracle } from './runners/oracle.js'
import { runS3 } from './runners/s3.js'
import { runSftp } from './runners/sftp.js'
import {
  isRunnerOperational,
  loadEnabledRunnersMap,
} from './capabilities.js'

/** @type {Record<string, (ctx: unknown) => Promise<{ rows?: Record<string, unknown>[], rowsWritten?: number, meta?: Record<string, unknown> }>>} */
const builtInRunners = {
  json_file: runJsonFile,
  csv_file: runCsvFile,
  rest_generic: runRestGeneric,
}

/** @type {Record<string, (ctx: unknown) => Promise<{ rows?: Record<string, unknown>[], rowsWritten?: number, meta?: Record<string, unknown> }>>} */
const optionalRunners = {
  mysql: runMysql,
  postgres: runPostgres,
  mssql: runMssql,
  mongodb: runMongodb,
  elasticsearch: runElasticsearch,
  oracle: runOracle,
  s3: runS3,
  sftp: runSftp,
}

/**
 * @param {string} runnerKey
 * @param {import('@supabase/supabase-js').SupabaseClient} [admin]
 */
export async function getConnectorRunner(runnerKey, admin) {
  const key = String(runnerKey || '').trim()
  if (builtInRunners[key]) {
    return builtInRunners[key]
  }

  const enabledMap = await loadEnabledRunnersMap(admin)
  const operational = await isRunnerOperational(key, enabledMap)
  if (!operational || !optionalRunners[key]) {
    throw createError({
      statusCode: 400,
      statusMessage: `Connector runner "${key}" is not available. Install and enable it under Administration → Connector drivers.`,
    })
  }

  return optionalRunners[key]
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} [admin]
 */
export async function listRegisteredRunnerKeys(admin) {
  const enabledMap = await loadEnabledRunnersMap(admin)
  const keys = Object.keys(builtInRunners)
  for (const key of Object.keys(optionalRunners)) {
    if (await isRunnerOperational(key, enabledMap)) {
      keys.push(key)
    }
  }
  return keys
}

export function listBuiltInRunnerKeys() {
  return Object.keys(builtInRunners)
}
