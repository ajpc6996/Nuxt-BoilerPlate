import { FILTER_OPS } from './defaults.js'
import { isMergePipeline } from './defaults.js'
import { validateTransformConfig } from './transform.js'
import { validateMergeConfig } from './merge.js'

/**
 * Validate pipeline graph for execution.
 * @param {{ nodes: Array, edges: Array, kind?: string }} pipeline
 * @returns {{ ok: boolean, error?: string }}
 */
export function validatePipeline(pipeline) {
  if (isMergePipeline(pipeline)) {
    return validateMergePipeline(pipeline)
  }
  return validateRetrievePipeline(pipeline)
}

/**
 * @param {{ nodes: Array, edges: Array }} pipeline
 */
function validateRetrievePipeline(pipeline) {
  const nodes = pipeline?.nodes || []
  const edges = pipeline?.edges || []

  const retrieves = nodes.filter((n) => n.type === 'retrieve')
  const ingests = nodes.filter((n) => n.type === 'ingest')
  const exports = nodes.filter((n) => n.type === 'export')
  const sinks = [...ingests, ...exports]

  if (retrieves.length !== 1) {
    return { ok: false, error: 'Pipeline must have exactly one Retrieve node' }
  }
  if (!sinks.length) {
    return { ok: false, error: 'Pipeline must have at least one Ingest or Export node' }
  }

  const edgeCheck = validateEdges(nodes, edges)
  if (!edgeCheck.ok) return edgeCheck

  const allowed = new Set(['retrieve', 'filter', 'transform', 'ingest', 'export'])
  for (const n of nodes) {
    if (!allowed.has(n.type)) {
      return { ok: false, error: `Unsupported node type: ${n.type}` }
    }
  }

  const ingestCheck = validateSinkNodes(sinks, edges)
  if (!ingestCheck.ok) return ingestCheck

  const retrieveId = retrieves[0].id
  if (!edges.some((e) => e.source === retrieveId)) {
    return { ok: false, error: 'Retrieve must connect to another node' }
  }

  const midCheck = validateMidChain(nodes, edges)
  if (!midCheck.ok) return midCheck

  return validateReachability(nodes, edges, [retrieveId], sinks.map((n) => n.id), 'Retrieve')
}

/**
 * @param {{ nodes: Array, edges: Array }} pipeline
 */
function validateMergePipeline(pipeline) {
  const nodes = pipeline?.nodes || []
  const edges = pipeline?.edges || []

  const fetches = nodes.filter((n) => n.type === 'fetch')
  const merges = nodes.filter((n) => n.type === 'merge')
  const retrieves = nodes.filter((n) => n.type === 'retrieve')
  const ingests = nodes.filter((n) => n.type === 'ingest')
  const exports = nodes.filter((n) => n.type === 'export')
  const sinks = [...ingests, ...exports]

  if (retrieves.length) {
    return { ok: false, error: 'Merge pipelines cannot include a Retrieve node' }
  }
  if (fetches.length < 2) {
    return { ok: false, error: 'Merge pipeline needs at least two Fetch nodes' }
  }
  if (merges.length < 1) {
    return { ok: false, error: 'Merge pipeline needs at least one Merge node' }
  }
  if (!sinks.length) {
    return { ok: false, error: 'Pipeline must have at least one Ingest or Export node' }
  }

  const edgeCheck = validateEdges(nodes, edges)
  if (!edgeCheck.ok) return edgeCheck

  const allowed = new Set(['fetch', 'merge', 'filter', 'transform', 'ingest', 'export'])
  for (const n of nodes) {
    if (!allowed.has(n.type)) {
      return { ok: false, error: `Unsupported node type: ${n.type}` }
    }
  }

  for (const n of fetches) {
    const inbound = edges.filter((e) => e.target === n.id)
    const outbound = edges.filter((e) => e.source === n.id)
    if (inbound.length) {
      return { ok: false, error: `Fetch “${n.id}” cannot have incoming connections` }
    }
    if (outbound.length < 1) {
      return { ok: false, error: `Fetch “${n.id}” needs an outgoing connection` }
    }
    if (!String(n.data?.sourceId || '').trim()) {
      return { ok: false, error: `Fetch “${n.id}” needs a source selected` }
    }
    const mode = n.data?.mode || 'last_ingest'
    if (mode !== 'last_ingest' && mode !== 'refresh') {
      return { ok: false, error: `Fetch “${n.id}” has invalid mode “${mode}”` }
    }
  }

  for (const n of merges) {
    const inbound = edges.filter((e) => e.target === n.id)
    const outbound = edges.filter((e) => e.source === n.id)
    if (inbound.length !== 2) {
      return { ok: false, error: `Merge “${n.id}” needs exactly two incoming connections` }
    }
    if (outbound.length < 1) {
      return { ok: false, error: `Merge “${n.id}” needs an outgoing connection` }
    }
    const err = validateMergeConfig(n.data || {}, n.id)
    if (err) return { ok: false, error: err }
  }

  const midCheck = validateMidChain(nodes, edges)
  if (!midCheck.ok) return midCheck

  const ingestCheck = validateSinkNodes(sinks, edges)
  if (!ingestCheck.ok) return ingestCheck

  const roots = fetches.map((f) => f.id)
  const reachable = new Set(roots)
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
      return { ok: false, error: `Node “${n.id}” is not reachable from a Fetch` }
    }
  }
  for (const n of sinks) {
    if (!reachable.has(n.id)) {
      return { ok: false, error: `Sink “${n.id}” is not reachable from Fetch nodes` }
    }
  }

  const order = topologicalOrder(nodes, edges)
  if (!order) {
    return { ok: false, error: 'Pipeline has a cycle; connect left-to-right only' }
  }

  return { ok: true }
}

/**
 * @param {Array} sinks
 * @param {Array} edges
 */
function validateSinkNodes(sinks, edges) {
  for (const n of sinks) {
    const inbound = edges.filter((e) => e.target === n.id)
    const label = n.type === 'export' ? 'Export' : 'Ingest'
    if (inbound.length !== 1) {
      return { ok: false, error: `${label} “${n.id}” needs exactly one incoming connection` }
    }
  }
  return { ok: true }
}

/**
 * @param {Array} nodes
 * @param {Array} edges
 */
function validateEdges(nodes, edges) {
  const ids = new Set(nodes.map((n) => n.id))
  for (const e of edges) {
    if (!ids.has(e.source) || !ids.has(e.target)) {
      return { ok: false, error: `Edge ${e.id} references missing nodes` }
    }
    if (e.source === e.target) {
      return { ok: false, error: 'Self-loops are not allowed' }
    }
  }
  return { ok: true }
}

/**
 * @param {Array} nodes
 * @param {Array} edges
 */
function validateMidChain(nodes, edges) {
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
  return { ok: true }
}

/**
 * @param {Array} nodes
 * @param {Array} edges
 * @param {string[]} rootIds
 * @param {string[]} ingestIds
 * @param {string} rootLabel
 */
function validateReachability(nodes, edges, rootIds, ingestIds, rootLabel) {
  const order = topologicalOrder(nodes, edges)
  if (!order) {
    return { ok: false, error: 'Pipeline has a cycle; connect left-to-right only' }
  }

  const roots = Array.isArray(rootIds) ? rootIds : [rootIds]
  const reachable = new Set(roots)
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
      return { ok: false, error: `Node “${n.id}” is not reachable from ${rootLabel}` }
    }
  }
  for (const ingestId of (Array.isArray(ingestIds) ? ingestIds : [ingestIds])) {
    if (!reachable.has(ingestId)) {
      return { ok: false, error: `Sink is not reachable from ${rootLabel}` }
    }
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
