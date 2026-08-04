import { parseCsv } from '../helpers.js'

/**
 * @param {{ config: Record<string, unknown>, secrets?: Record<string, unknown>, mode?: string }} ctx
 * @returns {Promise<{ rows: Record<string, unknown>[], meta?: Record<string, unknown> }>}
 */
export async function runCsvFile(ctx) {
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
