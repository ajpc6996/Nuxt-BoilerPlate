import { probeLocalIngestBackend } from '~~/server/utils/ingestBackend.js'

/**
 * Platform: local ingest warehouse availability (INGEST_DATABASE_URL).
 */
export default defineEventHandler(async (event) => {
  await requirePlatformAdmin(event)
  const status = await probeLocalIngestBackend()
  return status
})
