/**
 * Pure migration plan validation (v1 + v2).
 */

import { cleanEntityKey } from './migration.js'
import {
  enrichStageFieldMappings,
  SYSTEM_REQUIRED_DESTINATION_COLUMNS,
} from './migrationSystems.js'
import {
  inferTransformOutputType,
  isPlanV2,
  normalizeMappingSources,
  normalizeStageExport,
  normalizeTransformSpec,
  typesCompatible,
} from './migrationPlanV2.js'

/**
 * @typedef {{
 *   id: string,
 *   severity: 'error' | 'warning' | 'info',
 *   code: string,
 *   entityKey?: string,
 *   stageId?: string,
 *   mappingId?: string,
 *   destination?: string,
 *   message: string,
 *   hint?: string,
 * }} PlanValidationIssue
 */

/**
 * @param {Partial<PlanValidationIssue> & { code: string, message: string }} partial
 * @returns {PlanValidationIssue}
 */
function issue(partial) {
  return {
    id: partial.id || `val_${partial.code}_${Math.random().toString(36).slice(2, 8)}`,
    severity: partial.severity || 'error',
    code: partial.code,
    entityKey: partial.entityKey || '',
    stageId: partial.stageId || '',
    mappingId: partial.mappingId || '',
    destination: partial.destination || '',
    message: partial.message,
    hint: partial.hint || '',
  }
}

/**
 * @param {Record<string, unknown>} planConfig
 * @param {Array<Record<string, unknown>>} stages
 */
export function validateMigrationPlan(planConfig, stages) {
  const plan = planConfig && typeof planConfig === 'object' ? planConfig : {}
  const stageList = Array.isArray(stages) ? stages : []
  /** @type {PlanValidationIssue[]} */
  const issues = []

  const entityOrder = buildEntityOrder(plan, stageList)

  for (const stage of stageList) {
    const stageId = String(stage.id || '')
    const stageType = String(stage.stage_type || stage.stageType || '')
    const entityKey = cleanEntityKey(stage.entity_key || stage.entityKey)
    const cfg = stage.config && typeof stage.config === 'object' ? stage.config : {}
    const sortOrder = Number(stage.sort_order ?? stage.sortOrder) || 0

    if (stageType === 'extract' || stageType === 'transform') {
      const sourceEntity = String(cfg.sourceEntity || '').trim()
      if (!sourceEntity) {
        issues.push(issue({
          code: 'MISSING_SOURCE_ENTITY',
          entityKey,
          stageId,
          message: `Stage “${stage.name}” is missing sourceEntity (real source table name).`,
          hint: 'Set sourceEntity on the stage config (e.g. Users, Tickets).',
        }))
      }
    }

    if (stageType === 'transform' || stageType === 'export') {
      const destEntity = String(cfg.destinationEntity || '').trim()
      if (!destEntity) {
        issues.push(issue({
          code: 'MISSING_DESTINATION_ENTITY',
          entityKey,
          stageId,
          message: `Transform stage “${stage.name}” is missing destinationEntity.`,
          hint: 'Set destinationEntity to the real destination table (e.g. users, tickets).',
        }))
      }

      const mappings = enrichStageFieldMappings(plan, cfg, entityKey)
      const mappedDest = new Set(
        mappings.map((m) => String(m?.destination || '').trim().toLowerCase()).filter(Boolean),
      )

      const requiredCols = getRequiredDestinationColumns(plan, entityKey, cfg)
      for (const col of requiredCols) {
        if (!mappedDest.has(col.toLowerCase())) {
          issues.push(issue({
            code: 'REQUIRED_COLUMN_UNMAPPED',
            entityKey,
            stageId,
            destination: col,
            message: `Required destination column “${col}” is not mapped for entity “${entityKey}”.`,
            hint: 'Add a mapping or constant for this NOT NULL column.',
          }))
        }
      }

      for (const m of mappings) {
        issues.push(...validateFieldMapping(m, {
          entityKey,
          stageId,
          plan,
          cfg,
        }))
      }

      const exportCfg = normalizeStageExport(cfg.export)
      if (exportCfg.onConflict === 'skip') {
        const hasPk = mappedDest.has('id')
        if (!hasPk) {
          issues.push(issue({
            code: 'EXPORT_CONFLICT_NO_PK',
            entityKey,
            stageId,
            message: `Export onConflict “skip” requires primary key column “id” to be mapped.`,
            hint: 'Map destination id or change export.onConflict.',
          }))
        }
      }
    }

    const deps = getEntityRequires(plan, entityKey)
    for (const req of deps) {
      const reqOrder = entityOrder.get(req)
      if (reqOrder != null && reqOrder >= sortOrder) {
        issues.push(issue({
          code: 'DEPENDENCY_ORDER',
          entityKey,
          stageId,
          message: `Entity “${entityKey}” runs before required dependency “${req}”.`,
          hint: 'Reorder stages so dependencies migrate first (users → groups → tickets).',
        }))
      }
    }
  }

  const errorCount = issues.filter((i) => i.severity === 'error').length
  const warningCount = issues.filter((i) => i.severity === 'warning').length

  /** @type {Record<string, { ready: boolean, issueCount: number }>} */
  const stageReadiness = {}
  for (const stage of stageList) {
    const ek = cleanEntityKey(stage.entity_key || stage.entityKey)
    const sid = String(stage.id || '')
    const count = issues.filter((i) =>
      (sid && i.stageId === sid) || (ek && i.entityKey === ek),
    ).length
    stageReadiness[ek || sid] = {
      ready: !issues.some((i) => i.severity === 'error' && ((sid && i.stageId === sid) || (ek && i.entityKey === ek))),
      issueCount: count,
    }
  }

  return {
    valid: errorCount === 0,
    planVersion: Number(plan.planVersion) || 1,
    summary: {
      errorCount,
      warningCount,
      blockedStageCount: Object.values(stageReadiness).filter((r) => !r.ready).length,
    },
    issues,
    stageReadiness,
  }
}

/**
 * @param {Record<string, unknown>} plan
 * @param {Array<Record<string, unknown>>} stages
 */
function buildEntityOrder(plan, stages) {
  /** @type {Map<string, number>} */
  const order = new Map()
  const deps = plan.dependencies?.entities
  if (Array.isArray(deps)) {
    for (const e of deps) {
      const key = cleanEntityKey(e?.key)
      if (key) order.set(key, Number(e?.order) || 0)
    }
  }
  for (const stage of stages) {
    const key = cleanEntityKey(stage.entity_key || stage.entityKey)
    if (!key) continue
    const so = Number(stage.sort_order ?? stage.sortOrder) || 0
    if (!order.has(key)) order.set(key, so)
  }
  return order
}

/**
 * @param {Record<string, unknown>} plan
 * @param {string} entityKey
 */
function getEntityRequires(plan, entityKey) {
  const deps = plan.dependencies?.entities
  if (!Array.isArray(deps)) return []
  const row = deps.find((e) => cleanEntityKey(e?.key) === entityKey)
  return Array.isArray(row?.requires)
    ? row.requires.map((r) => cleanEntityKey(r)).filter(Boolean)
    : []
}

/**
 * @param {Record<string, unknown>} plan
 * @param {string} entityKey
 * @param {Record<string, unknown>} stageConfig
 */
function getRequiredDestinationColumns(plan, entityKey, stageConfig) {
  /** @type {string[]} */
  const cols = []

  const checklist = Array.isArray(plan.constraintChecklist) ? plan.constraintChecklist : []
  const row = checklist.find((c) => cleanEntityKey(c?.entityKey ?? c?.entity_key) === entityKey)
  if (row && Array.isArray(row.requiredColumns)) {
    cols.push(...row.requiredColumns.map(String))
  }

  const entities = Array.isArray(plan.entities) ? plan.entities : []
  const ent = entities.find((e) => cleanEntityKey(e?.key) === entityKey)
  if (ent && Array.isArray(ent.destinationFields) && isPlanV2(plan)) {
    for (const f of ent.destinationFields) {
      const name = String(f || '').trim()
      if (name && !cols.includes(name)) cols.push(name)
    }
  }

  const schemas = plan.schemas?.destination?.entities
  if (schemas && typeof schemas === 'object') {
    const destKey = String(stageConfig.destinationEntity || entityKey).trim().toLowerCase()
    const schemaEnt = schemas[entityKey] || schemas[destKey]
    if (schemaEnt?.columns && typeof schemaEnt.columns === 'object') {
      for (const [col, meta] of Object.entries(schemaEnt.columns)) {
        if (meta && typeof meta === 'object' && meta.nullable === false && meta.pk !== true) {
          if (!cols.includes(col)) cols.push(col)
        }
      }
    }
  }

  const destSystem = String(plan.destinationSystemId || '').trim().toLowerCase()
  let destEntity = String(stageConfig.destinationEntity || entityKey).trim().toLowerCase()
  const canonicalEntity = String(entityKey || destEntity).trim().toLowerCase()
  const knownRequired = SYSTEM_REQUIRED_DESTINATION_COLUMNS[destSystem]?.[canonicalEntity]
    || SYSTEM_REQUIRED_DESTINATION_COLUMNS[destSystem]?.[destEntity]
  if (Array.isArray(knownRequired)) {
    for (const col of knownRequired) {
      if (col && !cols.includes(col)) cols.push(col)
    }
  }

  return cols
}

/**
 * @param {Record<string, unknown>} mapping
 * @param {{ entityKey: string, stageId: string, plan: Record<string, unknown>, cfg: Record<string, unknown> }} ctx
 */
function validateFieldMapping(mapping, ctx) {
  /** @type {PlanValidationIssue[]} */
  const issues = []
  const dest = String(mapping.destination || '').trim()
  if (!dest) return issues

  const mappingId = String(mapping.id || dest)
  const destType = String(mapping.destinationType || '').trim().toLowerCase()
  const sourceRefs = normalizeMappingSources(mapping.sources)
  const sourceType = sourceRefs[0]?.type || inferSourceTypeFromSchema(ctx.plan, ctx.entityKey, sourceRefs[0]?.field)

  const legacyTransform = String(mapping.transform || '').trim()
  const spec = normalizeTransformSpec(
    mapping.transformSpec
    || (mapping.transform && typeof mapping.transform === 'object' ? mapping.transform : null),
  )

  let inferred = 'string'
  if (spec) {
    inferred = inferTransformOutputType(spec, { sourceType })
  }
  else if (legacyTransform === 'constant') {
    inferred = inferTransformOutputType({ op: 'constant', value: mapping.constantValue }, {})
  }
  else if (legacyTransform === 'map' && mapping.mapValues) {
    inferred = inferTransformOutputType({ op: 'map', mapping: mapping.mapValues }, { sourceType })
  }
  else {
    inferred = sourceType || 'string'
  }

  if (mapping.cast) {
    inferred = inferTransformOutputType(
      { op: 'cast', to: String(mapping.cast).trim() },
      { sourceType: inferred },
    )
  }

  if (destType && !typesCompatible(inferred, destType)) {
    issues.push(issue({
      code: 'TYPE_MISMATCH_AFTER_TRANSFORM',
      entityKey: ctx.entityKey,
      stageId: ctx.stageId,
      mappingId,
      destination: dest,
      message: `Mapping for “${dest}” infers type “${inferred}” but destinationType is “${destType}”.`,
      hint: 'Add map/cast/default steps so the exported value matches the destination column type.',
    }))
  }

  if (legacyTransform === 'constant' || (spec && spec.op === 'constant')) {
    issues.push(issue({
      severity: 'warning',
      code: 'CONSTANT_ASSUMPTION',
      entityKey: ctx.entityKey,
      stageId: ctx.stageId,
      mappingId,
      destination: dest,
      message: `“${dest}” uses a constant value (assumption documented in plan).`,
      hint: mapping.notes || 'Verify this default is valid in the destination environment.',
    }))
  }

  if (legacyTransform === 'map' && mapping.mapValues && sourceRefs[0]?.field) {
    const samples = getSourceSampleValues(ctx.plan, ctx.entityKey, sourceRefs[0].field)
    for (const sample of samples) {
      const key = String(sample)
      const map = mapping.mapValues
      if (!Object.prototype.hasOwnProperty.call(map, key)
        && !Object.keys(map).some((k) => k.toLowerCase() === key.toLowerCase())) {
        issues.push(issue({
          severity: 'warning',
          code: 'ENUM_GAP',
          entityKey: ctx.entityKey,
          stageId: ctx.stageId,
          mappingId,
          destination: dest,
          message: `Source value “${key}” for “${sourceRefs[0].field}” is not in map keys for “${dest}”.`,
          hint: 'Add the missing key to mapValues or add a cast + default fallback.',
        }))
      }
    }
  }

  return issues
}

/**
 * @param {Record<string, unknown>} plan
 * @param {string} entityKey
 * @param {string} field
 */
function inferSourceTypeFromSchema(plan, entityKey, field) {
  const schemas = plan.schemas?.source?.entities
  if (!schemas || typeof schemas !== 'object' || !field) return 'string'
  const ent = schemas[entityKey]
  const col = ent?.columns?.[field]
  if (col && typeof col === 'object' && col.type) return String(col.type).toLowerCase()
  return 'string'
}

/**
 * @param {Record<string, unknown>} plan
 * @param {string} entityKey
 * @param {string} field
 */
function getSourceSampleValues(plan, entityKey, field) {
  const schemas = plan.schemas?.source?.entities
  if (!schemas || typeof schemas !== 'object' || !field) return []
  const ent = schemas[entityKey]
  const col = ent?.columns?.[field]
  if (col && Array.isArray(col.sampleValues)) {
    return col.sampleValues.map(String).slice(0, 20)
  }
  return []
}

/**
 * @param {import('./validateMigrationPlan.js').ReturnType<validateMigrationPlan>} result
 */
export function formatValidationBlockMessage(result) {
  if (result.valid) return ''
  const first = result.issues.find((i) => i.severity === 'error')
  if (!first) return 'Plan validation failed'
  return first.message
}
