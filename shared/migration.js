/**
 * Migration project helpers — hybrid model: raw always in ingest, mapped/export via dual-sink.
 */

import {
  normalizePlanDependencies,
  normalizeStageExport,
  normalizeTransformSpec,
  normalizeMappingSources,
  PLAN_VERSION_V2,
} from './migrationPlanV2.js'

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
 * Derive connector runner table/query config from a migration stage entity reference.
 * Used when materializing Data Flows so MySQL/Postgres/etc. have a table to read/write.
 *
 * @param {string} entityRef sourceEntity or destinationEntity (e.g. "Users", "rt.Users", "SELECT …")
 * @param {string} [entityKey] fallback entity key
 * @returns {{ table?: string, query?: string }}
 */
export function resolveRunnerTableConfig(entityRef, entityKey = '') {
  const raw = String(entityRef || '').trim()
  if (/^select\s/i.test(raw)) {
    return { query: raw }
  }
  // Keep original casing (MySQL table names are often PascalCase, e.g. Users).
  const table = raw.replace(/[;\s]+$/g, '').trim()
  if (table && /^[a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)?$/.test(table)) {
    return { table }
  }
  // If ref looks like "schema.table more junk", take the first token that looks like an ident path
  const token = table.split(/\s+/)[0] || ''
  if (token && /^[a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)?$/.test(token)) {
    return { table: token }
  }
  const fallback = String(entityKey || '').trim()
  if (fallback && /^[a-zA-Z0-9_]+$/.test(fallback)) {
    return { table: fallback }
  }
  return {}
}

/**
 * @param {unknown} raw
 */
export function normalizeFieldMapping(raw) {
  const m = raw && typeof raw === 'object' ? raw : {}
  const sourceRefs = normalizeMappingSources(m.sources)
  const sources = sourceRefs.length
    ? sourceRefs.map((s) => s.field)
    : (m.source ? [String(m.source).trim()] : [])

  const transformRaw = m.transform
  const transformSpec = normalizeTransformSpec(
    m.transformSpec
    || (transformRaw && typeof transformRaw === 'object' ? transformRaw : null),
  )
  const legacyTransform = transformSpec
    ? (transformSpec.op === 'chain' ? 'chain' : transformSpec.op)
    : String(transformRaw || 'copy').trim()

  return {
    id: String(m.id || cryptoRandomId()),
    destination: String(m.destination || '').trim(),
    destinationType: String(m.destinationType || m.destination_type || '').trim().toLowerCase(),
    sources,
    sourceRefs,
    transform: legacyTransform,
    transformSpec,
    cast: m.cast ? String(m.cast).trim() : '',
    mapValues: m.mapValues && typeof m.mapValues === 'object' ? m.mapValues : null,
    template: m.template ? String(m.template) : '',
    constantValue: m.constantValue !== undefined
      ? m.constantValue
      : (m.constant !== undefined ? m.constant : undefined),
    ifNullValue: m.ifNullValue !== undefined
      ? m.ifNullValue
      : (m.if_null_value !== undefined ? m.if_null_value : undefined),
    required: Boolean(m.required),
    notes: m.notes ? String(m.notes).slice(0, 500) : '',
    validation: m.validation && typeof m.validation === 'object' ? m.validation : null,
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
    export: normalizeStageExport(cfg.export),
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
  const planVersion = Number(plan.planVersion ?? plan.plan_version) || 1
  return {
    planVersion: planVersion >= PLAN_VERSION_V2 ? PLAN_VERSION_V2 : planVersion,
    sourceSystemId: String(plan.sourceSystemId || '').trim(),
    destinationSystemId: String(plan.destinationSystemId || '').trim(),
    sourceSummary: String(plan.sourceSummary || '').trim(),
    destinationSummary: String(plan.destinationSummary || '').trim(),
    aiNotes: String(plan.aiNotes || '').trim(),
    operatorNotes: String(plan.operatorNotes || '').trim(),
    docsUrls: Array.isArray(plan.docsUrls) ? plan.docsUrls.map(String).slice(0, 20) : [],
    schemas: normalizePlanSchemas(plan.schemas),
    dependencies: normalizePlanDependencies(plan.dependencies),
    entities: Array.isArray(plan.entities)
      ? plan.entities.map((e) => ({
        key: cleanEntityKey(e?.key),
        label: String(e?.label || e?.key || '').trim(),
        sourceEntity: String(e?.sourceEntity || e?.source_entity || '').trim(),
        destinationEntity: String(e?.destinationEntity || e?.destination_entity || '').trim(),
        sourceFields: Array.isArray(e?.sourceFields) ? e.sourceFields.map(String) : [],
        destinationFields: Array.isArray(e?.destinationFields) ? e.destinationFields.map(String) : [],
        sourceFieldTypes: normalizeFieldTypeMap(e?.sourceFieldTypes || e?.source_field_types),
        destinationFieldTypes: normalizeFieldTypeMap(
          e?.destinationFieldTypes || e?.destination_field_types,
        ),
      }))
      : [],
    connectorNeeds: Array.isArray(plan.connectorNeeds) ? plan.connectorNeeds : [],
    constraintChecklist: Array.isArray(plan.constraintChecklist)
      ? plan.constraintChecklist.slice(0, 50).map((c) => ({
        entityKey: cleanEntityKey(c?.entityKey ?? c?.entity_key),
        destinationTable: String(c?.destinationTable || c?.destination_table || '').trim(),
        requiredColumns: Array.isArray(c?.requiredColumns)
          ? c.requiredColumns.map(String).slice(0, 80)
          : [],
        mitigations: Array.isArray(c?.mitigations)
          ? c.mitigations.map(String).slice(0, 40)
          : [],
        residualRisks: Array.isArray(c?.residualRisks)
          ? c.residualRisks.map(String).slice(0, 40)
          : [],
      }))
      : [],
    lastValidation: plan.lastValidation && typeof plan.lastValidation === 'object'
      ? plan.lastValidation
      : null,
    approved: Boolean(plan.approved),
  }
}

/**
 * @param {unknown} raw
 */
function normalizePlanSchemas(raw) {
  const schemas = raw && typeof raw === 'object' ? raw : {}
  return {
    source: normalizeSchemaSide(schemas.source),
    destination: normalizeSchemaSide(schemas.destination),
  }
}

/**
 * @param {unknown} raw
 */
function normalizeSchemaSide(raw) {
  const side = raw && typeof raw === 'object' ? raw : {}
  const entities = side.entities && typeof side.entities === 'object' ? side.entities : {}
  /** @type {Record<string, unknown>} */
  const normalized = {}
  for (const [key, ent] of Object.entries(entities)) {
    const ek = cleanEntityKey(key)
    if (!ek || !ent || typeof ent !== 'object') continue
    const columns = ent.columns && typeof ent.columns === 'object' ? ent.columns : {}
    normalized[ek] = {
      table: String(ent.table || '').trim(),
      columns,
    }
  }
  return {
    connectorId: String(side.connectorId || side.connector_id || '').trim(),
    dialect: String(side.dialect || '').trim().toLowerCase(),
    entities: normalized,
    introspectedAt: side.introspectedAt || side.introspected_at || null,
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
  const resetIngestBeforeRun = Boolean(
    p.resetIngestBeforeRun ?? p.reset_ingest_before_run ?? false,
  )
  return {
    name: String(p.name || '').trim(),
    description: p.description ? String(p.description).trim() : '',
    status,
    sourceConnectionId: p.sourceConnectionId || p.source_connection_id || '',
    destinationConnectionId: p.destinationConnectionId || p.destination_connection_id || '',
    planConfig: normalizePlanConfig(p.planConfig ?? p.plan_config),
    defaultRunMode,
    sampleLimit,
    resetIngestBeforeRun,
  }
}

/**
 * Short data-flow name for migration stages (migration name is a separate column).
 *
 * @param {{ stageType?: string, entityKey?: string, stageName?: string }} opts
 */
export function migrationFlowName(opts) {
  const stageType = String(opts?.stageType || '').trim()
  const entity = String(opts?.entityKey || opts?.stageName || 'stage').trim()
  if (stageType === 'extract') return `Extract ${entity}`
  if (stageType === 'transform' || stageType === 'export') return `Map ${entity}`
  return String(opts?.stageName || entity)
}

/**
 * Human-readable destination label for migration data flows (UI only).
 *
 * @param {{
 *   planConfig?: Record<string, unknown>,
 *   stageType?: string,
 *   entityKey?: string,
 *   stageConfig?: Record<string, unknown>,
 * }} opts
 */
export function migrationFlowDestinationLabel(opts) {
  const planConfig = opts?.planConfig && typeof opts.planConfig === 'object' ? opts.planConfig : {}
  const cfg = opts?.stageConfig && typeof opts.stageConfig === 'object' ? opts.stageConfig : {}
  const stageType = String(opts?.stageType || '').trim()
  const entity = cleanEntityKey(opts?.entityKey) || 'entity'
  const destEntity = String(cfg.destinationEntity || cfg.entityLabel || entity).trim()
  const friendlyDest = destEntity
    .replace(/^ticket_/, '')
    .replace(/_/g, ' ')
    .trim()
  const destSystemId = String(planConfig.destinationSystemId || '').trim().toLowerCase()
  const destSystem = destSystemId ? destSystemId.replace(/_/g, ' ') : ''

  if (stageType === 'extract') {
    return `raw · ${entity.replace(/_/g, ' ')}`
  }
  if (destSystem) {
    return `${destSystem} ${friendlyDest || entity.replace(/_/g, ' ')}`
  }
  return friendlyDest || entity.replace(/_/g, ' ')
}

/**
 * @param {unknown} raw
 * @returns {Record<string, string>}
 */
function normalizeFieldTypeMap(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  /** @type {Record<string, string>} */
  const out = {}
  for (const [path, type] of Object.entries(raw)) {
    const key = String(path || '').trim()
    const t = String(type || '').trim().toLowerCase()
    if (!key || !t) continue
    out[key] = t
  }
  return out
}

/**
 * Keep plan_config.entities in sync with a manually added/edited stage.
 *
 * @param {Record<string, unknown> | null | undefined} planConfig
 * @param {{
 *   key?: string,
 *   label?: string,
 *   sourceEntity?: string,
 *   destinationEntity?: string,
 *   sourceFields?: unknown[],
 *   destinationFields?: unknown[],
 *   sourceFieldTypes?: Record<string, string>,
 *   destinationFieldTypes?: Record<string, string>,
 * }} patch
 */
export function upsertPlanEntity(planConfig, patch) {
  const plan = planConfig && typeof planConfig === 'object' ? { ...planConfig } : {}
  const key = cleanEntityKey(patch?.key)
  if (!key) return plan

  const entities = Array.isArray(plan.entities)
    ? plan.entities.map((e) => ({ ...(e || {}) }))
    : []
  const idx = entities.findIndex((e) => cleanEntityKey(e.key) === key)
  const prev = idx >= 0 ? entities[idx] : {}

  const mergeNames = (current, extra) => {
    const set = new Set()
    for (const item of [...(Array.isArray(current) ? current : []), ...(Array.isArray(extra) ? extra : [])]) {
      const name = String(item || '').trim()
      if (name) set.add(name)
    }
    return [...set]
  }

  const mergeTypes = (current, extra) => {
    /** @type {Record<string, string>} */
    const out = { ...normalizeFieldTypeMap(current) }
    const incoming = normalizeFieldTypeMap(extra)
    for (const [path, type] of Object.entries(incoming)) {
      if (path && type) out[path] = type
    }
    return out
  }

  const next = {
    ...prev,
    key,
    label: String(patch.label || prev.label || key).trim(),
    sourceEntity: String(patch.sourceEntity || prev.sourceEntity || '').trim(),
    destinationEntity: String(patch.destinationEntity || prev.destinationEntity || '').trim(),
    sourceFields: mergeNames(prev.sourceFields, patch.sourceFields),
    destinationFields: mergeNames(prev.destinationFields, patch.destinationFields),
    sourceFieldTypes: mergeTypes(prev.sourceFieldTypes, patch.sourceFieldTypes),
    destinationFieldTypes: mergeTypes(prev.destinationFieldTypes, patch.destinationFieldTypes),
  }

  if (idx >= 0) entities[idx] = next
  else entities.push(next)

  return {
    ...plan,
    entities,
    planVersion: Math.max(Number(plan.planVersion) || 1, 2),
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
