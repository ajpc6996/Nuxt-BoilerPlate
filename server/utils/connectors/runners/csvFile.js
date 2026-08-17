import { isOutbound } from '~~/shared/runnerDirection.js'
import { parseCsv, rowsToCsv } from '../helpers.js'
import { deliverFileContent } from '../fileDelivery.js'

/**
 * CSV file — inbound read and outbound write.
 * @param {{ config: Record<string, unknown>, secrets?: Record<string, unknown>, mode?: string, direction?: string, rows?: Record<string, unknown>[] }} ctx
 */
export async function runCsvFile(ctx) {
  if (isOutbound(ctx)) return exportCsvFile(ctx)
  return importCsvFile(ctx)
}

/**
 * @param {import('./csvFile.js').runCsvFile extends (ctx: infer C) => unknown ? C : never} ctx
 */
async function importCsvFile(ctx) {
  const config = ctx.config || {}
  const sourceMode = config.sourceMode || 'url'
  const delimiter = String(config.delimiter || ',')
  let text = ''

  if (sourceMode === 'inline') {
    text = String(config.inlineCsv || '')
    if (!text.trim()) {
      throw createError({ statusCode: 400, statusMessage: 'inlineCsv is required' })
    }
  }
  else {
    const url = String(config.sourceUrl || '').trim()
    if (!url) {
      throw createError({ statusCode: 400, statusMessage: 'sourceUrl is required' })
    }
    if (!/^https?:\/\//i.test(url)) {
      throw createError({ statusCode: 400, statusMessage: 'sourceUrl must be http(s)' })
    }
    text = await $fetch(url, { responseType: 'text' })
  }

  const rows = parseCsv(text, delimiter)
  return {
    rows,
    meta: { count: rows.length, sourceMode },
  }
}

/**
 * @param {import('./csvFile.js').runCsvFile extends (ctx: infer C) => unknown ? C : never} ctx
 */
async function exportCsvFile(ctx) {
  const config = ctx.config || {}
  const rows = Array.isArray(ctx.rows) ? ctx.rows : []
  const delimiter = String(config.delimiter || ',')
  const content = rowsToCsv(rows, delimiter)
  const delivery = await deliverFileContent(config, content, 'text/csv')
  return {
    rows: [],
    rowsWritten: rows.length,
    meta: { ...delivery, format: 'csv', rowCount: rows.length },
  }
}
