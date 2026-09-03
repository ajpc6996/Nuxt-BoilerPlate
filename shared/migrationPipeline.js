/**
 * Pipeline templates for migration stages (hybrid ingest + dual-sink export).
 */

import { migrationIngestTable } from './migration.js'
import {
  compileFieldMappingsToActions,
} from './migrationPlanV2.js'
import {
  isIntegerDestinationField,
} from './migrationSystems.js'
import { getBooleanDestinationFields, getDestinationKnowledge } from './migrationPacks/index.js'

/**
 * @param {unknown} value
 */
function hasMappingValue(value) {
  return value !== undefined && value !== null && value !== ''
}

/**
 * @param {Array<Record<string, unknown>>} actions
 * @param {string} dest
 * @param {Record<string, unknown>} mapping
 */
function pushIfNullDefault(actions, dest, mapping) {
  if (!hasMappingValue(mapping.ifNullValue)) return
  actions.push({
    op: 'default',
    field: dest,
    value: mapping.ifNullValue,
    when: 'null',
  })
}

/**
 * Raw extract: Retrieve → Ingest (append, retention).
 * @param {{ destinationTable: string, retentionDays?: number }} opts
 */
export function createExtractPipeline(opts) {
  const table = opts.destinationTable
  const retentionDays = Number(opts.retentionDays) || 7
  return {
    version: 1,
    kind: 'retrieve',
    debug: false,
    nodes: [
      {
        id: 'retrieve',
        type: 'retrieve',
        position: { x: 40, y: 140 },
        data: { label: 'Retrieve' },
      },
      {
        id: 'ingest',
        type: 'ingest',
        position: { x: 520, y: 140 },
        data: {
          label: 'Ingest raw',
          destinationTable: table,
          writeMode: 'append',
          retentionDays,
        },
      },
    ],
    edges: [
      { id: 'e-retrieve-ingest', source: 'retrieve', target: 'ingest' },
    ],
  }
}

/**
 * Map + dual-sink: Fetch raw ingest → Transform → Ingest (mapped) + Export (Temp Stage).
 * @param {{
 *   extractSourceId: string,
 *   destinationTable: string,
 *   exportConnectionId: string,
 *   transformActions?: Array<Record<string, unknown>>,
 *   retentionDays?: number,
 * }} opts
 */
export function createTransformDualSinkPipeline(opts) {
  const extractSourceId = String(opts.extractSourceId || '').trim()
  const destinationTable = opts.destinationTable
  const exportConnectionId = String(opts.exportConnectionId || '').trim()
  const retentionDays = Number(opts.retentionDays) || 7
  const actions = Array.isArray(opts.transformActions) ? opts.transformActions : []

  return {
    version: 1,
    kind: 'fetch',
    debug: false,
    nodes: [
      {
        id: 'fetch_raw',
        type: 'fetch',
        position: { x: 40, y: 140 },
        data: {
          label: 'Raw ingest',
          sourceId: extractSourceId,
          mode: 'last_ingest',
        },
      },
      {
        id: 'transform',
        type: 'transform',
        position: { x: 280, y: 140 },
        data: {
          label: 'Map fields',
          actions,
        },
      },
      {
        id: 'ingest',
        type: 'ingest',
        position: { x: 520, y: 80 },
        data: {
          label: 'Ingest mapped',
          destinationTable,
          writeMode: 'append',
          retentionDays,
        },
      },
      {
        id: 'export',
        type: 'export',
        position: { x: 520, y: 220 },
        data: {
          label: 'Export',
          connectionId: exportConnectionId,
        },
      },
    ],
    edges: [
      { id: 'e-fetch-transform', source: 'fetch_raw', target: 'transform' },
      { id: 'e-transform-ingest', source: 'transform', target: 'ingest' },
      { id: 'e-transform-export', source: 'transform', target: 'export' },
    ],
  }
}

/**
 * Convert field mappings to Transform node actions.
 * Uses v2 compiler when planVersion >= 2 or mappings include transformSpec.
 * @param {Array<Record<string, unknown>>} mappings
 * @param {{ destinationSystemId?: string, planVersion?: number }} [opts]
 */
export function fieldMappingsToTransformActions(mappings, opts = {}) {
  const useV2 = Number(opts.planVersion) >= 2
    || (Array.isArray(mappings) && mappings.some((m) => m?.transformSpec || (m?.transform && typeof m.transform === 'object')))
  if (useV2) {
    return compileFieldMappingsToActions(mappings, opts)
  }

  const actions = []
  /** @type {string[]} */
  const keepFields = []
  const destSystem = String(opts.destinationSystemId || '').trim().toLowerCase()
  const boolDest = getBooleanDestinationFields(destSystem)
  const knowledge = getDestinationKnowledge(destSystem)
  const extraInts = knowledge?.integerExtraFields || []

  for (const m of mappings || []) {
    const dest = String(m.destination || m.targetField || '').trim()
    if (!dest) continue

    const sources = Array.isArray(m.sources)
      ? m.sources.map((s) => String(s || '').trim()).filter(Boolean)
      : (m.source || m.field || m.from
        ? [String(m.source || m.field || m.from).trim()].filter(Boolean)
        : [])
    const transform = String(m.transform || m.op || 'copy').trim()
    const hasConstant = m.constantValue !== undefined && m.constantValue !== null && m.constantValue !== ''

    if (transform === 'constant' || (hasConstant && !sources.length && transform !== 'template')) {
      // Always set — constants must win over accidental source copies (e.g. SortOrder→active).
      actions.push({
        op: 'default',
        field: dest,
        value: m.constantValue,
        when: 'always',
      })
      keepFields.push(dest)
      continue
    }

    if (transform === 'template' && m.template) {
      actions.push({ op: 'template', targetField: dest, template: m.template })
      keepFields.push(dest)
      pushIfNullDefault(actions, dest, m)
      continue
    }

    if (transform === 'map' && m.mapValues && typeof m.mapValues === 'object') {
      const src = sources[0]
      if (!src) continue
      // Keep unmatched values (numeric RT status ids / unknown labels).
      // Unknown labels stay as strings → number cast → null → constant default.
      actions.push({
        op: 'map',
        field: src,
        targetField: dest,
        mapping: m.mapValues,
        fallback: 'keep',
      })
      keepFields.push(dest)
      if (boolDest.has(dest.toLowerCase())) {
        actions.push({ op: 'cast', field: dest, to: 'boolean', onError: 'null' })
      }
      else if (isIntegerDestinationField(dest, boolDest, extraInts)) {
        actions.push({ op: 'cast', field: dest, to: 'number', onError: 'null' })
      }
      if (hasConstant) {
        actions.push({
          op: 'default',
          field: dest,
          value: m.constantValue,
          when: 'null_or_empty',
        })
      }
      pushIfNullDefault(actions, dest, m)
      continue
    }

    if (sources.length > 1 || transform === 'join') {
      if (sources.length < 2) continue
      actions.push({
        op: 'join',
        fields: sources,
        targetField: dest,
        separator: ' ',
      })
      keepFields.push(dest)
      pushIfNullDefault(actions, dest, m)
      continue
    }

    const src = sources[0]
    if (sources.length > 1) {
      actions.push({ op: 'copy', fields: sources, targetField: dest })
    }
    else if (src && src !== dest) {
      // field = source column, targetField = destination column
      actions.push({ op: 'copy', field: src, targetField: dest })
    }
    else if (src && src === dest && (m.cast || m.required)) {
      actions.push({ op: 'copy', field: src, targetField: dest })
    }
    // Same-name fields pass through; still keep them for export projection.
    if (src || dest) {
      keepFields.push(dest)
    }

    if (m.cast) {
      const castField = src && src !== dest ? dest : (src || dest)
      if (castField) {
        actions.push({ op: 'cast', field: castField, to: String(m.cast).trim() })
      }
    }
    else if (boolDest.has(dest.toLowerCase())) {
      // Avoid Postgres: invalid input syntax for type boolean: "2"
      actions.push({ op: 'cast', field: dest, to: 'boolean', onError: 'null' })
    }
    else if (isIntegerDestinationField(dest, boolDest, extraInts)) {
      // Avoid Postgres: invalid input syntax for type integer: "approved"
      actions.push({ op: 'cast', field: dest, to: 'number', onError: 'null' })
    }

    // Optional constant fill when source is missing/null/empty
    if (hasConstant) {
      actions.push({
        op: 'default',
        field: dest,
        value: m.constantValue,
        when: 'null_or_empty',
      })
    }
    pushIfNullDefault(actions, dest, m)
  }

  // Project to destination columns only — outbound INSERT must not send
  // leftover source columns (e.g. RT "Zip") into destination tables.
  const uniqueKeep = [...new Set(keepFields.filter(Boolean))]
  if (uniqueKeep.length) {
    actions.push({ op: 'keep', fields: uniqueKeep })
  }

  return actions
}

/**
 * Default table names for a migration entity.
 * @param {string} projectKey
 * @param {string} entityKey
 */
export function defaultMigrationTables(projectKey, entityKey) {
  return {
    raw: migrationIngestTable(projectKey, entityKey, 'raw'),
    mapped: migrationIngestTable(projectKey, entityKey, 'mapped'),
  }
}
