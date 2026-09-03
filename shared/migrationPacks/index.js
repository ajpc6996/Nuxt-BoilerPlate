/**
 * Migration product packs — proprietary per source→destination pair.
 * Core pipeline code must only call these accessors (never hardcode RT/Zammad).
 */

import { normalizeMigrationSystemId } from '../migrationSystemIds.js'
import { rtToZammadPack } from './rtToZammad.js'

/** @type {import('./types.js').MigrationPack[]} */
export const MIGRATION_PACKS = [
  rtToZammadPack,
]

/**
 * @param {string} sourceSystemId
 * @param {string} destinationSystemId
 * @returns {import('./types.js').MigrationPack | null}
 */
export function getMigrationPack(sourceSystemId, destinationSystemId) {
  const src = normalizeMigrationSystemId(sourceSystemId)
  const dest = normalizeMigrationSystemId(destinationSystemId)
  if (!src || !dest) return null
  return MIGRATION_PACKS.find((pack) => (
    pack.sourceSystemId === src && pack.destinationSystemId === dest
  )) || null
}

/**
 * Resolve pack from a plan_config object.
 * @param {Record<string, unknown> | null | undefined} planConfig
 * @returns {import('./types.js').MigrationPack | null}
 */
export function getMigrationPackFromPlan(planConfig) {
  const plan = planConfig && typeof planConfig === 'object' ? planConfig : {}
  return getMigrationPack(
    plan.sourceSystemId || plan.source_system_id,
    plan.destinationSystemId || plan.destination_system_id,
  )
}

/**
 * Destination-side knowledge for a system (from any pack targeting that destination).
 * Prefer an exact pair pack when sourceId is known.
 * @param {string} destinationSystemId
 * @param {string} [sourceSystemId]
 * @returns {import('./types.js').MigrationPack['destination'] | null}
 */
export function getDestinationKnowledge(destinationSystemId, sourceSystemId = '') {
  const pair = sourceSystemId
    ? getMigrationPack(sourceSystemId, destinationSystemId)
    : null
  if (pair?.destination) return pair.destination

  const dest = normalizeMigrationSystemId(destinationSystemId)
  if (!dest) return null
  const any = MIGRATION_PACKS.find((pack) => pack.destinationSystemId === dest)
  return any?.destination || null
}

/**
 * @param {import('./types.js').MigrationPack | null | undefined} pack
 * @param {string} entityKey
 * @returns {string}
 */
export function resolvePackEntityKey(pack, entityKey) {
  const entity = String(entityKey || '').trim().toLowerCase()
  if (!entity) return ''
  const aliases = pack?.destination?.entityAliases || {}
  return aliases[entity] || entity
}

/**
 * @param {string} destinationSystemId
 * @param {string} entityKey
 * @param {string} [sourceSystemId]
 * @returns {string}
 */
export function resolveDestinationEntityKey(destinationSystemId, entityKey, sourceSystemId = '') {
  const knowledge = getDestinationKnowledge(destinationSystemId, sourceSystemId)
  const entity = String(entityKey || '').trim().toLowerCase()
  if (!entity) return ''
  return knowledge?.entityAliases?.[entity] || entity
}

/**
 * @param {string} destinationSystemId
 * @param {string} [sourceSystemId]
 * @returns {Set<string>}
 */
export function getBooleanDestinationFields(destinationSystemId, sourceSystemId = '') {
  const knowledge = getDestinationKnowledge(destinationSystemId, sourceSystemId)
  return new Set(knowledge?.booleanFields || [])
}

/**
 * @param {string} destinationSystemId
 * @param {string} entityKey
 * @param {string} [sourceSystemId]
 * @returns {import('./types.js').PackConstantDefault[]}
 */
export function getPackDestinationDefaults(destinationSystemId, entityKey, sourceSystemId = '') {
  const knowledge = getDestinationKnowledge(destinationSystemId, sourceSystemId)
  if (!knowledge) return []
  const entity = resolveDestinationEntityKey(destinationSystemId, entityKey, sourceSystemId)
  return knowledge.defaults?.[entity] || []
}

/**
 * @param {string} destinationSystemId
 * @param {string} entityKey
 * @param {string} [sourceSystemId]
 * @returns {string[]}
 */
export function getPackRequiredColumns(destinationSystemId, entityKey, sourceSystemId = '') {
  const knowledge = getDestinationKnowledge(destinationSystemId, sourceSystemId)
  if (!knowledge) return []
  const entity = resolveDestinationEntityKey(destinationSystemId, entityKey, sourceSystemId)
  return knowledge.requiredColumns?.[entity] || []
}

/**
 * @param {string} sourceSystemId
 * @param {string} destinationSystemId
 * @param {string} entityKey
 * @returns {import('./types.js').PackCrossFieldCopy[]}
 */
export function getPackCrossFieldCopies(sourceSystemId, destinationSystemId, entityKey) {
  const pack = getMigrationPack(sourceSystemId, destinationSystemId)
  if (!pack) return []
  const entity = resolvePackEntityKey(pack, entityKey)
  return pack.crossFieldCopies?.[entity] || []
}

/**
 * @param {string} destinationSystemId
 * @param {string} entityKey
 * @param {string} [sourceSystemId]
 * @returns {Record<string, import('./types.js').PackLookupMapRule>}
 */
export function getPackLookupMaps(destinationSystemId, entityKey, sourceSystemId = '') {
  const knowledge = getDestinationKnowledge(destinationSystemId, sourceSystemId)
  if (!knowledge) return {}
  const entity = resolveDestinationEntityKey(destinationSystemId, entityKey, sourceSystemId)
  return knowledge.lookupMaps?.[entity] || {}
}

/**
 * @param {string} sourceSystemId
 * @param {string} destinationSystemId
 * @param {string} entityKey
 * @returns {import('./types.js').PackExportPolicy | null}
 */
export function getPackExportPolicy(sourceSystemId, destinationSystemId, entityKey) {
  const pack = getMigrationPack(sourceSystemId, destinationSystemId)
  if (!pack) return null
  const entity = resolvePackEntityKey(pack, entityKey)
  return pack.exportPolicies?.[entity] || null
}

/**
 * @param {string} destinationSystemId
 * @param {string} entityKey
 * @param {string} fieldName
 * @param {string} [sourceSystemId]
 * @returns {import('./types.js').PackFieldHint | null}
 */
export function getPackFieldHint(destinationSystemId, entityKey, fieldName, sourceSystemId = '') {
  const knowledge = getDestinationKnowledge(destinationSystemId, sourceSystemId)
  if (!knowledge) return null
  const entity = resolveDestinationEntityKey(destinationSystemId, entityKey, sourceSystemId)
  const field = String(fieldName || '').trim().toLowerCase()
  if (!field) return null
  const hint = knowledge.fieldHints?.[entity]?.[field]
  if (!hint) return null
  // Enrich enum options from lookup maps when pack omitted options.
  if (hint.type === 'enum' && (!hint.options || !hint.options.length)) {
    const rule = knowledge.lookupMaps?.[entity]?.[field]
    if (rule?.map) {
      return { ...hint, options: uniqueMapOptions(rule.map) }
    }
  }
  return hint
}

/**
 * @param {string} destinationSystemId
 * @param {string} entityKey
 * @param {string} [sourceSystemId]
 * @returns {string[]}
 */
export function listPackDestinationFields(destinationSystemId, entityKey, sourceSystemId = '') {
  const knowledge = getDestinationKnowledge(destinationSystemId, sourceSystemId)
  if (!knowledge) return []
  const entity = resolveDestinationEntityKey(destinationSystemId, entityKey, sourceSystemId)
  const scoped = knowledge.fieldHints?.[entity]
  if (!scoped || typeof scoped !== 'object') return []
  return Object.keys(scoped).sort((a, b) => a.localeCompare(b))
}

/**
 * @param {Record<string, string | number>} map
 * @returns {Array<{ value: string | number | boolean, label: string }>}
 */
function uniqueMapOptions(map) {
  const seen = new Set()
  /** @type {Array<{ value: string | number | boolean, label: string }>} */
  const out = []
  for (const [label, value] of Object.entries(map || {})) {
    const key = String(value)
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ value, label: `${label} → ${value}` })
  }
  return out.sort((a, b) => Number(a.value) - Number(b.value))
}
