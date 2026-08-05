import { getByPath, toRowArray } from '../helpers.js'
import {
  applyPathTemplate,
  extractPathVariables,
  fetchLookupTuples,
} from '../lookup.js'

/**
 * Generic REST JSON fetcher with optional next-url / page-param paging
 * and optional ingest-table URL expansion.
 *
 * @param {{
 *   config: Record<string, unknown>,
 *   secrets?: Record<string, unknown>,
 *   mode?: string,
 *   organizationId?: string,
 * }} ctx
 */
export async function runRestGeneric(ctx) {
  const config = ctx.config || {}
  const secrets = ctx.secrets || {}
  const baseUrl = String(config.baseUrl || '').replace(/\/$/, '')
  const pathTemplate = String(config.path || '/')
  const method = String(config.method || 'GET').toUpperCase()
  const maxPages = Math.min(Number(config.maxPages) || 5, ctx.mode === 'test' ? 1 : 50)
  const pagingMode = config.pagingMode || 'none'
  const lookupEnabled = Boolean(config.lookupEnabled)

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

  const pathVars = extractPathVariables(pathTemplate)
  /** @type {Record<string, string>[]} */
  let expansions = [{}]

  if (lookupEnabled) {
    if (!ctx.organizationId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'organizationId is required for lookup expansion',
      })
    }
    if (pathVars.length === 0) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Path has no {variables} but lookup expansion is enabled',
      })
    }

    const bindings = normalizeBindings(config.lookupBindings, pathVars)
    if (!String(config.lookupTable || '').trim()) {
      throw createError({
        statusCode: 400,
        statusMessage: 'lookupTable is required when lookup expansion is enabled',
      })
    }
    const maxExpansions = Math.min(
      Number(config.maxExpansions) || 100,
      ctx.mode === 'test' ? 3 : 500,
    )

    const admin = useSupabaseAdmin()
    expansions = await fetchLookupTuples(admin, {
      table: String(config.lookupTable || ''),
      bindings,
      organizationId: ctx.organizationId,
      limit: maxExpansions,
    })

    if (!expansions.length) {
      throw createError({
        statusCode: 400,
        statusMessage: `No distinct lookup values found in ingest.${config.lookupTable}`,
      })
    }
  }
  else if (pathVars.length > 0) {
    throw createError({
      statusCode: 400,
      statusMessage: `Path contains {${pathVars.join(', ')}} but lookup expansion is disabled`,
    })
  }

  /** @type {Record<string, unknown>[]} */
  const allRows = []
  let totalPagesFetched = 0

  for (const values of expansions) {
    const path = lookupEnabled ? applyPathTemplate(pathTemplate, values) : pathTemplate
    const { rows, pagesFetched } = await fetchPaged({
      baseUrl,
      path,
      method,
      headers,
      pagingMode,
      maxPages,
      pageParam: String(config.pageParam || 'page'),
      nextUrlPath: String(config.nextUrlPath || 'next'),
      itemsPath: String(config.itemsPath || ''),
      mode: ctx.mode,
    })

    totalPagesFetched += pagesFetched

    const tagged = rows.map((row) => {
      if (!lookupEnabled || !Object.keys(values).length) return row
      if (row && typeof row === 'object' && !Array.isArray(row)) {
        return {
          ...row,
          _lookup: values,
        }
      }
      return { value: row, _lookup: values }
    })
    allRows.push(...tagged)
  }

  return {
    rows: allRows,
    meta: {
      count: allRows.length,
      pagesFetched: totalPagesFetched,
      pagingMode,
      expansions: expansions.length,
      lookupEnabled,
      lookupTable: lookupEnabled ? config.lookupTable : null,
    },
  }
}

/**
 * @param {Record<string, unknown>} configBindings
 * @param {string[]} pathVars
 */
function normalizeBindings(configBindings, pathVars) {
  const list = Array.isArray(configBindings) ? configBindings : []
  /** @type {Array<{ variable: string, column: string }>} */
  const bindings = []

  for (const variable of pathVars) {
    const found = list.find((b) => b && b.variable === variable)
    const column = found?.column
    if (!column) {
      throw createError({
        statusCode: 400,
        statusMessage: `Map path variable {${variable}} to an ingest column`,
      })
    }
    bindings.push({ variable, column: String(column) })
  }

  return bindings
}

/**
 * @param {object} opts
 */
async function fetchPaged(opts) {
  /** @type {Record<string, unknown>[]} */
  const allRows = []
  let nextUrl = joinUrl(opts.baseUrl, opts.path)
  let page = 1
  let pagesFetched = 0

  while (nextUrl && pagesFetched < opts.maxPages) {
    const url = opts.pagingMode === 'page_param'
      ? withQuery(nextUrl, { [opts.pageParam]: String(page) })
      : nextUrl

    let payload
    try {
      payload = await $fetch(url, {
        method: opts.method,
        headers: opts.headers,
      })
    }
    catch (err) {
      const statusCode = Number(err?.statusCode || err?.response?.status) || 502
      const responseData = err?.data
        || err?.response?._data
        || err?.response?.data
        || null

      const responsePreview = safeJsonPreview(responseData, 2500)
      const headersRedacted = redactHeaders(opts.headers)

      const msg = [
        `REST fetch failed (HTTP ${statusCode})`,
        `${opts.method} ${url}`,
        `Headers: ${JSON.stringify(headersRedacted)}`,
        `Response: ${responsePreview || '(empty)'}`,
      ].join('\n')

      console.error('[rest_generic] fetch error', {
        url,
        method: opts.method,
        statusCode,
        headersRedacted,
        responsePreview,
      })

      throw createError({
        statusCode,
        statusMessage: msg,
      })
    }

    let rows
    try {
      rows = toRowArray(payload, opts.itemsPath)
    }
    catch (err) {
      const parsePreview = safeJsonPreview(payload, 3000)
      console.error('[rest_generic] toRowArray parse error', {
        url,
        method: opts.method,
        itemsPath: opts.itemsPath,
        parseError: err?.statusMessage || err?.message,
        responsePreview: parsePreview,
      })

      throw createError({
        statusCode: Number(err?.statusCode) || 400,
        statusMessage: [
          'Response could not be parsed for ingestion',
          `itemsPath="${opts.itemsPath || ''}"`,
          `Error=${err?.statusMessage || err?.message || 'parse error'}`,
          `ResponsePreview=${parsePreview || '(empty)'}`,
        ].join('\n'),
      })
    }
    allRows.push(...rows)
    pagesFetched += 1

    if (opts.pagingMode === 'none' || opts.mode === 'test') {
      break
    }

    if (opts.pagingMode === 'next_url') {
      const next = getByPath(payload, opts.nextUrlPath)
      nextUrl = typeof next === 'string' && next ? next : null
    }
    else if (opts.pagingMode === 'page_param') {
      if (!rows.length) break
      page += 1
      nextUrl = joinUrl(opts.baseUrl, opts.path)
    }
    else {
      break
    }
  }

  return { rows: allRows, pagesFetched }
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

/**
 * @param {unknown} value
 * @param {number} maxChars
 */
function safeJsonPreview(value, maxChars = 2000) {
  try {
    const text = typeof value === 'string'
      ? value
      : JSON.stringify(value, null, 2)
    if (!text) return ''
    return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text
  }
  catch {
    return String(value || '').slice(0, maxChars)
  }
}

/**
 * @param {Record<string, string>} headers
 */
function redactHeaders(headers) {
  const out = {}
  if (!headers || typeof headers !== 'object') return out
  Object.entries(headers).forEach(([k, v]) => {
    const key = String(k).toLowerCase()
    const val = typeof v === 'string' ? v : String(v ?? '')
    if (key.includes('authorization') || key.includes('api-key') || key.includes('token')) {
      out[k] = val ? `***${val.slice(-4)}` : '(empty)'
    }
    else {
      out[k] = val ? String(val).slice(0, 100) : '(empty)'
    }
  })
  return out
}
