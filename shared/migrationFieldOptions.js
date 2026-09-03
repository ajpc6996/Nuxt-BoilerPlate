/**
 * Collect selectable source/destination field names for migration mapping UI.
 * Merges AI entity catalogs, introspected DB schemas, and known system docs.
 */

import { cleanEntityKey } from './migration.js'
import {
  SYSTEM_CROSS_FIELD_COPIES,
  SYSTEM_DESTINATION_DEFAULTS,
  SYSTEM_DESTINATION_ENTITY_ALIASES,
  SYSTEM_REQUIRED_DESTINATION_COLUMNS,
  normalizeMigrationSystemId,
} from './migrationSystems.js'
import { listKnownDestinationFields } from './destinationFieldHints.js'

/**
 * @param {Set<string>} into
 * @param {unknown} name
 */
function addField(into, name) {
  const field = String(name || '').trim()
  if (!field) return
  into.add(field)
}

/**
 * Unique sorted field names. Never removes names already in `current`.
 * @param {...unknown} lists
 * @returns {string[]}
 */
export function mergeFieldNames(...lists) {
  const names = new Set()
  for (const list of lists) addMany(names, list)
  return [...names].sort((a, b) => a.localeCompare(b))
}

/**
 * @param {unknown} columns
 * @param {Set<string>} into
 */
function addSchemaColumns(columns, into) {
  if (Array.isArray(columns)) {
    addMany(into, columns)
    return
  }
  if (!columns || typeof columns !== 'object') return
  for (const key of Object.keys(columns)) addField(into, key)
}

/**
 * @param {Set<string>} into
 * @param {unknown} raw
 */
function addMany(into, raw) {
  if (raw == null || raw === '') return
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        addField(into, item.name || item.field || item.key || item.column)
      }
      else {
        addField(into, item)
      }
    }
    return
  }
  if (typeof raw === 'object') {
    for (const key of Object.keys(raw)) addField(into, key)
    return
  }
  addField(into, raw)
}

/**
 * Last identifier in a table ref (`public.users` → `users`).
 * @param {unknown} ref
 */
export function tableNameKey(ref) {
  return String(ref || '')
    .trim()
    .split('.')
    .pop()
    .replace(/[^a-zA-Z0-9_]+/g, '')
    .toLowerCase()
}

/**
 * Resolve catalog entity key for system defaults (e.g. transactions → articles).
 * @param {string} systemId
 * @param {string} entityKey
 */
export function resolveSystemEntityKey(systemId, entityKey) {
  const system = normalizeMigrationSystemId(systemId)
  const entity = cleanEntityKey(entityKey)
  if (!system || !entity) return entity
  const aliases = SYSTEM_DESTINATION_ENTITY_ALIASES[system]
  if (aliases && aliases[entity]) return cleanEntityKey(aliases[entity])
  return entity
}

/**
 * Related keys for matching plan entities / schema maps.
 * @param {string} entityKey
 * @param {string} [tableHint]
 * @returns {Set<string>}
 */
export function relatedEntityKeys(entityKey, tableHint = '') {
  const ek = cleanEntityKey(entityKey)
  const keys = new Set()
  if (ek) keys.add(ek)
  const hint = cleanEntityKey(tableHint) || cleanEntityKey(tableNameKey(tableHint))
  if (hint) keys.add(hint)
  if (ek) {
    for (const aliases of Object.values(SYSTEM_DESTINATION_ENTITY_ALIASES)) {
      if (aliases[ek]) keys.add(cleanEntityKey(aliases[ek]))
      for (const [alias, canonical] of Object.entries(aliases)) {
        if (cleanEntityKey(canonical) === ek) keys.add(cleanEntityKey(alias))
      }
    }
  }
  return keys
}

/**
 * Column names from plan_config.schemas.{side}.entities.
 * Matches entity key, aliases, and introspected table name.
 *
 * @param {Record<string, unknown> | null | undefined} planConfig
 * @param {'source' | 'destination'} side
 * @param {string} entityKey
 * @param {string} [tableHint]
 * @returns {string[]}
 */
export function listSchemaFieldNames(planConfig, side, entityKey, tableHint = '') {
  const schemas = planConfig?.schemas && typeof planConfig.schemas === 'object'
    ? planConfig.schemas
    : null
  const sideSchema = schemas?.[side]
  const entities = sideSchema?.entities && typeof sideSchema.entities === 'object'
    ? sideSchema.entities
    : {}
  const keys = relatedEntityKeys(entityKey, tableHint)
  const hintTable = tableNameKey(tableHint)
  const names = new Set()

  for (const [key, ent] of Object.entries(entities)) {
    const table = tableNameKey(ent?.table)
    const matchKey = keys.has(cleanEntityKey(key))
    const matchTable = Boolean(hintTable && table && hintTable === table)
    if (matchKey || matchTable) addSchemaColumns(ent?.columns, names)
  }
  return [...names]
}

/**
 * All introspected column names for a side when entity matching finds none.
 * @param {Record<string, unknown> | null | undefined} planConfig
 * @param {'source' | 'destination'} side
 * @returns {string[]}
 */
export function listAllSchemaFieldNames(planConfig, side) {
  const schemas = planConfig?.schemas && typeof planConfig.schemas === 'object'
    ? planConfig.schemas
    : null
  const entities = schemas?.[side]?.entities && typeof schemas[side].entities === 'object'
    ? schemas[side].entities
    : {}
  const names = new Set()
  for (const ent of Object.values(entities)) {
    addSchemaColumns(ent?.columns, names)
  }
  return [...names]
}

/**
 * @param {{
 *   planConfig?: Record<string, unknown> | null,
 *   entityKey?: string,
 *   tableHint?: string,
 *   catalogFields?: unknown,
 *   extraFields?: unknown,
 * }} opts
 * @returns {string[]}
 */
export function collectSourceFieldOptions(opts) {
  const plan = opts.planConfig && typeof opts.planConfig === 'object' ? opts.planConfig : {}
  const entityKey = cleanEntityKey(opts.entityKey)
  const tableHint = String(opts.tableHint || '').trim()
  const names = new Set()

  addMany(names, opts.catalogFields)
  addMany(names, opts.extraFields)

  const matched = listSchemaFieldNames(plan, 'source', entityKey, tableHint)
  for (const f of matched) addField(names, f)
  if (!matched.length) {
    for (const f of listAllSchemaFieldNames(plan, 'source')) addField(names, f)
  }

  const sourceSystemId = normalizeMigrationSystemId(plan.sourceSystemId || plan.source_system_id)
  const destSystemId = normalizeMigrationSystemId(plan.destinationSystemId || plan.destination_system_id)
  const destEntity = resolveSystemEntityKey(destSystemId, entityKey)
  const copies = SYSTEM_CROSS_FIELD_COPIES[sourceSystemId]?.[destSystemId]?.[destEntity]
    || SYSTEM_CROSS_FIELD_COPIES[sourceSystemId]?.[destSystemId]?.[entityKey]
    || []
  for (const mapping of copies) {
    addMany(names, mapping.sources)
  }

  return [...names].sort((a, b) => a.localeCompare(b))
}

/**
 * @param {{
 *   planConfig?: Record<string, unknown> | null,
 *   entityKey?: string,
 *   tableHint?: string,
 *   catalogFields?: unknown,
 *   extraFields?: unknown,
 * }} opts
 * @returns {string[]}
 */
export function collectDestinationFieldOptions(opts) {
  const plan = opts.planConfig && typeof opts.planConfig === 'object' ? opts.planConfig : {}
  const entityKey = cleanEntityKey(opts.entityKey)
  const tableHint = String(opts.tableHint || '').trim()
  const names = new Set()

  addMany(names, opts.catalogFields)
  addMany(names, opts.extraFields)

  const matched = listSchemaFieldNames(plan, 'destination', entityKey, tableHint)
  for (const f of matched) addField(names, f)
  if (!matched.length) {
    for (const f of listAllSchemaFieldNames(plan, 'destination')) addField(names, f)
  }

  const destSystemId = normalizeMigrationSystemId(plan.destinationSystemId || plan.destination_system_id)
  const destEntity = resolveSystemEntityKey(destSystemId, entityKey)

  for (const f of listKnownDestinationFields(destSystemId, destEntity)) addField(names, f)
  for (const f of listKnownDestinationFields(destSystemId, entityKey)) addField(names, f)

  const defaults = SYSTEM_DESTINATION_DEFAULTS[destSystemId]?.[destEntity]
    || SYSTEM_DESTINATION_DEFAULTS[destSystemId]?.[entityKey]
    || []
  for (const row of defaults) addField(names, row.destination)

  const required = SYSTEM_REQUIRED_DESTINATION_COLUMNS[destSystemId]?.[destEntity]
    || SYSTEM_REQUIRED_DESTINATION_COLUMNS[destSystemId]?.[entityKey]
    || []
  addMany(names, required)

  const sourceSystemId = normalizeMigrationSystemId(plan.sourceSystemId || plan.source_system_id)
  const copies = SYSTEM_CROSS_FIELD_COPIES[sourceSystemId]?.[destSystemId]?.[destEntity]
    || SYSTEM_CROSS_FIELD_COPIES[sourceSystemId]?.[destSystemId]?.[entityKey]
    || []
  for (const mapping of copies) addField(names, mapping.destination)

  return [...names].sort((a, b) => a.localeCompare(b))
}
