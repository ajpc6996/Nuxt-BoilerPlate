/**
 * Pipeline templates for migration stages (hybrid ingest + dual-sink export).
 */

import { migrationIngestTable } from './migration.js'

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
 * @param {Array<{ sources: string[], destination: string, transform?: string, cast?: string, mapValues?: Record<string, string>, template?: string }>} mappings
 */
export function fieldMappingsToTransformActions(mappings) {
  const actions = []
  for (const m of mappings || []) {
    const dest = String(m.destination || '').trim()
    if (!dest) continue

    const sources = Array.isArray(m.sources) ? m.sources.filter(Boolean) : []
    const transform = String(m.transform || 'copy').trim()

    if (transform === 'template' && m.template) {
      actions.push({ op: 'template', field: dest, template: m.template })
      continue
    }

    if (transform === 'map' && m.mapValues && typeof m.mapValues === 'object') {
      const src = sources[0] || dest
      actions.push({
        op: 'map',
        field: dest,
        source: src,
        map: m.mapValues,
        fallback: 'null',
      })
      continue
    }

    if (sources.length > 1) {
      actions.push({
        op: 'join',
        field: dest,
        fields: sources,
        separator: ' ',
      })
      continue
    }

    const src = sources[0] || dest
    if (src !== dest) {
      actions.push({ op: 'copy', field: dest, from: src })
    }

    if (m.cast) {
      actions.push({ op: 'cast', field: dest, type: m.cast })
    }
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
