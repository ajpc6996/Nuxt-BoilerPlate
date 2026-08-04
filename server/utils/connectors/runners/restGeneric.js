import { getByPath, toRowArray } from '../helpers.js'

/**
 * Generic REST JSON fetcher with optional next-url / page-param paging.
 * @param {{ config: Record<string, unknown>, secrets?: Record<string, unknown>, mode?: string }} ctx
 */
export async function runRestGeneric(ctx) {
  const config = ctx.config || {}
  const secrets = ctx.secrets || {}
  const baseUrl = String(config.baseUrl || '').replace(/\/$/, '')
  const path = String(config.path || '/')
  const method = String(config.method || 'GET').toUpperCase()
  const maxPages = Math.min(Number(config.maxPages) || 5, ctx.mode === 'test' ? 1 : 50)
  const pagingMode = config.pagingMode || 'none'

  if (!baseUrl) {
    throw createError({ statusCode: 400, statusMessage: 'baseUrl is required' })
  }
  if (!/^https?:\/\//i.test(baseUrl)) {
    throw createError({ statusCode: 400, statusMessage: 'baseUrl must be http(s)' })
  }

  const headers = {}
  const apiKey = secrets.apiKey
  if (apiKey) {
    const headerName = String(config.authHeader || 'Authorization')
    const prefix = String(config.authPrefix || 'Bearer').trim()
    headers[headerName] = prefix ? `${prefix} ${apiKey}` : String(apiKey)
  }

  /** @type {Record<string, unknown>[]} */
  const allRows = []
  let nextUrl = joinUrl(baseUrl, path)
  let page = 1
  let pagesFetched = 0

  while (nextUrl && pagesFetched < maxPages) {
    const url = pagingMode === 'page_param'
      ? withQuery(nextUrl, { [String(config.pageParam || 'page')]: String(page) })
      : nextUrl

    const payload = await $fetch(url, {
      method,
      headers,
    })

    const rows = toRowArray(payload, String(config.itemsPath || ''))
    allRows.push(...rows)
    pagesFetched += 1

    if (pagingMode === 'none' || ctx.mode === 'test') {
      break
    }

    if (pagingMode === 'next_url') {
      const next = getByPath(payload, String(config.nextUrlPath || 'next'))
      nextUrl = typeof next === 'string' && next ? next : null
    }
    else if (pagingMode === 'page_param') {
      if (!rows.length) break
      page += 1
      nextUrl = joinUrl(baseUrl, path)
    }
    else {
      break
    }
  }

  return {
    rows: allRows,
    meta: { count: allRows.length, pagesFetched, pagingMode },
  }
}

/**
 * @param {string} base
 * @param {string} path
 */
function joinUrl(base, path) {
  if (/^https?:\/\//i.test(path)) return path
  const p = path.startsWith('/') ? path : `/${path}`
  return `${base}${p}`
}

/**
 * @param {string} url
 * @param {Record<string, string>} query
 */
function withQuery(url, query) {
  const u = new URL(url)
  Object.entries(query).forEach(([k, v]) => u.searchParams.set(k, v))
  return u.toString()
}
