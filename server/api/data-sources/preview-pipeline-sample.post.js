import { decryptSecrets } from '~~/server/utils/connectorCrypto.js'
import { getConnectorRunner } from '~~/server/utils/connectors/registry.js'
import { mergeConnectorConfig } from '~~/server/utils/connectors/executeConnection.js'
import { executePipeline } from '~~/server/utils/connectors/pipeline/runPipeline.js'
import { loadFetchInputs } from '~~/server/utils/connectors/pipeline/loadFetchInputs.js'
import { isMergePipeline, normalizePipeline } from '~~/shared/pipelineDefaults.js'

/**
 * Sample the first object from a pipeline node’s parent output
 * (Retrieve/Fetch → … → parent of nodeId), using unsaved connection config + pipeline.
 *
 * Body: { organizationId, connectionId, config, pipeline, nodeId, dataSourceId? }
 * nodeId = the Filter/Transform being configured; sample is from its inbound parent.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const organizationId = body?.organizationId
  const connectionId = body?.connectionId
  const dataSourceId = body?.dataSourceId ? String(body.dataSourceId) : ''
  const nodeId = body?.nodeId ? String(body.nodeId) : ''
  const config = body?.config && typeof body.config === 'object' ? body.config : {}
  const pipeline = normalizePipeline(body?.pipeline)

  if (!organizationId || !connectionId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'organizationId and connectionId are required',
    })
  }
  if (!nodeId) {
    throw createError({ statusCode: 400, statusMessage: 'nodeId is required' })
  }

  await requireOrgAdmin(event, organizationId)
  const admin = useSupabaseAdmin()

  const { data: connection, error } = await admin
    .from('connections')
    .select('*, connector_types(*)')
    .eq('id', connectionId)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (error || !connection) {
    throw createError({ statusCode: 404, statusMessage: 'Connection not found' })
  }

  const type = connection.connector_types
  if (!type?.is_enabled) {
    throw createError({ statusCode: 400, statusMessage: 'Connector type is disabled' })
  }

  // For merge nodes with two parents, sample from the first parent edge.
  const parentEdge = pipeline.edges.find((e) => e.target === nodeId)
  if (!parentEdge) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Connect this node to a parent first, then load a sample',
    })
  }
  const parentId = parentEdge.source

  /** @type {ReturnType<typeof executePipeline>} */
  let pipelineResult
  /** @type {Record<string, unknown>} */
  let meta = {}

  if (isMergePipeline(pipeline)) {
    const seedOutputs = await loadFetchInputs({
      pipeline,
      organizationId,
      parentMode: 'test',
      excludeSourceId: dataSourceId || 'preview',
      fetchStack: dataSourceId ? [dataSourceId] : [],
      forceLastIngest: true,
    })
    pipelineResult = executePipeline({
      pipeline,
      seedOutputs,
      debug: true,
      untilNodeId: parentId,
      skipValidation: true,
    })
    meta = { kind: 'merge' }
  }
  else {
    const { data: secretRow } = await admin
      .from('connection_secrets')
      .select('ciphertext')
      .eq('connection_id', connection.id)
      .maybeSingle()

    let secrets = {}
    if (secretRow?.ciphertext) {
      secrets = decryptSecrets(secretRow.ciphertext)
    }

    const mergedConfig = mergeConnectorConfig(connection.config, config)
    const runner = await getConnectorRunner(type.runner_key, admin)
    const result = await runner({
      config: mergedConfig,
      secrets,
      mode: 'test',
      organizationId,
    })

    const retrievedRows = Array.isArray(result.rows) ? result.rows : []
    meta = result.meta || {}
    pipelineResult = executePipeline({
      pipeline,
      retrievedRows,
      retrieveMeta: meta,
      debug: true,
      untilNodeId: parentId,
      skipValidation: true,
    })
  }

  const rows = Array.isArray(pipelineResult.rows) ? pipelineResult.rows : []
  const sample = rows[0] && typeof rows[0] === 'object' && !Array.isArray(rows[0])
    ? rows[0]
    : rows[0] != null
      ? { value: rows[0] }
      : null

  const fields = sample
    ? Object.keys(sample).filter((k) => !k.startsWith('_'))
    : []

  return {
    sample,
    fields,
    rowCount: rows.length,
    parentNodeId: parentId,
    meta,
  }
})
