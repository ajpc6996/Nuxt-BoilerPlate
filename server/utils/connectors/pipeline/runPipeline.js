import { normalizePipeline, isMergePipeline } from './defaults.js'
import { topologicalOrder, validatePipeline } from './validate.js'
import { runFilterOperator } from './filter.js'
import { runTransformOperator } from './transform.js'
import { runMergeOperator } from './merge.js'

/**
 * Run pipeline operators then return rows for Ingest.
 * Retrieve pipelines seed from retrievedRows; merge pipelines seed from seedOutputs (Fetch ids).
 *
 * @param {{
 *   pipeline: unknown,
 *   retrievedRows?: Record<string, unknown>[],
 *   seedOutputs?: Record<string, Record<string, unknown>[]>,
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
  const merge = isMergePipeline(pipeline)

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

  /** @type {string[]} */
  let rootIds = []

  if (merge) {
    const seed = opts.seedOutputs && typeof opts.seedOutputs === 'object' ? opts.seedOutputs : {}
    const fetchNodes = pipeline.nodes.filter((n) => n.type === 'fetch')
    for (const node of fetchNodes) {
      const rows = Array.isArray(seed[node.id]) ? seed[node.id] : []
      outputs[node.id] = rows
      rootIds.push(node.id)
      steps.push({
        nodeId: node.id,
        type: 'fetch',
        in: 0,
        out: rows.length,
        sample: debug ? sampleRows(rows) : undefined,
        meta: {
          sourceId: node.data?.sourceId || null,
          mode: node.data?.mode === 'refresh' ? 'refresh' : 'last_ingest',
        },
      })
      if (untilNodeId === node.id) {
        return finish(outputs, steps, rootIds, debug, untilNodeId)
      }
    }
  }
  else {
    const retrieveNode = pipeline.nodes.find((n) => n.type === 'retrieve')
    if (!retrieveNode) {
      throw createError({ statusCode: 400, statusMessage: 'Pipeline must have a Retrieve node' })
    }
    outputs[retrieveNode.id] = Array.isArray(opts.retrievedRows) ? opts.retrievedRows : []
    rootIds = [retrieveNode.id]

    steps.push({
      nodeId: retrieveNode.id,
      type: 'retrieve',
      in: 0,
      out: outputs[retrieveNode.id].length,
      sample: debug ? sampleRows(outputs[retrieveNode.id]) : undefined,
      meta: opts.retrieveMeta || {},
    })

    if (untilNodeId === retrieveNode.id) {
      return finish(outputs, steps, rootIds, debug, untilNodeId)
    }
  }

  for (const nodeId of order) {
    const node = pipeline.nodes.find((n) => n.id === nodeId)
    if (!node || node.type === 'retrieve' || node.type === 'fetch') continue

    if (node.type === 'merge') {
      const parents = pipeline.edges
        .filter((e) => e.target === node.id)
        .map((e) => e.source)
        .sort()
      if (parents.length !== 2 || !(parents[0] in outputs) || !(parents[1] in outputs)) {
        continue
      }
      const leftRows = outputs[parents[0]] || []
      const rightRows = outputs[parents[1]] || []
      const result = runMergeOperator(leftRows, rightRows, node.data || {})
      if (result.meta?.error) {
        throw createError({ statusCode: 400, statusMessage: result.meta.error })
      }
      outputs[node.id] = result.rows
      steps.push({
        nodeId: node.id,
        type: 'merge',
        in: result.meta.inLeft + result.meta.inRight,
        out: result.meta.out,
        meta: {
          ...result.meta,
          leftNodeId: parents[0],
          rightNodeId: parents[1],
        },
        sample: debug ? sampleRows(result.rows) : undefined,
      })
      if (untilNodeId === node.id) {
        return finish(outputs, steps, rootIds, debug, untilNodeId)
      }
      continue
    }

    const parentEdge = pipeline.edges.find((e) => e.target === node.id)
    if (!parentEdge || !(parentEdge.source in outputs)) {
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
        return finish(outputs, steps, rootIds, debug, untilNodeId)
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
        return finish(outputs, steps, rootIds, debug, untilNodeId)
      }
      continue
    }

    if (node.type === 'ingest' || node.type === 'export') {
      const input = outputs[parentEdge.source] || []
      outputs[node.id] = input
      steps.push({
        nodeId: node.id,
        type: node.type,
        in: input.length,
        out: input.length,
        sample: debug ? sampleRows(input) : undefined,
      })
      if (untilNodeId === node.id) {
        return finish(outputs, steps, rootIds, debug, untilNodeId)
      }
    }
  }

  if (untilNodeId && !(untilNodeId in outputs)) {
    throw createError({
      statusCode: 400,
      statusMessage: merge
        ? 'Could not reach parent node — check links from Fetch / Merge'
        : 'Could not reach parent node — check links from Retrieve',
    })
  }

  return finish(outputs, steps, rootIds, debug, untilNodeId)
}

/**
 * @param {Record<string, Record<string, unknown>[]>} outputs
 * @param {Array<Record<string, unknown>>} steps
 * @param {string[]} rootIds
 * @param {boolean} debug
 * @param {string | null} untilNodeId
 */
function finish(outputs, steps, rootIds, debug, untilNodeId) {
  const ingestStep = steps.find((s) => s.type === 'ingest')
  const exportStep = steps.find((s) => s.type === 'export')
  const finalKey = untilNodeId || ingestStep?.nodeId || exportStep?.nodeId
  const finalRows = (finalKey && outputs[finalKey]) || []
  const retrieved = rootIds.reduce((sum, id) => sum + (outputs[id]?.length || 0), 0)

  const sinkOutputs = {
    ingest: steps
      .filter((s) => s.type === 'ingest')
      .map((s) => ({ nodeId: s.nodeId, rows: outputs[s.nodeId] || [] })),
    export: steps
      .filter((s) => s.type === 'export')
      .map((s) => ({ nodeId: s.nodeId, rows: outputs[s.nodeId] || [] })),
  }

  return {
    rows: finalRows,
    sinkOutputs,
    summary: {
      retrieved,
      afterPipeline: finalRows.length,
      filteredOut: Math.max(0, retrieved - finalRows.length),
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
