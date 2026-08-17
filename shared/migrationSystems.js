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
    connectorTypeKey: 'rest_generic',
    notes: 'RT typically runs on MySQL/MariaDB. Enable the mysql driver under Administration → Connector drivers, then create a MySQL inbound connection.',
    keywords: ['request tracker', 'rt', 'rtir', 'best practical'],
  },
  {
    id: 'zammad',
    label: 'Zammad',
    database: 'postgresql',
    preferredRunner: 'postgres',
    fallbackRunner: 'rest_generic',
    connectorTypeKey: 'rest_generic',
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
    connectorTypeKey: 'csv_file',
    notes: 'Direct MySQL ingest is not on the platform yet — use CSV/SQL dump or REST bridge.',
    keywords: ['mysql', 'mariadb'],
  },
  {
    id: 'postgresql',
    label: 'PostgreSQL (generic)',
    database: 'postgresql',
    preferredRunner: 'postgres',
    fallbackRunner: 'csv_file',
    connectorTypeKey: 'csv_file',
    notes: 'Direct Postgres connectors are planned — use CSV export or REST until available.',
    keywords: ['postgres', 'postgresql', 'pg'],
  },
  {
    id: 'mssql',
    label: 'Microsoft SQL Server',
    database: 'mssql',
    preferredRunner: 'mssql',
    fallbackRunner: 'csv_file',
    connectorTypeKey: 'csv_file',
    notes: 'MSSQL runner not shipped yet — use CSV export or linked REST service.',
    keywords: ['mssql', 'sql server', 'sqlserver'],
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
    saas: 'SaaS / cloud API',
    file: 'Files / exports',
    api: 'REST API',
    unknown: 'Unknown',
  }
  return map[database] || database
}
