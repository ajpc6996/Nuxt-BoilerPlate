/**
 * Layered left-to-right layout by graph depth from Retrieve / Fetch roots.
 *
 * @param {Array<{ id: string, type?: string, position?: { x: number, y: number } }>} nodes
 * @param {Array<{ source: string, target: string }>} edges
 * @param {{ xGap?: number, yGap?: number, originX?: number, originY?: number }} [opts]
 * @returns {Array<{ id: string, position: { x: number, y: number } }>}
 */
export function layoutPipelineNodes(nodes, edges, opts = {}) {
  const xGap = opts.xGap ?? 260
  const yGap = opts.yGap ?? 110
  const originX = opts.originX ?? 40
  const originY = opts.originY ?? 80

  const list = Array.isArray(nodes) ? nodes : []
  const edgeList = Array.isArray(edges) ? edges : []
  if (!list.length) return []

  const roots = list.filter((n) => n.type === 'retrieve' || n.type === 'fetch')
  const rootList = roots.length ? roots : [list[0]]
  /** @type {Record<string, number>} */
  const depth = {}
  list.forEach((n) => {
    depth[n.id] = Number.POSITIVE_INFINITY
  })
  rootList.forEach((r) => {
    depth[r.id] = 0
  })

  const outs = {}
  list.forEach((n) => {
    outs[n.id] = []
  })
  edgeList.forEach((e) => {
    if (outs[e.source]) outs[e.source].push(e.target)
  })

  const queue = rootList.map((r) => r.id)
  while (queue.length) {
    const id = queue.shift()
    const d = depth[id]
    ;(outs[id] || []).forEach((tid) => {
      if (d + 1 < depth[tid]) {
        depth[tid] = d + 1
        queue.push(tid)
      }
    })
  }

  // Unreachable nodes: place after max depth
  let maxReachable = 0
  Object.values(depth).forEach((d) => {
    if (Number.isFinite(d) && d > maxReachable) maxReachable = d
  })
  list.forEach((n) => {
    if (!Number.isFinite(depth[n.id])) depth[n.id] = maxReachable + 1
  })

  /** @type {Record<number, string[]>} */
  const byDepth = {}
  list.forEach((n) => {
    const d = depth[n.id]
    if (!byDepth[d]) byDepth[d] = []
    byDepth[d].push(n.id)
  })

  // Stable order within a layer
  const typeRank = { retrieve: 0, fetch: 0, merge: 1, filter: 2, transform: 3, ingest: 4, export: 4 }
  Object.keys(byDepth).forEach((d) => {
    byDepth[d].sort((a, b) => {
      const na = list.find((n) => n.id === a)
      const nb = list.find((n) => n.id === b)
      const ra = typeRank[na?.type] ?? 9
      const rb = typeRank[nb?.type] ?? 9
      if (ra !== rb) return ra - rb
      return String(a).localeCompare(String(b))
    })
  })

  /** @type {Array<{ id: string, position: { x: number, y: number } }>} */
  const positions = []
  Object.keys(byDepth)
    .map(Number)
    .sort((a, b) => a - b)
    .forEach((d) => {
      const ids = byDepth[d]
      const total = ids.length
      ids.forEach((id, index) => {
        const yOffset = (index - (total - 1) / 2) * yGap
        positions.push({
          id,
          position: {
            x: originX + d * xGap,
            y: originY + yOffset,
          },
        })
      })
    })

  return positions
}
