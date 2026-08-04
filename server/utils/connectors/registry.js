import { runJsonFile } from './runners/jsonFile.js'
import { runCsvFile } from './runners/csvFile.js'
import { runRestGeneric } from './runners/restGeneric.js'

/** @type {Record<string, (ctx: { config: Record<string, unknown>, secrets?: Record<string, unknown>, mode?: string }) => Promise<{ rows: Record<string, unknown>[], meta?: Record<string, unknown> }>>} */
const runners = {
  json_file: runJsonFile,
  csv_file: runCsvFile,
  rest_generic: runRestGeneric,
}

/**
 * @param {string} runnerKey
 */
export function getConnectorRunner(runnerKey) {
  const runner = runners[runnerKey]
  if (!runner) {
    throw createError({
      statusCode: 400,
      statusMessage: `No runner registered for key: ${runnerKey}`,
    })
  }
  return runner
}

export function listRegisteredRunnerKeys() {
  return Object.keys(runners)
}
