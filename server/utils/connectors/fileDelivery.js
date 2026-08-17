import { writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

/**
 * @param {string} destUrl
 * @param {string} body
 * @param {Record<string, string>} [headers]
 */
export async function putToUrl(destUrl, body, headers = {}) {
  if (!/^https?:\/\//i.test(destUrl)) {
    throw createError({ statusCode: 400, statusMessage: 'destUrl must be http(s)' })
  }
  await $fetch(destUrl, {
    method: 'PUT',
    body,
    headers: {
      'Content-Type': headers['Content-Type'] || 'application/octet-stream',
      ...headers,
    },
  })
}

/**
 * @param {string} destPath
 * @param {string} body
 */
export async function writeLocalFile(destPath, body) {
  const path = String(destPath || '').trim()
  if (!path) {
    throw createError({ statusCode: 400, statusMessage: 'destPath is required' })
  }
  if (path.includes('..')) {
    throw createError({ statusCode: 400, statusMessage: 'destPath must not contain ..' })
  }
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, body, 'utf8')
  return path
}

/**
 * @param {Record<string, unknown>} config
 * @param {string} content
 * @param {string} contentType
 */
export async function deliverFileContent(config, content, contentType) {
  const destMode = String(config.destMode || 'inline').toLowerCase()
  if (destMode === 'inline') {
    return { destMode, preview: content.slice(0, 2000) }
  }
  if (destMode === 'putUrl') {
    const destUrl = String(config.destUrl || '').trim()
    if (!destUrl) {
      throw createError({ statusCode: 400, statusMessage: 'destUrl is required for putUrl mode' })
    }
    await putToUrl(destUrl, content, { 'Content-Type': contentType })
    return { destMode, destUrl }
  }
  if (destMode === 'localPath') {
    const destPath = String(config.destPath || '').trim()
    const written = await writeLocalFile(destPath, content)
    return { destMode, destPath: written }
  }
  throw createError({ statusCode: 400, statusMessage: `Unknown destMode: ${destMode}` })
}
