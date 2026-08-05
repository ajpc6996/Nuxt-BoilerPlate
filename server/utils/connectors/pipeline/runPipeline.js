import { normalizePipeline } from './defaults.js'
import { topologicalOrder, validatePipeline } from './validate.js'
import { runFilterOperator } from './filter.js'
import { runTransformOperator } from './transform.js'

/**
 * Run post-retrieve pipeline operators (Filter, Transform, …) then return rows for Ingest.
 *
 * @param {{
 *   pipeline: unknown,
 *   retrievedRows: Record<string, unknown>[],
 *   retrieveMeta?: Record<string, unknown>,
 *   debug?: boolean,
 *   untilNodeId?: string,
 *   skipValidation?: boolean,
 * }} opts
 */
export function executePipeline(opts) {
  const pipeline = normalizePipeline(opts.pipeline)
  const debug = Boolean(opts.debug ?? pipeline.debug)
  const untilNodeId = opts.untilNodeId ? String(opts.untilNodeId) : null

  if (!opts.skipValidation) {
    const validation = validatePipeline(pipeline)
    if (!validation.ok) {
      throw createError({ statusCode: 400, statusMessage: validation.error })
    }
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
  if (!retrieveNode) {
    throw createError({ statusCode: 400, statusMessage: 'Pipeline must have a Retrieve node' })
  }
  outputs[retrieveNode.id] = Array.isArray(opts.retrievedRows) ? opts.retrievedRows : []

  steps.push({
    nodeId: retrieveNode.id,
    type: 'retrieve',
    in: 0,
    out: outputs[retrieveNode.id].length,
    sample: debug ? sampleRows(outputs[retrieveNode.id]) : undefined,
    meta: opts.retrieveMeta || {},
  })

  if (untilNodeId === retrieveNode.id) {
    return finish(outputs, steps, retrieveNode.id, debug, untilNodeId)
  }

  for (const nodeId of order) {
    const node = pipeline.nodes.find((n) => n.id === nodeId)
    if (!node || node.type === 'retrieve') continue

    const parentEdge = pipeline.edges.find((e) => e.target === node.id)
    if (!parentEdge || !(parentEdge.source in outputs)) {
      // Skip unreachable / unconnected operators during partial preview
      continue
    }

    if (node.type === 'filter') {
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
      if (untilNodeId === node.id) {
        return finish(outputs, steps, retrieveNode.id, debug, untilNodeId)
      }
      continue
    }

    if (node.type === 'transform') {
      const input = outputs[parentEdge.source] || []
      const result = runTransformOperator(input, node.data || {})
      outputs[node.id] = result.rows
      steps.push({
        nodeId: node.id,
        type: 'transform',
        in: result.meta.in,
        out: result.meta.out,
        meta: result.meta,
        sample: debug ? sampleRows(result.rows) : undefined,
      })
      if (untilNodeId === node.id) {
        return finish(outputs, steps, retrieveNode.id, debug, untilNodeId)
      }
      continue
    }

    if (node.type === 'ingest') {
      const input = outputs[parentEdge.source] || []
      outputs[node.id] = input
      steps.push({
        nodeId: node.id,
        type: 'ingest',
        in: input.length,
        out: input.length,
        sample: debug ? sampleRows(input) : undefined,
      })
      if (untilNodeId === node.id) {
        return finish(outputs, steps, retrieveNode.id, debug, untilNodeId)
      }
    }
  }

  if (untilNodeId && !(untilNodeId in outputs)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Could not reach parent node — check links from Retrieve',
    })
  }

  return finish(outputs, steps, retrieveNode.id, debug, untilNodeId)
}

/**
 * @param {Record<string, Record<string, unknown>[]>} outputs
 * @param {Array<Record<string, unknown>>} steps
 * @param {string} retrieveId
 * @param {boolean} debug
 * @param {string | null} untilNodeId
 */
function finish(outputs, steps, retrieveId, debug, untilNodeId) {
  const ingestStep = steps.find((s) => s.type === 'ingest')
  const finalKey = untilNodeId || ingestStep?.nodeId
  const finalRows = (finalKey && outputs[finalKey]) || []
  const retrieveCount = outputs[retrieveId]?.length || 0

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
    untilNodeId: untilNodeId || undefined,
  }
}

/**
 * @param {Record<string, unknown>[]} rows
 */
function sampleRows(rows) {
  return (rows || []).slice(0, 3)
}
