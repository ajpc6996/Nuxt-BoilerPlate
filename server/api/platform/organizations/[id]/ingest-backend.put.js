/**
 * Platform: update per-organization ingest backend.
 * Body: { ingestBackend: 'supabase'|'local', ingest_backend?: string }
 */
export default defineEventHandler(async (event) => {
  await requirePlatformAdmin(event)

  const organizationId = String(getRouterParam(event, 'id') || '')
  const body = await readBody(event)
  const ingestBackend = String(
    body?.ingestBackend || body?.ingest_backend || '',
  ).trim()

  if (!organizationId) {
    throw createError({ statusCode: 400, statusMessage: 'organization id is required' })
  }
  if (!['supabase', 'local'].includes(ingestBackend)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'ingestBackend must be "supabase" or "local"',
    })
  }

  const admin = useSupabaseAdmin()
  const { data, error } = await admin
    .from('organizations')
    .update({ ingest_backend: ingestBackend })
    .eq('id', organizationId)
    .select('id, name, slug, ingest_backend')
    .single()

  if (error || !data) {
    throw createError({
      statusCode: 500,
      statusMessage: error?.message || 'Failed to update ingest backend',
    })
  }

  return { item: data }
})

