export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const body = await readBody(event)
  const updated = updateGridItem(id, body || {})

  if (!updated) {
    throw createError({
      statusCode: 404,
      statusMessage: `Grid item ${id} not found`,
    })
  }

  return updated
})
