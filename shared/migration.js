/**
 * Migration project helpers — hybrid model: raw always in ingest, mapped/export via dual-sink.
 */

export const MIGRATION_STATUSES = ['draft', 'planning', 'ready', 'running', 'completed', 'archived']

export const MIGRATION_STAGE_TYPES = ['extract', 'transform', 'validate', 'export', 'manual']

export const MIGRATION_STAGE_STATUSES = ['draft', 'ready', 'blocked', 'skipped']

export const MIGRATION_RUN_MODES = ['sample', 'pilot', 'full']

export const MIGRATION_RUN_STATUSES = ['pending', 'running', 'completed', 'failed', 'cancelled']

/**
 * @param {string} value
 */
export function cleanEntityKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48)
}

/**
 * @param {string} projectKey
 * @param {string} entityKey
 * @param {'raw'|'mapped'} layer
 */
export function migrationIngestTable(projectKey, entityKey, layer = 'raw') {
  const pk = cleanEntityKey(projectKey) || 'proj'
  const ek = cleanEntityKey(entityKey) || 'entity'
  const prefix = layer === 'mapped' ? 'mig_mapped' : 'mig_raw'
  return `${prefix}_${pk}_${ek}`.slice(0, 63)
}

/**
 * @param {unknown} raw
 */
export function normalizeFieldMapping(raw) {
  const m = raw && typeof raw === 'object' ? raw : {}
  const sources = Array.isArray(m.sources)
    ? m.sources.map((s) => String(s || '').trim()).filter(Boolean)
    : (m.source ? [String(m.source).trim()] : [])
  return {
    id: String(m.id || cryptoRandomId()),
    destination: String(m.destination || '').trim(),
    sources,
    transform: String(m.transform || 'copy').trim(),
    cast: m.cast ? String(m.cast).trim() : '',
    mapValues: m.mapValues && typeof m.mapValues === 'object' ? m.mapValues : null,
    template: m.template ? String(m.template) : '',
    required: Boolean(m.required),
    notes: m.notes ? String(m.notes).slice(0, 500) : '',
  }
}

/**
 * @param {unknown} raw
 */
export function normalizeStageConfig(raw) {
  const cfg = raw && typeof raw === 'object' ? raw : {}
  const mappings = Array.isArray(cfg.fieldMappings)
    ? cfg.fieldMappings.map(normalizeFieldMapping)
    : []
  return {
    entityLabel: String(cfg.entityLabel || '').trim(),
    sourceEntity: String(cfg.sourceEntity || '').trim(),
    destinationEntity: String(cfg.destinationEntity || '').trim(),
    fieldMappings: mappings,
    validationRules: Array.isArray(cfg.validationRules) ? cfg.validationRules : [],
    connectorNeeds: Array.isArray(cfg.connectorNeeds) ? cfg.connectorNeeds : [],
    destinationTable: cfg.destinationTable ? String(cfg.destinationTable).trim() : '',
    notes: cfg.notes ? String(cfg.notes).slice(0, 2000) : '',
  }
}

/**
 * @param {unknown} raw
 */
export function normalizeMigrationStage(raw) {
  const stage = raw && typeof raw === 'object' ? raw : {}
  const stageType = MIGRATION_STAGE_TYPES.includes(String(stage.stageType || stage.stage_type))
    ? String(stage.stageType || stage.stage_type)
    : 'extract'
  const status = MIGRATION_STAGE_STATUSES.includes(String(stage.status))
    ? String(stage.status)
    : 'draft'
  return {
    id: stage.id ? String(stage.id) : '',
    sortOrder: Number(stage.sortOrder ?? stage.sort_order) || 0,
    name: String(stage.name || '').trim(),
    description: stage.description ? String(stage.description).trim() : '',
    stageType,
    entityKey: cleanEntityKey(stage.entityKey ?? stage.entity_key),
    status,
    config: normalizeStageConfig(stage.config),
    dataSourceId: stage.dataSourceId || stage.data_source_id || '',
    reportId: stage.reportId || stage.report_id || '',
  }
}

/**
 * @param {unknown} raw
 */
export function normalizePlanConfig(raw) {
  const plan = raw && typeof raw === 'object' ? raw : {}
  return {
    sourceSummary: String(plan.sourceSummary || '').trim(),
    destinationSummary: String(plan.destinationSummary || '').trim(),
    aiNotes: String(plan.aiNotes || '').trim(),
    entities: Array.isArray(plan.entities)
      ? plan.entities.map((e) => ({
        key: cleanEntityKey(e?.key),
        label: String(e?.label || e?.key || '').trim(),
        sourceFields: Array.isArray(e?.sourceFields) ? e.sourceFields.map(String) : [],
        destinationFields: Array.isArray(e?.destinationFields) ? e.destinationFields.map(String) : [],
      }))
      : [],
    connectorNeeds: Array.isArray(plan.connectorNeeds) ? plan.connectorNeeds : [],
    approved: Boolean(plan.approved),
  }
}

/**
 * @param {unknown} raw
 */
export function normalizeMigrationProject(raw) {
  const p = raw && typeof raw === 'object' ? raw : {}
  const status = MIGRATION_STATUSES.includes(String(p.status)) ? String(p.status) : 'draft'
  const defaultRunMode = MIGRATION_RUN_MODES.includes(String(p.defaultRunMode ?? p.default_run_mode))
    ? String(p.defaultRunMode ?? p.default_run_mode)
    : 'sample'
  const sampleLimit = Math.min(500, Math.max(1, Number(p.sampleLimit ?? p.sample_limit) || 25))
  return {
    name: String(p.name || '').trim(),
    description: p.description ? String(p.description).trim() : '',
    status,
    sourceConnectionId: p.sourceConnectionId || p.source_connection_id || '',
    destinationConnectionId: p.destinationConnectionId || p.destination_connection_id || '',
    planConfig: normalizePlanConfig(p.planConfig ?? p.plan_config),
    defaultRunMode,
    sampleLimit,
  }
}

/**
 * @returns {string}
 */
function cryptoRandomId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `map_${Date.now().toString(36)}`
}
