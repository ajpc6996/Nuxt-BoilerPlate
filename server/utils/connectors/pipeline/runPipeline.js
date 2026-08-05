import { normalizePipeline } from './defaults.js'
import { topologicalOrder, validatePipeline } from './validate.js'
import { runFilterOperator } from './filter.js'

/**
 * Run post-retrieve pipeline operators (Filter, …) then return rows for Ingest.
 *
 * @param {{
 *   pipeline: unknown,
 *   retrievedRows: Record<string, unknown>[],
 *   retrieveMeta?: Record<string, unknown>,
 *   debug?: boolean,
 * }} opts
 */
export function executePipeline(opts) {
  const pipeline = normalizePipeline(opts.pipeline)
  const debug = Boolean(opts.debug ?? pipeline.debug)
  const validation = validatePipeline(pipeline)
  if (!validation.ok) {
    throw createError({ statusCode: 400, statusMessage: validation.error })
  }

  const order = topologicalOrder(pipeline.nodes, pipeline.edges)
  if (!order) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid pipeline order' })
  }

  /** @type {Record<string, Record<string, unknown>[]>} */
  const outputs = {}
  /** @type {Array<Record<string, unknown>>} */
  const steps = []

  const retrieveNode = pipeline.nodes.find((n) => n.type === 'retrieve')
  outputs[retrieveNode.id] = Array.isArray(opts.retrievedRows) ? opts.retrievedRows : []

  steps.push({
    nodeId: retrieveNode.id,
    type: 'retrieve',
    in: 0,
    out: outputs[retrieveNode.id].length,
    sample: debug ? sampleRows(outputs[retrieveNode.id]) : undefined,
    meta: opts.retrieveMeta || {},
  })

  for (const nodeId of order) {
    const node = pipeline.nodes.find((n) => n.id === nodeId)
    if (!node || node.type === 'retrieve') continue

    if (node.type === 'filter') {
      const parentEdge = pipeline.edges.find((e) => e.target === node.id)
      const input = outputs[parentEdge.source] || []
      const result = runFilterOperator(input, node.data || {})
      outputs[node.id] = result.rows
      steps.push({
        nodeId: node.id,
        type: 'filter',
        in: result.meta.in,
        out: result.meta.out,
        dropped: result.meta.dropped,
        meta: result.meta,
        sample: debug ? sampleRows(result.rows) : undefined,
      })
      continue
    }

    if (node.type === 'ingest') {
      const parentEdge = pipeline.edges.find((e) => e.target === node.id)
      const input = outputs[parentEdge.source] || []
      outputs[node.id] = input
      steps.push({
        nodeId: node.id,
        type: 'ingest',
        in: input.length,
        out: input.length,
        sample: debug ? sampleRows(input) : undefined,
      })
    }
  }

  const ingestNode = pipeline.nodes.find((n) => n.type === 'ingest')
  const finalRows = outputs[ingestNode.id] || []
  const retrieveCount = outputs[retrieveNode.id]?.length || 0

  return {
    rows: finalRows,
    summary: {
      retrieved: retrieveCount,
      afterPipeline: finalRows.length,
      filteredOut: Math.max(0, retrieveCount - finalRows.length),
      written: 0,
    },
    steps,
    debug,
  }
}

/**
 * @param {Record<string, unknown>[]} rows
 */
function sampleRows(rows) {
  return (rows || []).slice(0, 3)
}
