import { toRowArray } from '../helpers.js'

/**
 * @param {{ config: Record<string, unknown>, secrets?: Record<string, unknown>, mode?: string }} ctx
 * @returns {Promise<{ rows: Record<string, unknown>[], meta?: Record<string, unknown> }>}
 */
export async function runJsonFile(ctx) {
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
