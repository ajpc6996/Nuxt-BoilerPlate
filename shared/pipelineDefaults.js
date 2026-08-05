/**
 * Default Source pipeline: Retrieve connected to Ingest.
 * Shared by client canvas and server execution.
 * @param {{ debug?: boolean }} [opts]
 */
export function createDefaultPipeline(opts = {}) {
  return {
    version: 1,
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
        data: { label: 'Ingest' },
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
 * @param {unknown} raw
 */
export function normalizePipeline(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !Object.keys(raw).length) {
    return createDefaultPipeline()
  }

  const nodes = Array.isArray(raw.nodes) ? raw.nodes : []
  const edges = Array.isArray(raw.edges) ? raw.edges : []

  if (!nodes.some((n) => n?.type === 'retrieve') || !nodes.some((n) => n?.type === 'ingest')) {
    return createDefaultPipeline({ debug: Boolean(raw.debug) })
  }

  return {
    version: Number(raw.version) || 1,
    debug: Boolean(raw.debug),
    nodes: nodes.map((n) => ({
      id: String(n.id),
      type: String(n.type),
      position: {
        x: Number(n.position?.x) || 0,
        y: Number(n.position?.y) || 0,
      },
      data: n.data && typeof n.data === 'object' ? { ...n.data } : {},
    })),
    edges: edges.map((e) => ({
      id: String(e.id || `${e.source}-${e.target}`),
      source: String(e.source),
      target: String(e.target),
      sourceHandle: e.sourceHandle || null,
      targetHandle: e.targetHandle || null,
    })),
  }
}

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
