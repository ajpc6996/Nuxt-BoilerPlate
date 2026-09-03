/**
 * Known migration source/destination systems and database hints.
 * Product-specific defaults, maps, and export rules live in shared/migrationPacks/.
 */

import { normalizeMigrationSystemId } from './migrationSystemIds.js'
import {
  getBooleanDestinationFields,
  getDestinationKnowledge,
  getMigrationPack,
  getPackCrossFieldCopies,
  getPackDestinationDefaults,
  getPackLookupMaps,
  resolveDestinationEntityKey,
} from './migrationPacks/index.js'

export { normalizeMigrationSystemId } from './migrationSystemIds.js'

/** @typedef {{
 *   id: string,
 *   label: string,
 *   database: string,
 *   preferredRunner: string,
 *   fallbackRunner: string,
 *   connectorTypeKey: string,
 *   notes: string,
 *   keywords: string[],
 * }} MigrationSystemDef */

/** @type {MigrationSystemDef[]} */
export const MIGRATION_SYSTEM_CATALOG = [
  {
    id: 'rt',
    label: 'Request Tracker (RT)',
    database: 'mysql',
    preferredRunner: 'mysql',
    fallbackRunner: 'rest_generic',
    connectorTypeKey: 'mysql',
    notes: 'RT typically runs on MySQL/MariaDB. Enable the mysql driver under Administration → Connector drivers, then create a MySQL inbound connection.',
    keywords: ['request tracker', 'rt', 'rtir', 'best practical'],
  },
  {
    id: 'zammad',
    label: 'Zammad',
    database: 'postgresql',
    preferredRunner: 'postgres',
    fallbackRunner: 'rest_generic',
    connectorTypeKey: 'postgres',
    notes: 'Zammad uses PostgreSQL. Enable the postgres driver under Administration → Connector drivers.',
    keywords: ['zammad'],
  },
  {
    id: 'salesforce',
    label: 'Salesforce',
    database: 'saas',
    preferredRunner: 'rest_generic',
    fallbackRunner: 'rest_generic',
    connectorTypeKey: 'rest_generic',
    notes: 'Salesforce exposes a REST API — use OAuth/API key on a REST connection.',
    keywords: ['salesforce', 'sfdc'],
  },
  {
    id: 'servicenow',
    label: 'ServiceNow',
    database: 'saas',
    preferredRunner: 'rest_generic',
    fallbackRunner: 'rest_generic',
    connectorTypeKey: 'rest_generic',
    notes: 'ServiceNow Table API via REST.',
    keywords: ['servicenow', 'snow'],
  },
  {
    id: 'jira',
    label: 'Jira',
    database: 'saas',
    preferredRunner: 'rest_generic',
    fallbackRunner: 'rest_generic',
    connectorTypeKey: 'rest_generic',
    notes: 'Atlassian Jira Cloud/Server REST API.',
    keywords: ['jira', 'atlassian'],
  },
  {
    id: 'mysql',
    label: 'MySQL / MariaDB (generic)',
    database: 'mysql',
    preferredRunner: 'mysql',
    fallbackRunner: 'csv_file',
    connectorTypeKey: 'mysql',
    notes: 'Direct MySQL read/write when the mysql driver is enabled. CSV/REST remain fallbacks.',
    keywords: ['mysql', 'mariadb'],
  },
  {
    id: 'postgresql',
    label: 'PostgreSQL (generic)',
    database: 'postgresql',
    preferredRunner: 'postgres',
    fallbackRunner: 'csv_file',
    connectorTypeKey: 'postgres',
    notes: 'Direct PostgreSQL read/write when the postgres driver is enabled.',
    keywords: ['postgres', 'postgresql', 'pg'],
  },
  {
    id: 'mssql',
    label: 'Microsoft SQL Server',
    database: 'mssql',
    preferredRunner: 'mssql',
    fallbackRunner: 'csv_file',
    connectorTypeKey: 'mssql',
    notes: 'SQL Server read/write when the mssql driver is enabled.',
    keywords: ['mssql', 'sql server', 'sqlserver'],
  },
  {
    id: 'mongodb',
    label: 'MongoDB',
    database: 'mongodb',
    preferredRunner: 'mongodb',
    fallbackRunner: 'json_file',
    connectorTypeKey: 'mongodb',
    notes: 'MongoDB find/insertMany when the mongodb driver is enabled.',
    keywords: ['mongodb', 'mongo'],
  },
  {
    id: 'elasticsearch',
    label: 'Elasticsearch',
    database: 'elasticsearch',
    preferredRunner: 'elasticsearch',
    fallbackRunner: 'json_file',
    connectorTypeKey: 'elasticsearch',
    notes: 'Elasticsearch search/bulk index when the elasticsearch driver is enabled.',
    keywords: ['elasticsearch', 'elastic', 'opensearch'],
  },
  {
    id: 'oracle',
    label: 'Oracle Database',
    database: 'oracle',
    preferredRunner: 'oracle',
    fallbackRunner: 'csv_file',
    connectorTypeKey: 'oracle',
    notes: 'Oracle read/write when oracledb + Instant Client are installed on the server.',
    keywords: ['oracle', 'oracledb'],
  },
  {
    id: 's3',
    label: 'S3 / object storage',
    database: 'file',
    preferredRunner: 's3',
    fallbackRunner: 'json_file',
    connectorTypeKey: 's3',
    notes: 'S3-compatible JSON/CSV objects (AWS, MinIO, etc.).',
    keywords: ['s3', 'minio', 'object storage', 'bucket'],
  },
  {
    id: 'sftp',
    label: 'SFTP',
    database: 'file',
    preferredRunner: 'sftp',
    fallbackRunner: 'csv_file',
    connectorTypeKey: 'sftp',
    notes: 'SFTP file transfer for JSON/CSV payloads.',
    keywords: ['sftp', 'ssh file'],
  },
  {
    id: 'csv_export',
    label: 'CSV / file export',
    database: 'file',
    preferredRunner: 'csv_file',
    fallbackRunner: 'csv_file',
    connectorTypeKey: 'csv_file',
    notes: 'Scheduled or manual CSV/JSON file drops (HTTPS URL or inline).',
    keywords: ['csv', 'file export', 'spreadsheet'],
  },
  {
    id: 'rest_api',
    label: 'REST API (generic)',
    database: 'api',
    preferredRunner: 'rest_generic',
    fallbackRunner: 'rest_generic',
    connectorTypeKey: 'rest_generic',
    notes: 'HTTP JSON API with optional auth and paging.',
    keywords: ['rest', 'api', 'http', 'json'],
  },
  {
    id: 'custom',
    label: 'Other / not listed',
    database: 'unknown',
    preferredRunner: 'rest_generic',
    fallbackRunner: 'rest_generic',
    connectorTypeKey: 'rest_generic',
    notes: 'Describe the system in the project description; pick the closest connector type when creating a connection.',
    keywords: [],
  },
]

/**
 * @param {string} id
 */
export function getMigrationSystem(id) {
  const normalized = normalizeMigrationSystemId(id)
  return MIGRATION_SYSTEM_CATALOG.find((s) => s.id === normalized)
    || MIGRATION_SYSTEM_CATALOG.find((s) => s.id === 'custom')
}

/**
 * Pack-backed destination defaults (empty when no pack targets this destination).
 * Prefer getPackDestinationDefaults() for new code.
 * @type {Record<string, Record<string, Array<Record<string, unknown>>>>}
 */
export const SYSTEM_DESTINATION_DEFAULTS = new Proxy(/** @type {Record<string, any>} */ ({}), {
  get(_target, prop) {
    if (typeof prop !== 'string') return undefined
    const knowledge = getDestinationKnowledge(prop)
    return knowledge?.defaults || undefined
  },
  ownKeys() {
    return [...new Set(MIGRATION_SYSTEM_CATALOG.map((s) => s.id)
      .filter((id) => getDestinationKnowledge(id)))]
  },
  getOwnPropertyDescriptor(_t, prop) {
    if (typeof prop !== 'string') return undefined
    const value = getDestinationKnowledge(prop)?.defaults
    if (!value) return undefined
    return { configurable: true, enumerable: true, value }
  },
})

/**
 * Pack-backed required destination columns.
 * @type {Record<string, Record<string, string[]>>}
 */
export const SYSTEM_REQUIRED_DESTINATION_COLUMNS = new Proxy(/** @type {Record<string, any>} */ ({}), {
  get(_target, prop) {
    if (typeof prop !== 'string') return undefined
    return getDestinationKnowledge(prop)?.requiredColumns || undefined
  },
})

/**
 * Pack-backed entity aliases by destination system.
 * @type {Record<string, Record<string, string>>}
 */
export const SYSTEM_DESTINATION_ENTITY_ALIASES = new Proxy(/** @type {Record<string, any>} */ ({}), {
  get(_target, prop) {
    if (typeof prop !== 'string') return undefined
    return getDestinationKnowledge(prop)?.entityAliases || undefined
  },
  ownKeys() {
    return [...new Set(
      MIGRATION_SYSTEM_CATALOG.map((s) => s.id).filter((id) => getDestinationKnowledge(id)?.entityAliases),
    )]
  },
  getOwnPropertyDescriptor(_t, prop) {
    if (typeof prop !== 'string') return undefined
    const value = getDestinationKnowledge(prop)?.entityAliases
    if (!value) return undefined
    return { configurable: true, enumerable: true, value }
  },
})

/**
 * Pack-backed boolean destination fields (no silent Zammad fallback).
 * @type {Record<string, Set<string>>}
 */
export const SYSTEM_BOOLEAN_DESTINATIONS = new Proxy(/** @type {Record<string, any>} */ ({}), {
  get(_target, prop) {
    if (typeof prop !== 'string') return undefined
    const set = getBooleanDestinationFields(prop)
    return set.size ? set : undefined
  },
})

/**
 * Pack-backed cross-field copies: SYSTEM_CROSS_FIELD_COPIES[src][dest][entity]
 * @type {Record<string, Record<string, Record<string, Array<Record<string, unknown>>>>>}
 */
export const SYSTEM_CROSS_FIELD_COPIES = new Proxy(/** @type {Record<string, any>} */ ({}), {
  get(_target, srcProp) {
    if (typeof srcProp !== 'string') return undefined
    return new Proxy(/** @type {Record<string, any>} */ ({}), {
      get(_t2, destProp) {
        if (typeof destProp !== 'string') return undefined
        const pack = getMigrationPack(srcProp, destProp)
        if (!pack?.crossFieldCopies) return undefined
        return pack.crossFieldCopies
      },
    })
  },
})

/**
 * @param {string} dest
 * @param {Set<string> | undefined} boolDest
 * @param {string[]} [extraIntegerFields]
 */
export function isIntegerDestinationField(dest, boolDest, extraIntegerFields = []) {
  const d = String(dest || '').trim().toLowerCase()
  if (!d || boolDest?.has(d)) return false
  if (d === 'id' || d.endsWith('_id')) return true
  return (extraIntegerFields || []).includes(d)
}

/**
 * Upgrade name copies into map transforms using the active destination pack.
 * @param {string} systemId
 * @param {string} entityKey
 * @param {Array<Record<string, unknown>>} mappings
 * @param {string} [sourceSystemId]
 */
export function enrichMappingsWithLookupMaps(systemId, entityKey, mappings, sourceSystemId = '') {
  const system = normalizeMigrationSystemId(systemId)
  const entity = resolveDestinationEntityKey(system, entityKey, sourceSystemId)
  const list = Array.isArray(mappings) ? mappings : []
  const rules = getPackLookupMaps(system, entity, sourceSystemId)
  if (!Object.keys(rules).length) return list

  return list.map((m) => {
    const dest = String(m?.destination || '').trim().toLowerCase()
    const transform = String(m?.transform || m?.op || 'copy').trim()
    if (transform === 'constant') return m
    const rule = rules[dest]
    if (!rule?.map) return m

    const existing = m.mapValues && typeof m.mapValues === 'object' ? m.mapValues : {}
    /** @type {Record<string, unknown>} */
    const next = {
      ...m,
      transform: 'map',
      mapValues: { ...rule.map, ...existing },
      notes: m.notes || rule.notes || '',
    }
    if (rule.defaultSources?.length && !(m.sources?.length)) {
      next.sources = [...rule.defaultSources]
    }
    if (
      (m.constantValue === undefined || m.constantValue === null || m.constantValue === '')
      && rule.defaultConstant !== undefined
    ) {
      next.constantValue = rule.defaultConstant
    }
    return next
  })
}

/**
 * Merge pack destination constant defaults into mappings when absent.
 * @param {string} systemId
 * @param {string} entityKey
 * @param {Array<Record<string, unknown>>} mappings
 * @param {string} [sourceSystemId]
 */
export function enrichMappingsWithSystemDefaults(systemId, entityKey, mappings, sourceSystemId = '') {
  let list = Array.isArray(mappings) ? [...mappings] : []
  const system = normalizeMigrationSystemId(systemId)
  const entity = resolveDestinationEntityKey(system, entityKey, sourceSystemId)
  const defaults = getPackDestinationDefaults(system, entity, sourceSystemId)
  if (!defaults.length) return list

  const destKey = (m) => String(m?.destination || '').trim().toLowerCase()

  for (const d of defaults) {
    const dest = String(d.destination || '').trim()
    if (!dest) continue
    const key = dest.toLowerCase()

    if (d.force) {
      list = list.filter((m) => destKey(m) !== key)
    }
    else if (list.some((m) => destKey(m) === key)) {
      continue
    }

    list.push({
      id: `sys_${system}_${entity}_${dest}`,
      sources: [],
      destination: dest,
      transform: 'constant',
      constantValue: d.constantValue,
      required: Boolean(d.required),
      notes: d.force
        ? `Forced constant for ${system} ${entity}.${dest} (overrides unsafe source maps)`
        : `Auto-filled for ${system} ${entity} NOT NULL / audit column`,
    })
  }
  return list
}

/**
 * Merge pack cross-system field copies into mappings.
 * @param {string} sourceSystemId
 * @param {string} destSystemId
 * @param {string} entityKey
 * @param {Array<Record<string, unknown>>} mappings
 */
export function enrichMappingsWithSystemCopies(sourceSystemId, destSystemId, entityKey, mappings) {
  let list = Array.isArray(mappings) ? [...mappings] : []
  const src = normalizeMigrationSystemId(sourceSystemId)
  const dest = normalizeMigrationSystemId(destSystemId)
  const entity = resolveDestinationEntityKey(dest, entityKey, src)
  const rules = getPackCrossFieldCopies(src, dest, entity)
  if (!rules.length) return list

  const destKey = (m) => String(m?.destination || '').trim().toLowerCase()

  for (const rule of rules) {
    const destName = String(rule.destination || '').trim()
    if (!destName) continue
    const key = destName.toLowerCase()

    if (rule.force) {
      list = list.filter((m) => destKey(m) !== key)
    }
    else if (list.some((m) => destKey(m) === key)) {
      continue
    }

    /** @type {Record<string, unknown>} */
    const entry = {
      id: `xcopy_${src}_${dest}_${entity}_${destName}`,
      sources: Array.isArray(rule.sources) ? rule.sources : [],
      destination: destName,
      transform: rule.transform || 'copy',
      required: Boolean(rule.required),
      notes: rule.notes || `Auto-copy ${src} → ${dest} ${entity}.${destName}`,
    }
    if (rule.cast) entry.cast = rule.cast
    if (rule.template) entry.template = rule.template
    if (rule.mapValues && typeof rule.mapValues === 'object') entry.mapValues = rule.mapValues
    if (rule.destinationType) entry.destinationType = rule.destinationType
    if (rule.constantValue !== undefined && rule.constantValue !== null && rule.constantValue !== '') {
      entry.constantValue = rule.constantValue
    }
    list.push(entry)
  }

  return list
}

/**
 * Apply lookup maps, cross-system copies, and system defaults from the active pack.
 *
 * @param {Record<string, unknown>} planConfig
 * @param {Record<string, unknown>} stageConfig
 * @param {string} [entityKey]
 */
export function enrichStageFieldMappings(planConfig, stageConfig, entityKey = '') {
  const plan = planConfig && typeof planConfig === 'object' ? planConfig : {}
  const cfg = stageConfig && typeof stageConfig === 'object' ? stageConfig : {}
  const rawMappings = Array.isArray(cfg.fieldMappings) ? cfg.fieldMappings : []
  const destinationSystemId = normalizeMigrationSystemId(plan.destinationSystemId)
  const sourceSystemId = normalizeMigrationSystemId(plan.sourceSystemId)
  const destEntityRef = String(cfg.destinationEntity || cfg.entityLabel || '').trim()
  const entity = String(entityKey || destEntityRef || '').trim()

  let mappings = enrichMappingsWithLookupMaps(
    destinationSystemId,
    entity,
    rawMappings,
    sourceSystemId,
  )
  mappings = enrichMappingsWithSystemCopies(
    sourceSystemId,
    destinationSystemId,
    entity,
    mappings,
  )
  mappings = enrichMappingsWithSystemDefaults(
    destinationSystemId,
    entity,
    mappings,
    sourceSystemId,
  )
  return mappings
}

/**
 * @param {string} text
 * @returns {{ source: MigrationSystemDef | null, destination: MigrationSystemDef | null }}
 */
export function inferMigrationEndpoints(text) {
  const hay = String(text || '').toLowerCase().trim()
  if (!hay) return { source: null, destination: null }

  const fromTo = hay.match(/(?:migrate|moving|move|from)\s+(.+?)\s+to\s+(.+?)(?:\.|$|,|\s+using|\s+into)/)
    || hay.match(/^(.+?)\s+to\s+(.+?)(?:\s+migration|$)/)

  if (fromTo) {
    return {
      source: inferMigrationSystems(fromTo[1])[0] || null,
      destination: inferMigrationSystems(fromTo[2])[0] || null,
    }
  }

  const matches = inferMigrationSystems(text)
  return {
    source: matches[0] || null,
    destination: matches[1] || null,
  }
}

/**
 * @param {string} text
 * @returns {MigrationSystemDef[]}
 */
export function inferMigrationSystems(text) {
  const hay = String(text || '').toLowerCase()
  if (!hay.trim()) return []

  const scored = MIGRATION_SYSTEM_CATALOG
    .filter((s) => s.id !== 'custom')
    .map((s) => {
      let score = 0
      for (const kw of s.keywords) {
        if (hay.includes(kw)) score += kw.length > 4 ? 3 : 2
      }
      if (hay.includes(s.id)) score += 4
      return { system: s, score }
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)

  return scored.map((row) => row.system)
}

/**
 * @param {MigrationSystemDef} system
 * @param {string[]} registeredRunners
 * @param {{ drivers?: Array<{ key: string, operational?: boolean, status?: string, canInstallFromUi?: boolean }> } | null} [capabilityStatus]
 */
export function resolveRunnerForSystem(system, registeredRunners, capabilityStatus = null) {
  const runners = new Set(registeredRunners || [])
  const driverRow = capabilityStatus?.drivers?.find((d) => d.key === system.preferredRunner)

  if (runners.has(system.preferredRunner)) {
    return { runner: system.preferredRunner, status: 'available', message: '' }
  }

  if (driverRow?.status === 'installed_needs_enable') {
    return {
      runner: system.preferredRunner,
      status: 'needs_enable',
      message: `${system.preferredRunner} driver is installed but not enabled. A platform admin can enable it under Connector drivers.`,
      driverKey: system.preferredRunner,
    }
  }

  if (driverRow && !driverRow.operational) {
    const installHint = driverRow.canInstallFromUi
      ? 'A platform admin can install it from Administration → Connector drivers.'
      : 'Install instructions are on Administration → Connector drivers.'
    return {
      runner: system.fallbackRunner,
      status: 'needs_install',
      message: `${system.preferredRunner} driver is not ready (${driverRow.status}). ${installHint}`,
      driverKey: system.preferredRunner,
    }
  }

  if (runners.has(system.fallbackRunner)) {
    return {
      runner: system.fallbackRunner,
      status: 'fallback',
      message: `${system.preferredRunner} is not enabled on this platform yet. Using ${system.fallbackRunner} for now.`,
      driverKey: system.preferredRunner,
    }
  }

  return {
    runner: system.fallbackRunner,
    status: 'missing_runner',
    message: `Neither ${system.preferredRunner} nor ${system.fallbackRunner} is available. Ask a platform admin to enable connector drivers.`,
    driverKey: system.preferredRunner,
  }
}

/**
 * Pick connector type row from catalog by runner or key.
 * @param {MigrationSystemDef} system
 * @param {string[]} registeredRunners
 * @param {Array<{ id: string, key: string, runner_key: string, name: string }>} connectorTypes
 * @param {{ drivers?: Array<{ key: string, operational?: boolean }> } | null} [capabilityStatus]
 */
export function pickConnectorTypeForSystem(system, registeredRunners, connectorTypes, capabilityStatus = null) {
  const { runner } = resolveRunnerForSystem(system, registeredRunners, capabilityStatus)
  const list = Array.isArray(connectorTypes) ? connectorTypes : []
  const byRunner = list.find((t) => t.runner_key === runner)
  if (byRunner) return byRunner
  const byPreferred = list.find((t) => t.runner_key === system.preferredRunner || t.key === system.preferredRunner)
  if (byPreferred) return byPreferred
  const byKey = list.find((t) => t.key === system.connectorTypeKey)
  if (byKey) return byKey
  return list[0] || null
}

/**
 * @param {string} database
 */
export function databaseLabel(database) {
  const map = {
    mysql: 'MySQL / MariaDB',
    postgresql: 'PostgreSQL',
    mssql: 'Microsoft SQL Server',
    mongodb: 'MongoDB',
    elasticsearch: 'Elasticsearch',
    oracle: 'Oracle Database',
    saas: 'SaaS / cloud API',
    file: 'Files / exports',
    api: 'REST API',
    unknown: 'Unknown',
  }
  return map[database] || database
}
