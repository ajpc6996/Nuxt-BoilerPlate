/**
 * Propose a connector type via configured LLM (Gemini or OpenAI-compatible).
 * @param {{
 *   description: string,
 *   docsUrl?: string,
 *   sampleCurl?: string,
 * }} input
 */
export async function proposeConnectorType(input) {
  const description = String(input.description || '').trim()
  if (description.length < 20) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Provide a richer description of the API or data source (at least ~20 characters)',
    })
  }

  const system = buildSystemPrompt()
  const userParts = [`Description:\n${description}`]
  if (input.docsUrl) userParts.push(`Docs URL:\n${String(input.docsUrl).trim()}`)
  if (input.sampleCurl) userParts.push(`Sample request:\n${String(input.sampleCurl).trim()}`)
  const userText = userParts.join('\n\n')

  const provider = resolveLlmProvider()
  const modelInfo = describeProviderModel(provider)

  console.info('[llm] proposeConnectorType start', {
    provider,
    model: modelInfo.model,
    baseUrl: modelInfo.baseUrl,
    userChars: userText.length,
    systemChars: system.length,
  })

  let content = ''

  try {
    if (provider === 'gemini') {
      content = await callGemini({ system, userText })
    }
    else {
      content = await callOpenAi({ system, userText })
    }
  }
  catch (err) {
    if (err?.statusCode && err?.statusMessage && !err?.__llmRaw) {
      throw err
    }
    const detail = formatLlmError(err, provider, modelInfo.model)
    console.error('[llm] proposeConnectorType failed', detail)
    throw createError({
      statusCode: detail.httpStatus || 502,
      statusMessage: detail.message,
    })
  }

  if (!content || typeof content !== 'string') {
    console.error('[llm] empty content', { provider, model: modelInfo.model, content })
    throw createError({ statusCode: 502, statusMessage: 'LLM returned empty content' })
  }

  console.info('[llm] proposeConnectorType raw content', {
    provider,
    model: modelInfo.model,
    chars: content.length,
    preview: content.slice(0, 500),
  })

  let proposed
  try {
    proposed = JSON.parse(stripCodeFences(content))
  }
  catch (parseErr) {
    console.error('[llm] JSON parse failed', {
      provider,
      model: modelInfo.model,
      error: parseErr?.message,
      contentPreview: content.slice(0, 2000),
    })
    throw createError({
      statusCode: 502,
      statusMessage: `LLM returned invalid JSON: ${parseErr?.message || 'parse error'}`,
    })
  }

  console.info('[llm] proposeConnectorType ok', {
    provider,
    model: modelInfo.model,
    key: proposed?.key,
    name: proposed?.name,
  })

  return normalizeProposedType(proposed)
}

/**
 * Prefer LLM_PROVIDER; otherwise gemini if key present, else openai.
 */
function resolveLlmProvider() {
  const config = useRuntimeConfig()
  const explicit = String(
    config.llmProvider || process.env.LLM_PROVIDER || '',
  ).trim().toLowerCase()

  if (explicit === 'gemini' || explicit === 'google') return 'gemini'
  if (explicit === 'openai') return 'openai'

  const geminiKey = config.geminiApiKey || process.env.GEMINI_API_KEY || ''
  if (geminiKey) return 'gemini'

  const openaiKey = config.openaiApiKey || process.env.OPENAI_API_KEY || ''
  if (openaiKey) return 'openai'

  throw createError({
    statusCode: 503,
    statusMessage: 'No LLM API key configured. Set GEMINI_API_KEY (or OPENAI_API_KEY) in .env and restart the server.',
  })
}

/**
 * @param {string} provider
 */
function describeProviderModel(provider) {
  const config = useRuntimeConfig()
  if (provider === 'gemini') {
    return {
      model: config.geminiModel || process.env.GEMINI_MODEL || 'gemini-2.0-flash',
      baseUrl: (
        config.geminiBaseUrl
        || process.env.GEMINI_BASE_URL
        || 'https://generativelanguage.googleapis.com/v1beta'
      ).replace(/\/$/, ''),
    }
  }
  return {
    model: config.openaiModel || process.env.OPENAI_MODEL || 'gpt-4o-mini',
    baseUrl: (config.openaiBaseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1')
      .replace(/\/$/, ''),
  }
}

/**
 * @param {{ system: string, userText: string }} opts
 */
async function callGemini(opts) {
  const config = useRuntimeConfig()
  const apiKey = config.geminiApiKey || process.env.GEMINI_API_KEY || ''
  const { model, baseUrl } = describeProviderModel('gemini')

  if (!apiKey) {
    throw createError({
      statusCode: 503,
      statusMessage: 'GEMINI_API_KEY is not configured on the server',
    })
  }

  const url = `${baseUrl}/models/${encodeURIComponent(model)}:generateContent`
  const body = {
    systemInstruction: {
      parts: [{ text: opts.system }],
    },
    contents: [
      {
        role: 'user',
        parts: [{ text: opts.userText }],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json',
    },
  }

  console.info('[llm:gemini] request', {
    provider: 'gemini',
    model,
    url,
    hasApiKey: Boolean(apiKey),
    apiKeySuffix: maskSecret(apiKey),
    bodySummary: {
      systemChars: opts.system.length,
      userChars: opts.userText.length,
      temperature: body.generationConfig.temperature,
      responseMimeType: body.generationConfig.responseMimeType,
    },
  })

  let payload
  try {
    payload = await $fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body,
    })
  }
  catch (err) {
    err.__llmRaw = true
    console.error('[llm:gemini] HTTP error', formatLlmError(err, 'gemini', model))
    const detail = formatLlmError(err, 'gemini', model)
    throw createError({
      statusCode: detail.httpStatus || 502,
      statusMessage: detail.message,
    })
  }

  console.info('[llm:gemini] response', {
    provider: 'gemini',
    model,
    finishReason: payload?.candidates?.[0]?.finishReason,
    blockReason: payload?.promptFeedback?.blockReason,
    candidateCount: Array.isArray(payload?.candidates) ? payload.candidates.length : 0,
    usage: payload?.usageMetadata || null,
    responsePreview: safeJsonPreview(payload, 2500),
  })

  const parts = payload?.candidates?.[0]?.content?.parts
  if (!Array.isArray(parts) || !parts.length) {
    console.error('[llm:gemini] no content parts', {
      provider: 'gemini',
      model,
      fullResponse: safeJsonPreview(payload, 4000),
    })
    const block = payload?.promptFeedback?.blockReason
      || payload?.candidates?.[0]?.finishReason
    throw createError({
      statusCode: 502,
      statusMessage: block
        ? `Gemini (${model}) returned no content (${block})`
        : `Gemini (${model}) returned no content`,
    })
  }

  return parts.map((p) => p?.text || '').join('')
}

/**
 * @param {{ system: string, userText: string }} opts
 */
async function callOpenAi(opts) {
  const config = useRuntimeConfig()
  const apiKey = config.openaiApiKey || process.env.OPENAI_API_KEY || ''
  const { model, baseUrl } = describeProviderModel('openai')

  if (!apiKey) {
    throw createError({
      statusCode: 503,
      statusMessage: 'OPENAI_API_KEY is not configured on the server',
    })
  }

  const url = `${baseUrl}/chat/completions`
  const body = {
    model,
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: opts.system },
      { role: 'user', content: opts.userText },
    ],
  }

  console.info('[llm:openai] request', {
    provider: 'openai',
    model,
    url,
    hasApiKey: Boolean(apiKey),
    apiKeySuffix: maskSecret(apiKey),
    bodySummary: {
      systemChars: opts.system.length,
      userChars: opts.userText.length,
      temperature: body.temperature,
      response_format: body.response_format,
    },
  })

  let payload
  try {
    payload = await $fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body,
    })
  }
  catch (err) {
    err.__llmRaw = true
    console.error('[llm:openai] HTTP error', formatLlmError(err, 'openai', model))
    const detail = formatLlmError(err, 'openai', model)
    throw createError({
      statusCode: detail.httpStatus || 502,
      statusMessage: detail.message,
    })
  }

  console.info('[llm:openai] response', {
    provider: 'openai',
    model,
    finishReason: payload?.choices?.[0]?.finish_reason,
    usage: payload?.usage || null,
    responsePreview: safeJsonPreview(payload, 2500),
  })

  return payload?.choices?.[0]?.message?.content || ''
}

/**
 * Build a detailed, redacted error object for logs + user-facing message.
 * @param {unknown} err
 * @param {string} provider
 * @param {string} model
 */
function formatLlmError(err, provider, model) {
  const e = /** @type {Record<string, unknown>} */ (err || {})
  const status = Number(e.statusCode || e.status || e.response?.status) || null
  const data = e.data ?? e.response?._data ?? e.response?.data ?? null

  const apiMessage
    = data?.error?.message
      || data?.error?.status
      || data?.message
      || (typeof data?.error === 'string' ? data.error : null)
      || e.statusMessage
      || e.message
      || 'LLM request failed'

  const apiCode = data?.error?.code || data?.error?.status || data?.code || null
  const apiStatus = data?.error?.status || null
  const apiDetails = data?.error?.details || data?.details || null

  const message = [
    `${provider} (${model})`,
    status ? `HTTP ${status}` : null,
    apiCode ? `code=${apiCode}` : null,
    String(apiMessage),
  ].filter(Boolean).join(' — ')

  return {
    provider,
    model,
    httpStatus: status && status >= 400 && status < 600 ? status : 502,
    message,
    apiMessage: String(apiMessage),
    apiCode,
    apiStatus,
    apiDetails,
    responseData: safeJsonPreview(data, 4000),
    rawMessage: e.message ? String(e.message) : null,
  }
}

/**
 * @param {unknown} value
 * @param {number} max
 */
function safeJsonPreview(value, max = 2000) {
  try {
    const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
    if (!text) return null
    return text.length > max ? `${text.slice(0, max)}…` : text
  }
  catch {
    return String(value).slice(0, max)
  }
}

/**
 * @param {string} secret
 */
function maskSecret(secret) {
  const s = String(secret || '')
  if (s.length < 8) return s ? '***' : '(empty)'
  return `…${s.slice(-4)} (len=${s.length})`
}

function buildSystemPrompt() {
  return `You design connector type blueprints for a multi-tenant ingest platform.
Return ONLY valid JSON (no markdown) matching this shape:
{
  "key": "snake_case_unique_key",
  "name": "Human name",
  "description": "One paragraph",
  "category": "api" | "file" | "rest",
  "auth_mode": "none" | "api_key" | "basic" | "oauth2" | "bearer",
  "runner_key": "rest_generic" | "json_file" | "csv_file",
  "connection_schema": { JSON Schema object for SHARED connection fields like baseUrl, authHeader, authPrefix, tokenUrl },
  "config_schema": { JSON Schema object for PER-ENDPOINT data source fields like path, method, itemsPath, pagingMode, pageParam, nextUrlPath, maxPages, sourceMode, sourceUrl },
  "credential_schema": { JSON Schema object for secrets: apiKey, username, password, clientSecret, refreshToken, accessToken },
  "capabilities": {
    "paging": boolean,
    "tokenRenewal": boolean,
    "lookupExpansion": boolean,
    "notes": "short notes for admins"
  },
  "generation_notes": "Why you chose these fields; token refresh / paging assumptions"
}

Rules:
- Prefer runner_key "rest_generic" for HTTP JSON APIs.
- Put reusable auth/base URL fields in connection_schema; put path/paging/lookup in config_schema.
- credential_schema properties are secrets only (never put secrets in connection_schema).
- Use JSON Schema draft-ish: type/object, properties, required, title, description, enum, default.
- If token refresh is needed, set capabilities.tokenRenewal true and include refresh-related credential fields.
- If paging is needed, set capabilities.paging true and include pagingMode etc. in config_schema.
- key must be lowercase snake_case, start with a letter, max 48 chars.`
}

/**
 * @param {string} text
 */
function stripCodeFences(text) {
  const trimmed = String(text).trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return fenced ? fenced[1].trim() : trimmed
}

/**
 * @param {Record<string, unknown>} raw
 */
export function normalizeProposedType(raw) {
  const allowedRunners = new Set(['rest_generic', 'json_file', 'csv_file'])
  const allowedAuth = new Set(['none', 'api_key', 'basic', 'oauth2', 'bearer'])
  const allowedCat = new Set(['api', 'file', 'rest'])

  let key = String(raw.key || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48)
  if (!/^[a-z][a-z0-9_]{0,47}$/.test(key)) {
    key = `api_${Date.now().toString(36)}`
  }

  const runner_key = allowedRunners.has(raw.runner_key) ? raw.runner_key : 'rest_generic'
  const auth_mode = allowedAuth.has(raw.auth_mode) ? raw.auth_mode : 'api_key'
  const category = allowedCat.has(raw.category) ? raw.category : 'rest'

  return {
    key,
    name: String(raw.name || key).trim().slice(0, 120) || key,
    description: String(raw.description || '').trim().slice(0, 2000),
    category,
    auth_mode,
    runner_key,
    connection_schema: asSchema(raw.connection_schema),
    config_schema: asSchema(raw.config_schema),
    credential_schema: asSchema(raw.credential_schema),
    capabilities: {
      paging: Boolean(raw.capabilities?.paging),
      tokenRenewal: Boolean(raw.capabilities?.tokenRenewal),
      lookupExpansion: Boolean(raw.capabilities?.lookupExpansion ?? (runner_key === 'rest_generic')),
      notes: String(raw.capabilities?.notes || '').slice(0, 1000),
    },
    generation_notes: String(raw.generation_notes || '').trim().slice(0, 4000),
  }
}

/**
 * @param {unknown} value
 */
function asSchema(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return {
      type: 'object',
      properties: value.properties && typeof value.properties === 'object'
        ? value.properties
        : {},
      required: Array.isArray(value.required) ? value.required : [],
      ...(value.title ? { title: value.title } : {}),
    }
  }
  return { type: 'object', properties: {}, required: [] }
}
