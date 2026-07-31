/**
 * Update a row already loaded in an AG Grid instance.
 * Works for client-side data and currently loaded infinite-model rows.
 *
 * @param {import('ag-grid-community').GridApi | null | undefined} api
 * @param {object} row
 * @returns {boolean}
 */
export function applyGridRowUpdate(api, row) {
  if (!api || !row || row.id == null) return false

  let updated = false

  api.forEachNode((node) => {
    if (node?.data?.id === row.id) {
      node.setData({ ...row })
      updated = true
    }
  })

  if (!updated) {
    const result = api.applyTransaction?.({ update: [row] })
    updated = Boolean(result?.update?.length)
  }

  return updated
}
