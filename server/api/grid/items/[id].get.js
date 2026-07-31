export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')
  const item = findGridItem(id)

  if (!item) {
    throw createError({
      statusCode: 404,
      statusMessage: `Grid item ${id} not found`,
    })
  }

  return { ...item }
})
