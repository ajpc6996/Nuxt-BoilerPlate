/**
 * Default Source pipeline: Retrieve connected to Ingest.
 * Shared by client canvas and server execution.
 * @param {{ debug?: boolean }} [opts]
 */
export function createDefaultPipeline(opts = {}) {
  return {
    version: 1,
    kind: 'retrieve',
    debug: Boolean(opts.debug),
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
        data: { label: 'Ingest', writeMode: 'replace', retentionDays: 7 },
      },
    ],
    edges: [
      {
        id: 'e-retrieve-ingest',
        source: 'retrieve',
        target: 'ingest',
      },
    ],
  }
}

/**
 * Multi-source merge template: Fetch A + Fetch B → Merge → Ingest.
 * Fetch defaults to last ingest; optional refresh re-runs the child source.
 * @param {{ debug?: boolean }} [opts]
 */
export function createMergePipeline(opts = {}) {
  return {
    version: 1,
    kind: 'merge',
    debug: Boolean(opts.debug),
    nodes: [
      {
        id: 'fetch_a',
        type: 'fetch',
        position: { x: 40, y: 60 },
        data: {
          label: 'Source A',
          sourceId: '',
          mode: 'last_ingest',
        },
      },
      {
        id: 'fetch_b',
        type: 'fetch',
        position: { x: 40, y: 220 },
        data: {
          label: 'Source B',
          sourceId: '',
          mode: 'last_ingest',
        },
      },
      {
        id: 'merge',
        type: 'merge',
        position: { x: 320, y: 140 },
        data: {
          label: 'Merge',
          keys: [{ left: '', right: '' }],
          leftPrefix: 'a_',
          rightPrefix: 'b_',
        },
      },
      {
        id: 'ingest',
        type: 'ingest',
        position: { x: 600, y: 140 },
        data: { label: 'Ingest', writeMode: 'replace', retentionDays: 7 },
      },
    ],
    edges: [
      { id: 'e-fetch-a-merge', source: 'fetch_a', target: 'merge' },
      { id: 'e-fetch-b-merge', source: 'fetch_b', target: 'merge' },
      { id: 'e-merge-ingest', source: 'merge', target: 'ingest' },
    ],
  }
}

/**
 * @param {unknown} raw
 */
export function isMergePipeline(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false
  if (raw.kind === 'merge') return true
  const nodes = Array.isArray(raw.nodes) ? raw.nodes : []
  return nodes.some((n) => n?.type === 'fetch' || n?.type === 'merge')
}

/**
 * Ingest and/or Export (Temp Stage) count as pipeline sinks.
 * @param {Array<{ type?: string }>} nodes
 */
export function hasPipelineSink(nodes) {
  const list = Array.isArray(nodes) ? nodes : []
  return list.some((n) => n?.type === 'ingest' || n?.type === 'export')
}

/**
 * @param {unknown} raw
 */
export function normalizePipeline(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !Object.keys(raw).length) {
    return createDefaultPipeline()
  }

  const nodes = Array.isArray(raw.nodes) ? raw.nodes : []
  const edges = Array.isArray(raw.edges) ? raw.edges : []
  const merge = isMergePipeline(raw)

  if (merge) {
    if (!hasPipelineSink(nodes)) {
      return createMergePipeline({ debug: Boolean(raw.debug) })
    }
    return {
      version: Number(raw.version) || 1,
      kind: 'merge',
      debug: Boolean(raw.debug),
      nodes: mapNodes(nodes),
      edges: mapEdges(edges),
    }
  }

  if (!nodes.some((n) => n?.type === 'retrieve') || !hasPipelineSink(nodes)) {
    return createDefaultPipeline({ debug: Boolean(raw.debug) })
  }

  return {
    version: Number(raw.version) || 1,
    kind: 'retrieve',
    debug: Boolean(raw.debug),
    nodes: mapNodes(nodes),
    edges: mapEdges(edges),
  }
}

/**
 * @param {Array} nodes
 */
function mapNodes(nodes) {
  return nodes.map((n) => ({
    id: String(n.id),
    type: String(n.type),
    position: {
      x: Number(n.position?.x) || 0,
      y: Number(n.position?.y) || 0,
    },
    data: n.data && typeof n.data === 'object' ? { ...n.data } : {},
  }))
}

/**
 * @param {Array} edges
 */
function mapEdges(edges) {
  return edges.map((e) => ({
    id: String(e.id || `${e.source}-${e.target}`),
    source: String(e.source),
    target: String(e.target),
    sourceHandle: e.sourceHandle || null,
    targetHandle: e.targetHandle || null,
  }))
}

export const FETCH_MODES = ['last_ingest', 'refresh']

export const FILTER_OPS = ['eq', 'neq', 'contains', 'not_contains']

/** Stored trim mode ids (UI may label remove_spaces as “All spaces”). */
export const TRIM_MODES = ['start', 'end', 'both', 'remove_spaces']

export const CASE_STYLES = ['camel', 'snake', 'kebab', 'pascal', 'lower', 'upper']

export const TRANSFORM_OPS = [
  'trim',
  'case',
  'join',
  'split',
  'join_array',
  'regex',
  'rename',
  'copy',
  'drop',
  'cast',
  'default',
  'template',
  'conditional',
  'map',
  'date_format',
]

export const CAST_TYPES = ['string', 'number', 'boolean', 'date']

export const DEFAULT_WHENS = ['null', 'empty', 'null_or_empty']

export const CONDITIONAL_OPS = ['eq', 'neq', 'contains', 'not_contains', 'empty', 'not_empty']

export const DATE_FORMATS = [
  'iso',
  'date',
  'datetime',
  'YYYY-MM-DD',
  'DD/MM/YYYY',
  'MM/DD/YYYY',
]

export const MAP_FALLBACKS = ['keep', 'null', 'value']
