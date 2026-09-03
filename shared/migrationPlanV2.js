/**
 * Migration plan v2 — typed mappings, transform compilation, type inference.
 */

import {
  isIntegerDestinationField,
  normalizeMigrationSystemId,
} from './migrationSystems.js'
import {
  getBooleanDestinationFields,
  getDestinationKnowledge,
  getPackExportPolicy,
  resolveDestinationEntityKey,
} from './migrationPacks/index.js'

export const PLAN_VERSION_V2 = 2

export const DESTINATION_TYPES = ['string', 'integer', 'number', 'boolean', 'timestamp', 'date', 'json', 'unknown']

/**
 * @param {unknown} planConfig
 */
export function isPlanV2(planConfig) {
  const plan = planConfig && typeof planConfig === 'object' ? planConfig : {}
  return Number(plan.planVersion) >= PLAN_VERSION_V2
}

/**
 * @param {unknown} raw
 * @returns {Array<{ entity: string, field: string, type: string }>}
 */
export function normalizeMappingSources(raw) {
  if (!Array.isArray(raw)) return []
  /** @type {Array<{ entity: string, field: string, type: string }>} */
  const out = []
  for (const item of raw) {
    if (typeof item === 'string') {
      const field = String(item || '').trim()
      if (field) out.push({ entity: '', field, type: '' })
      continue
    }
    if (item && typeof item === 'object') {
      const field = String(item.field || item.name || '').trim()
      if (!field) continue
      out.push({
        entity: String(item.entity || '').trim(),
        field,
        type: String(item.type || '').trim().toLowerCase(),
      })
    }
  }
  return out
}

/**
 * @param {unknown} raw
 */
export function normalizeTransformSpec(raw) {
  if (!raw || typeof raw !== 'object') return null
  const op = String(raw.op || '').trim()
  if (!op) return null
  if (op === 'chain') {
    const steps = Array.isArray(raw.steps)
      ? raw.steps.map(normalizeTransformSpec).filter(Boolean)
      : []
    return { op: 'chain', steps }
  }
  if (op === 'map') {
    return {
      op: 'map',
      mapping: raw.mapping && typeof raw.mapping === 'object' ? { ...raw.mapping } : {},
      fallback: raw.fallback ? normalizeTransformSpec(raw.fallback) : null,
    }
  }
  if (op === 'cast') {
    return {
      op: 'cast',
      to: String(raw.to || 'string').trim(),
      onError: raw.onError === 'keep' ? 'keep' : 'null',
    }
  }
  if (op === 'default') {
    return {
      op: 'default',
      when: String(raw.when || 'null').trim(),
      value: raw.value,
      valueType: raw.valueType ? String(raw.valueType).trim() : '',
    }
  }
  if (op === 'constant') {
    return {
      op: 'constant',
      value: raw.value,
      valueType: raw.valueType ? String(raw.valueType).trim() : '',
    }
  }
  if (op === 'template') {
    return { op: 'template', template: String(raw.template || '') }
  }
  if (op === 'lookup') {
    return {
      op: 'lookup',
      via: raw.via && typeof raw.via === 'object' ? { ...raw.via } : {},
      fallback: raw.fallback ? normalizeTransformSpec(raw.fallback) : null,
    }
  }
  if (op === 'copy') return { op: 'copy' }
  return { op }
}

/**
 * @param {unknown} raw
 */
export function normalizeStageExport(raw) {
  const e = raw && typeof raw === 'object' ? raw : {}
  const onConflict = ['skip', 'error', 'upsert'].includes(String(e.onConflict || '').toLowerCase())
    ? String(e.onConflict).toLowerCase()
    : 'error'
  return {
    mode: String(e.mode || 'insert').toLowerCase(),
    onConflict,
    conflictTarget: String(e.conflictTarget || 'primary_key').toLowerCase(),
  }
}

/**
 * @param {unknown} raw
 */
export function normalizePlanDependencies(raw) {
  const dep = raw && typeof raw === 'object' ? raw : {}
  const entities = Array.isArray(dep.entities)
    ? dep.entities.map((e) => ({
      key: String(e?.key || '').trim().toLowerCase(),
      order: Number(e?.order) || 0,
      destinationKey: String(e?.destinationKey || e?.mapsTo || e?.key || '').trim().toLowerCase(),
      requires: Array.isArray(e?.requires) ? e.requires.map((r) => String(r || '').trim().toLowerCase()).filter(Boolean) : [],
      notes: e?.notes ? String(e.notes).slice(0, 500) : '',
    })).filter((e) => e.key)
    : []
  return { entities }
}

/**
 * @param {unknown} value
 */
function hasMappingValue(value) {
  return value !== undefined && value !== null && value !== ''
}

/**
 * @param {unknown} value
 */
function inferValueType(value) {
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Number.isInteger(value) ? 'integer' : 'number'
  }
  if (value === '__NOW__' || value === '{{now}}') return 'timestamp'
  if (typeof value === 'string') {
    const s = value.trim().toLowerCase()
    if (s === 'true' || s === 'false') return 'boolean'
    if (/^-?\d+$/.test(s)) return 'integer'
  }
  return 'string'
}

/**
 * @param {string} type
 */
function normalizeDestType(type) {
  const t = String(type || '').trim().toLowerCase()
  if (!t) return 'unknown'
  if (t === 'int' || t === 'bigint' || t === 'smallint') return 'integer'
  if (t === 'float' || t === 'double' || t === 'decimal' || t === 'numeric') return 'number'
  if (t === 'bool') return 'boolean'
  if (t === 'datetime' || t === 'timestamptz') return 'timestamp'
  return t
}

/**
 * @param {string} inferred
 * @param {string} expected
 */
export function typesCompatible(inferred, expected) {
  const inf = normalizeDestType(inferred)
  const exp = normalizeDestType(expected)
  if (!exp || exp === 'unknown') return true
  if (inf === 'unknown') return true
  if (inf === exp) return true
  if ((inf === 'integer' || inf === 'number') && (exp === 'integer' || exp === 'number')) return true
  if ((inf === 'timestamp' || inf === 'date') && (exp === 'timestamp' || exp === 'date')) return true
  return false
}

/**
 * @param {Record<string, unknown> | null} spec
 * @param {{ sourceType?: string }} ctx
 */
export function inferTransformOutputType(spec, ctx = {}) {
  if (!spec) {
    return normalizeDestType(ctx.sourceType || 'string') || 'string'
  }
  const op = String(spec.op || '')
  if (op === 'constant' || op === 'default') {
    if (spec.valueType) return normalizeDestType(spec.valueType)
    return inferValueType(spec.value)
  }
  if (op === 'cast') return normalizeDestType(String(spec.to || 'string'))
  if (op === 'map') {
    const values = Object.values(spec.mapping || {})
    if (values.length && values.every((v) => typeof v === 'number')) return 'integer'
    if (values.length && values.every((v) => typeof v === 'boolean')) return 'boolean'
    return inferTransformOutputType(spec.fallback, ctx)
  }
  if (op === 'template') return 'string'
  if (op === 'lookup') {
    return inferTransformOutputType(spec.fallback, { sourceType: 'integer' }) || 'integer'
  }
  if (op === 'chain' && Array.isArray(spec.steps)) {
    let current = normalizeDestType(ctx.sourceType || 'string') || 'string'
    for (const step of spec.steps) {
      current = inferTransformOutputType(step, { ...ctx, sourceType: current })
    }
    return current
  }
  if (op === 'copy') return normalizeDestType(ctx.sourceType || 'string') || 'string'
  return 'unknown'
}

/**
 * @param {Record<string, unknown>} mapping
 * @param {{ destinationSystemId?: string }} opts
 */
export function compileFieldMappingToActions(mapping, opts = {}) {
  const dest = String(mapping.destination || '').trim()
  if (!dest) return []

  const sourceRefs = normalizeMappingSources(mapping.sources)
  const sources = sourceRefs.map((s) => s.field)
  const src = sources[0]
  const destSystem = normalizeMigrationSystemId(opts.destinationSystemId)
  const boolDest = getBooleanDestinationFields(destSystem)
  const knowledge = getDestinationKnowledge(destSystem)
  const extraInts = knowledge?.integerExtraFields || []

  /** @type {Array<Record<string, unknown>>} */
  const actions = []

  const legacyTransform = String(mapping.transform || '').trim()
  const spec = mapping.transformSpec
    || (mapping.transform && typeof mapping.transform === 'object' ? mapping.transform : null)

  if (spec && typeof spec === 'object') {
    actions.push(...compileTransformSpec(spec, { dest, sources, src }))
  }
  else if (legacyTransform === 'constant' || (
    hasMappingValue(mapping.constantValue) && !sources.length && legacyTransform !== 'template'
  )) {
    actions.push({ op: 'default', field: dest, value: mapping.constantValue, when: 'always' })
    return actions
  }
  else if (legacyTransform === 'template' && mapping.template) {
    actions.push({ op: 'template', targetField: dest, template: mapping.template })
  }
  else if (legacyTransform === 'map' && mapping.mapValues) {
    if (src) {
      actions.push({
        op: 'map',
        field: src,
        targetField: dest,
        mapping: mapping.mapValues,
        fallback: 'keep',
      })
    }
  }
  else if ((sources.length > 1 || legacyTransform === 'join') && sources.length >= 2) {
    actions.push({ op: 'join', fields: sources, targetField: dest, separator: ' ' })
  }
  else if (sources.length > 1) {
    actions.push({ op: 'copy', fields: sources, targetField: dest })
  }
  else if (src && src !== dest) {
    actions.push({ op: 'copy', field: src, targetField: dest })
  }
  else if (src && src === dest && (mapping.cast || mapping.required)) {
    // Same-name passthrough — keep alone can miss columns when casing differs.
    actions.push({ op: 'copy', field: src, targetField: dest })
  }

  if (!spec) {
    if (mapping.cast) {
      const castField = src && src !== dest ? dest : (src || dest)
      if (castField) actions.push({ op: 'cast', field: castField, to: String(mapping.cast).trim() })
    }
    else if (boolDest.has(dest.toLowerCase())) {
      actions.push({ op: 'cast', field: dest, to: 'boolean', onError: 'null' })
    }
    else if (isIntegerDestinationField(dest, boolDest, extraInts)) {
      actions.push({ op: 'cast', field: dest, to: 'number', onError: 'null' })
    }
    if (hasMappingValue(mapping.constantValue)) {
      actions.push({
        op: 'default',
        field: dest,
        value: mapping.constantValue,
        when: 'null_or_empty',
      })
    }
    if (hasMappingValue(mapping.ifNullValue)) {
      actions.push({ op: 'default', field: dest, value: mapping.ifNullValue, when: 'null' })
    }
  }

  return actions
}

/**
 * @param {Record<string, unknown>} spec
 * @param {{ dest: string, sources: string[], src?: string }} ctx
 */
function compileTransformSpec(spec, ctx) {
  const dest = ctx.dest
  const src = ctx.src
  /** @type {Array<Record<string, unknown>>} */
  const actions = []
  const op = String(spec.op || '')

  if (op === 'chain' && Array.isArray(spec.steps)) {
    for (const step of spec.steps) {
      if (step) actions.push(...compileTransformSpec(step, ctx))
    }
    return actions
  }

  if (op === 'copy') {
    if (src && src !== dest) actions.push({ op: 'copy', field: src, targetField: dest })
    return actions
  }

  if (op === 'constant') {
    actions.push({ op: 'default', field: dest, value: spec.value, when: 'always' })
    return actions
  }

  if (op === 'template' && spec.template) {
    actions.push({ op: 'template', targetField: dest, template: spec.template })
    return actions
  }

  if (op === 'map' && spec.mapping) {
    if (src) {
      actions.push({
        op: 'map',
        field: src,
        targetField: dest,
        mapping: spec.mapping,
        fallback: 'keep',
      })
    }
    if (spec.fallback) actions.push(...compileTransformSpec(spec.fallback, ctx))
    return actions
  }

  if (op === 'cast') {
    actions.push({
      op: 'cast',
      field: dest,
      to: spec.to || 'string',
      onError: spec.onError || 'null',
    })
    return actions
  }

  if (op === 'default') {
    actions.push({
      op: 'default',
      field: dest,
      value: spec.value,
      when: spec.when || 'null',
    })
    return actions
  }

  if (op === 'lookup') {
    if (src && src !== dest) actions.push({ op: 'copy', field: src, targetField: dest })
    if (spec.fallback) actions.push(...compileTransformSpec(spec.fallback, ctx))
    return actions
  }

  return actions
}

/**
 * @param {Array<Record<string, unknown>>} mappings
 * @param {{ destinationSystemId?: string }} [opts]
 */
export function compileFieldMappingsToActions(mappings, opts = {}) {
  const actions = []
  /** @type {string[]} */
  const keepFields = []

  for (const m of mappings || []) {
    const dest = String(m.destination || '').trim()
    if (!dest) continue
    actions.push(...compileFieldMappingToActions(m, opts))
    keepFields.push(dest)
  }

  const uniqueKeep = [...new Set(keepFields.filter(Boolean))]
  if (uniqueKeep.length) {
    actions.push({ op: 'keep', fields: uniqueKeep })
  }
  return actions
}

/**
 * @param {Record<string, unknown>} stageConfig
 * @param {Record<string, unknown>} planConfig
 */
export function resolveStageExportConfig(stageConfig, planConfig) {
  const cfg = stageConfig && typeof stageConfig === 'object' ? stageConfig : {}
  const exportRaw = cfg.export
  if (exportRaw && typeof exportRaw === 'object') {
    return normalizeStageExport(exportRaw)
  }
  return normalizeStageExport({ mode: 'insert', onConflict: 'skip', conflictTarget: 'primary_key' })
}

/**
 * @param {Record<string, unknown>} stageConfig
 * @param {Record<string, unknown>} planConfig
 * @param {Record<string, unknown>} destRunner
 * @param {string} [entityKey]
 */
export function buildMaterializeExportConfig(stageConfig, planConfig, destRunner, entityKey = '') {
  const exp = resolveStageExportConfig(stageConfig, planConfig)
  /** @type {Record<string, unknown>} */
  const exportCfg = {
    ...(destRunner.table || destRunner.query ? destRunner : {}),
    ...(exp.onConflict === 'skip' ? { onConflict: 'skip' } : {}),
  }

  const src = normalizeMigrationSystemId(planConfig?.sourceSystemId)
  const dest = normalizeMigrationSystemId(planConfig?.destinationSystemId)
  const entity = resolveDestinationEntityKey(dest, entityKey, src)
  const policy = getPackExportPolicy(src, dest, entity)
  if (!policy) return { export: exportCfg }

  if (policy.preDeleteByField) exportCfg.preDeleteByField = policy.preDeleteByField
  if (policy.preDeleteCascade) exportCfg.preDeleteCascade = policy.preDeleteCascade
  if (policy.requireFields) exportCfg.requireFields = policy.requireFields
  if (policy.syncSerialSequence) exportCfg.syncSerialSequence = policy.syncSerialSequence
  if (policy.missingTicketParents) exportCfg.missingTicketParents = policy.missingTicketParents
  if (policy.validateArticleForeignKeys) {
    exportCfg.validateArticleForeignKeys = policy.validateArticleForeignKeys
  }
  if (policy.patchMissingUserRefs != null) {
    exportCfg.patchMissingUserRefs = policy.patchMissingUserRefs
  }
  if (policy.exportFkValidation) {
    exportCfg.exportFkValidation = policy.exportFkValidation
  }

  return { export: exportCfg }
}
