export default defineEventHandler(async (event) => {
  await requirePlatformAdmin(event)

  const admin = useSupabaseAdmin()
  const { data, error } = await admin
    .from('connector_types')
    .select('*')
    .order('name')

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { items: data || [] }
})
