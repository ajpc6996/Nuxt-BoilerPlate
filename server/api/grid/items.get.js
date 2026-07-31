export default defineEventHandler((event) => {
  const query = getQuery(event)
  const startRow = Math.max(0, Number(query.startRow ?? 0))
  const endRow = Math.max(startRow, Number(query.endRow ?? startRow + 50))

  const rows = gridItems.slice(startRow, endRow)

  return {
    rows,
    lastRow: gridItems.length,
  }
})
