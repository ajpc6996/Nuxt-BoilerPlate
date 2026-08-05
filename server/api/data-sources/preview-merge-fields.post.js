import { executePipeline } from '~~/server/utils/connectors/pipeline/runPipeline.js'
import { loadFetchInputs } from '~~/server/utils/connectors/pipeline/loadFetchInputs.js'
import { isMergePipeline, normalizePipeline } from '~~/shared/pipelineDefaults.js'

/**
 * Discover join-key field lists for a Merge node’s two inbound parents.
 * Loads Fetch inputs in parallel (last ingest), then samples each parent’s output.
 *
 * Body: { organizationId, connectionId?, pipeline, mergeNodeId, dataSourceId? }
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const organizationId = body?.organizationId
  const dataSourceId = body?.dataSourceId ? String(body.dataSourceId) : ''
  const mergeNodeId = body?.mergeNodeId ? String(body.mergeNodeId) : ''
  const pipeline = normalizePipeline(body?.pipeline)

  if (!organizationId) {
    throw createError({ statusCode: 400, statusMessage: 'organizationId is required' })
  }
  if (!mergeNodeId) {
    throw createError({ statusCode: 400, statusMessage: 'mergeNodeId is required' })
  }
  if (!isMergePipeline(pipeline)) {
    throw createError({ statusCode: 400, statusMessage: 'Pipeline is not a merge pipeline' })
  }

  await requireOrgAdmin(event, organizationId)

  const mergeNode = pipeline.nodes.find((n) => n.id === mergeNodeId && n.type === 'merge')
  if (!mergeNode) {
    throw createError({ statusCode: 400, statusMessage: 'Merge node not found' })
  }

  const parentIds = pipeline.edges
    .filter((e) => e.target === mergeNodeId)
    .map((e) => e.source)
    .sort()

  if (parentIds.length !== 2) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Connect exactly two inputs to this Merge node before loading fields',
    })
  }

  const seedOutputs = await loadFetchInputs({
    pipeline,
    organizationId,
    parentMode: 'test',
    excludeSourceId: dataSourceId || 'preview',
    fetchStack: dataSourceId ? [dataSourceId] : [],
    forceLastIngest: true,
  })

  const [leftId, rightId] = parentIds

  const leftResult = executePipeline({
    pipeline,
    seedOutputs,
    debug: false,
    untilNodeId: leftId,
    skipValidation: true,
  })
  const rightResult = executePipeline({
    pipeline,
    seedOutputs,
    debug: false,
    untilNodeId: rightId,
    skipValidation: true,
  })

  return {
    left: describeSide(pipeline, leftId, leftResult.rows),
    right: describeSide(pipeline, rightId, rightResult.rows),
  }
})

/**
 * @param {{ nodes: Array }} pipeline
 * @param {string} nodeId
 * @param {Record<string, unknown>[]} rows
 */
function describeSide(pipeline, nodeId, rows) {
  const node = pipeline.nodes.find((n) => n.id === nodeId)
  const list = Array.isArray(rows) ? rows : []
  const fields = fieldsFromRows(list)
  const sample = list[0] && typeof list[0] === 'object' && !Array.isArray(list[0])
    ? list[0]
    : null

  return {
    nodeId,
    type: node?.type || null,
    label: node?.data?.label || nodeId,
    sourceId: node?.data?.sourceId || null,
    sourceName: node?.data?.sourceName || null,
    rowCount: list.length,
    fields,
    sample,
  }
}

/**
 * @param {Record<string, unknown>[]} rows
 */
function fieldsFromRows(rows) {
  const set = new Set()
  for (const row of (rows || []).slice(0, 25)) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue
    Object.keys(row).forEach((k) => {
      if (!k.startsWith('_')) set.add(k)
    })
  }
  return [...set].sort((a, b) => a.localeCompare(b))
}
