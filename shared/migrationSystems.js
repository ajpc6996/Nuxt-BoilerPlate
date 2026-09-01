/**
 * Known migration source/destination systems and database hints.
 * preferredRunner may not be registered yet — use fallbackRunner for today's platform.
 */

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
  return MIGRATION_SYSTEM_CATALOG.find((s) => s.id === id) || MIGRATION_SYSTEM_CATALOG.find((s) => s.id === 'custom')
}

/**
 * Known NOT NULL / audit defaults for destination systems (applied when missing from mappings).
 * `__NOW__` is resolved at transform runtime to an ISO timestamp.
 * `force: true` replaces any existing mapping to that destination (fixes bad AI maps like SortOrder→active).
 * @type {Record<string, Record<string, Array<{ destination: string, constantValue: unknown, required?: boolean, force?: boolean }>>>}
 */
export const SYSTEM_DESTINATION_DEFAULTS = {
  zammad: {
    users: [
      { destination: 'created_by_id', constantValue: 1, required: true },
      { destination: 'updated_by_id', constantValue: 1, required: true },
      { destination: 'created_at', constantValue: '__NOW__', required: true },
      { destination: 'updated_at', constantValue: '__NOW__', required: true },
      { destination: 'active', constantValue: true, required: false, force: true },
    ],
    groups: [
      { destination: 'created_by_id', constantValue: 1, required: true },
      { destination: 'updated_by_id', constantValue: 1, required: true },
      { destination: 'created_at', constantValue: '__NOW__', required: true },
      { destination: 'updated_at', constantValue: '__NOW__', required: true },
      // Booleans — never accept RT SortOrder/ids (e.g. "2") into these columns
      { destination: 'active', constantValue: true, required: false, force: true },
      { destination: 'shared_drafts', constantValue: true, required: false, force: true },
      { destination: 'follow_up_assignment', constantValue: true, required: false, force: true },
      { destination: 'follow_up_possible', constantValue: 'yes', required: false },
    ],
    tickets: [
      { destination: 'created_by_id', constantValue: 1, required: true },
      { destination: 'updated_by_id', constantValue: 1, required: true },
      { destination: 'created_at', constantValue: '__NOW__', required: true },
      { destination: 'updated_at', constantValue: '__NOW__', required: true },
      // Required FKs — only when missing (status/priority maps may fill these)
      { destination: 'group_id', constantValue: 1, required: true },
      { destination: 'customer_id', constantValue: 1, required: true },
      { destination: 'owner_id', constantValue: 1, required: false },
      { destination: 'state_id', constantValue: 2, required: true },
      { destination: 'priority_id', constantValue: 2, required: true },
    ],
    articles: [
      { destination: 'created_by_id', constantValue: 1, required: true },
      { destination: 'updated_by_id', constantValue: 1, required: true },
      { destination: 'created_at', constantValue: '__NOW__', required: true },
      { destination: 'updated_at', constantValue: '__NOW__', required: true },
    ],
  },
}

/** Map source-side entity keys to destination catalog keys for defaults. */
export const SYSTEM_DESTINATION_ENTITY_ALIASES = {
  zammad: {
    queues: 'groups',
    queue: 'groups',
    group: 'groups',
    transactions: 'articles',
    transaction: 'articles',
    article: 'articles',
    ticket: 'tickets',
    user: 'users',
  },
}
export const SYSTEM_BOOLEAN_DESTINATIONS = {
  zammad: new Set([
    'active',
    'shared_drafts',
    'follow_up_assignment',
    'out_of_office',
    'vip',
  ]),
}

/**
 * Default Zammad ticket_states ids (fresh install). Custom statuses need operator map overrides.
 * Used when RT Status *names* (e.g. "approved") are mapped into integer state_id.
 */
export const ZAMMAD_TICKET_STATE_NAME_MAP = {
  new: 1,
  open: 2,
  stalled: 3,
  pending: 3,
  'pending reminder': 3,
  'pending close': 6,
  waiting: 3,
  resolved: 4,
  closed: 4,
  rejected: 4,
  deleted: 4,
  merged: 5,
  approved: 2,
  approval: 2,
  'in progress': 2,
  working: 2,
}

/** RT priority labels / common ranks → default Zammad ticket_priorities (1 low, 2 normal, 3 high). */
export const ZAMMAD_TICKET_PRIORITY_NAME_MAP = {
  low: 1,
  lowest: 1,
  normal: 2,
  medium: 2,
  high: 3,
  highest: 3,
  '0': 1,
  '1': 1,
  '2': 2,
  '3': 3,
  '4': 3,
  '5': 3,
}

/**
 * @param {string} dest
 * @param {Set<string> | undefined} boolDest
 */
export function isIntegerDestinationField(dest, boolDest) {
  const d = String(dest || '').trim().toLowerCase()
  if (!d || boolDest?.has(d)) return false
  if (d === 'id' || d.endsWith('_id')) return true
  return ['article_count', 'time_unit', 'assignment_timeout', 'reopen_time_in_days'].includes(d)
}

/**
 * Upgrade Status/Priority name copies into map transforms so Postgres never sees "approved" in state_id.
 * @param {string} systemId
 * @param {string} entityKey
 * @param {Array<Record<string, unknown>>} mappings
 */
export function enrichMappingsWithLookupMaps(systemId, entityKey, mappings) {
  const system = String(systemId || '').trim().toLowerCase()
  let entity = String(entityKey || '').trim().toLowerCase()
  entity = SYSTEM_DESTINATION_ENTITY_ALIASES[system]?.[entity] || entity
  if (system !== 'zammad' || entity !== 'tickets') {
    return Array.isArray(mappings) ? mappings : []
  }

  return (Array.isArray(mappings) ? mappings : []).map((m) => {
    const dest = String(m?.destination || '').trim().toLowerCase()
    const transform = String(m?.transform || m?.op || 'copy').trim()
    if (transform === 'constant') return m

    if (dest === 'state_id') {
      const existing = m.mapValues && typeof m.mapValues === 'object' ? m.mapValues : {}
      return {
        ...m,
        transform: 'map',
        mapValues: { ...ZAMMAD_TICKET_STATE_NAME_MAP, ...existing },
        constantValue: m.constantValue !== undefined && m.constantValue !== null && m.constantValue !== ''
          ? m.constantValue
          : 2,
        notes: m.notes || 'RT status names → Zammad state_id (default open=2)',
      }
    }

    if (dest === 'priority_id') {
      const existing = m.mapValues && typeof m.mapValues === 'object' ? m.mapValues : {}
      return {
        ...m,
        transform: 'map',
        mapValues: { ...ZAMMAD_TICKET_PRIORITY_NAME_MAP, ...existing },
        constantValue: m.constantValue !== undefined && m.constantValue !== null && m.constantValue !== ''
          ? m.constantValue
          : 2,
        notes: m.notes || 'RT priority → Zammad priority_id (default normal=2)',
      }
    }

    return m
  })
}

/**
 * Merge system-required constant destination fields into mappings when absent.
 * @param {string} systemId
 * @param {string} entityKey
 * @param {Array<Record<string, unknown>>} mappings
 */
export function enrichMappingsWithSystemDefaults(systemId, entityKey, mappings) {
  let list = Array.isArray(mappings) ? [...mappings] : []
  const system = String(systemId || '').trim().toLowerCase()
  let entity = String(entityKey || '').trim().toLowerCase()
  entity = SYSTEM_DESTINATION_ENTITY_ALIASES[system]?.[entity] || entity
  const defaults = SYSTEM_DESTINATION_DEFAULTS[system]?.[entity]
  if (!defaults?.length) return list

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
