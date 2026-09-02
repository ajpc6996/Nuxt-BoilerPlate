export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const query = getQuery(event)
  const organizationId = String(query.organizationId || '')

  if (!id || !organizationId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'id and organizationId are required',
    })
  }

  await requireOrgAdmin(event, organizationId)
  const admin = useSupabaseAdmin()

  const { error } = await admin
    .from('connections')
    .delete()
    .eq('id', id)
    .eq('organization_id', organizationId)

  if (error) {
    throw createError({ statusCode: 400, statusMessage: error.message })
  }

  const { invalidateLocalOrgSync } = await import('~~/server/utils/ingestBackend.js')
  invalidateLocalOrgSync(organizationId)

  return { ok: true }
})
