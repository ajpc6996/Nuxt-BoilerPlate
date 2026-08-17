import { isOutbound } from '~~/shared/runnerDirection.js'
import { toRowArray } from '../helpers.js'
import { deliverFileContent } from '../fileDelivery.js'

/**
 * JSON file — inbound read and outbound write.
 * @param {{ config: Record<string, unknown>, secrets?: Record<string, unknown>, mode?: string, direction?: string, rows?: Record<string, unknown>[] }} ctx
 */
export async function runJsonFile(ctx) {
  if (isOutbound(ctx)) return exportJsonFile(ctx)
  return importJsonFile(ctx)
}

/**
 * @param {import('./jsonFile.js').runJsonFile extends (ctx: infer C) => unknown ? C : never} ctx
 */
async function importJsonFile(ctx) {
  const config = ctx.config || {}
  const sourceMode = config.sourceMode || 'url'
  let payload

  if (sourceMode === 'inline') {
    const raw = String(config.inlineJson || '').trim()
    if (!raw) {
      throw createError({ statusCode: 400, statusMessage: 'inlineJson is required' })
    }
    try {
      payload = JSON.parse(raw)
    }
    catch {
      throw createError({ statusCode: 400, statusMessage: 'inlineJson is not valid JSON' })
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
    payload = await $fetch(url)
  }

  const rows = toRowArray(payload, String(config.itemsPath || ''))
  return {
    rows,
    meta: { count: rows.length, sourceMode },
  }
}

/**
 * @param {import('./jsonFile.js').runJsonFile extends (ctx: infer C) => unknown ? C : never} ctx
 */
async function exportJsonFile(ctx) {
  const config = ctx.config || {}
  const rows = Array.isArray(ctx.rows) ? ctx.rows : []
  const wrapKey = String(config.wrapKey || '').trim()
  const payload = wrapKey ? { [wrapKey]: rows } : rows
  const content = JSON.stringify(payload, null, 2)
  const delivery = await deliverFileContent(config, content, 'application/json')
  return {
    rows: [],
    rowsWritten: rows.length,
    meta: { ...delivery, format: 'json', rowCount: rows.length },
  }
}
