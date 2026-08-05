import { FILTER_OPS } from './defaults.js'
import { validateTransformConfig } from './transform.js'

/**
 * Validate pipeline graph for execution.
 * @param {{ nodes: Array, edges: Array }} pipeline
 * @returns {{ ok: boolean, error?: string }}
 */
export function validatePipeline(pipeline) {
  const nodes = pipeline?.nodes || []
  const edges = pipeline?.edges || []

  const retrieves = nodes.filter((n) => n.type === 'retrieve')
  const ingests = nodes.filter((n) => n.type === 'ingest')

  if (retrieves.length !== 1) {
    return { ok: false, error: 'Pipeline must have exactly one Retrieve node' }
  }
  if (ingests.length !== 1) {
    return { ok: false, error: 'Pipeline must have exactly one Ingest node' }
  }

  const ids = new Set(nodes.map((n) => n.id))
  for (const e of edges) {
    if (!ids.has(e.source) || !ids.has(e.target)) {
      return { ok: false, error: `Edge ${e.id} references missing nodes` }
    }
    if (e.source === e.target) {
      return { ok: false, error: 'Self-loops are not allowed' }
    }
  }

  const allowed = new Set(['retrieve', 'filter', 'transform', 'ingest'])
  for (const n of nodes) {
    if (!allowed.has(n.type)) {
      return { ok: false, error: `Unsupported node type: ${n.type}` }
    }
  }

  const ingestId = ingests[0].id
  const intoIngest = edges.filter((e) => e.target === ingestId)
  if (intoIngest.length !== 1) {
    return { ok: false, error: 'Ingest must have exactly one incoming connection' }
  }

  const retrieveId = retrieves[0].id
  if (!edges.some((e) => e.source === retrieveId)) {
    return { ok: false, error: 'Retrieve must connect to another node' }
  }

  for (const n of nodes.filter((x) => x.type === 'filter' || x.type === 'transform')) {
    const label = n.type === 'filter' ? 'Filter' : 'Transform'
    const inbound = edges.filter((e) => e.target === n.id)
    const outbound = edges.filter((e) => e.source === n.id)
    if (inbound.length !== 1) {
      return { ok: false, error: `${label} “${n.id}” needs exactly one incoming connection` }
    }
    if (outbound.length < 1) {
      return { ok: false, error: `${label} “${n.id}” needs an outgoing connection` }
    }
    if (n.type === 'filter') {
      const cfg = n.data || {}
      if (Array.isArray(cfg.where)) {
        for (const rule of cfg.where) {
          if (!rule?.field) {
            return { ok: false, error: `Filter “${n.id}” has a rule without a field` }
          }
          if (!FILTER_OPS.includes(rule.op)) {
            return { ok: false, error: `Filter “${n.id}” has unsupported op “${rule.op}”` }
          }
        }
      }
    }
    if (n.type === 'transform') {
      const err = validateTransformConfig(n.data || {}, n.id)
      if (err) return { ok: false, error: err }
    }
  }

  const order = topologicalOrder(nodes, edges)
  if (!order) {
    return { ok: false, error: 'Pipeline has a cycle; connect left-to-right only' }
  }

  const reachable = new Set([retrieveId])
  let changed = true
  while (changed) {
    changed = false
    for (const e of edges) {
      if (reachable.has(e.source) && !reachable.has(e.target)) {
        reachable.add(e.target)
        changed = true
      }
    }
  }
  for (const n of nodes) {
    if (!reachable.has(n.id)) {
      return { ok: false, error: `Node “${n.id}” is not reachable from Retrieve` }
    }
  }
  if (!reachable.has(ingestId)) {
    return { ok: false, error: 'Ingest is not reachable from Retrieve' }
  }

  return { ok: true }
}

/**
 * @param {Array} nodes
 * @param {Array} edges
 * @returns {string[] | null}
 */
export function topologicalOrder(nodes, edges) {
  const ids = nodes.map((n) => n.id)
  /** @type {Record<string, number>} */
  const indeg = {}
  /** @type {Record<string, string[]>} */
  const outs = {}
  ids.forEach((id) => {
    indeg[id] = 0
    outs[id] = []
  })
  edges.forEach((e) => {
    if (!(e.target in indeg) || !(e.source in outs)) return
    indeg[e.target] += 1
    outs[e.source].push(e.target)
  })

  const queue = ids.filter((id) => indeg[id] === 0)
  const order = []
  while (queue.length) {
    const id = queue.shift()
    order.push(id)
    ;(outs[id] || []).forEach((t) => {
      indeg[t] -= 1
      if (indeg[t] === 0) queue.push(t)
    })
  }
  if (order.length !== ids.length) return null
  return order
}
