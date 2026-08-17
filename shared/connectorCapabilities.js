/**
 * Optional connector drivers (npm packages + runners).
 * Built-in runners (rest_generic, csv_file, json_file) need no install step.
 */

/** @typedef {'inbound'|'outbound'|'both'} ConnectorCapabilityDirection */

/** @typedef {{
 *   key: string,
 *   label: string,
 *   npmPackage: string,
 *   npmVersion: string,
 *   directions: ConnectorCapabilityDirection[],
 *   databases: string[],
 *   description: string,
 *   installNotes: string,
 * }} ConnectorDriverDef */

/** @type {ConnectorDriverDef[]} */
export const CONNECTOR_DRIVER_CATALOG = [
  {
    key: 'mysql',
    label: 'MySQL / MariaDB',
    npmPackage: 'mysql2',
    npmVersion: '^3.14.0',
    directions: ['inbound', 'outbound'],
    databases: ['mysql'],
    description: 'Direct MySQL read (SELECT) and batch write (INSERT) for migrations and data flows.',
    installNotes: 'Requires mysql2 on the Nitro server. Restart the app after installing in production.',
  },
  {
    key: 'postgres',
    label: 'PostgreSQL',
    npmPackage: 'pg',
    npmVersion: '^8.16.0',
    directions: ['inbound', 'outbound'],
    databases: ['postgresql'],
    description: 'PostgreSQL read/write — e.g. Zammad, custom Postgres targets.',
    installNotes: 'Requires pg on the Nitro server. Restart after install in production.',
  },
  {
    key: 'mssql',
    label: 'Microsoft SQL Server',
    npmPackage: 'mssql',
    npmVersion: '^11.0.1',
    directions: ['inbound', 'outbound'],
    databases: ['mssql'],
    description: 'SQL Server SELECT and INSERT via the tedious driver.',
    installNotes: 'Install mssql on the server host, then enable here.',
  },
  {
    key: 'mongodb',
    label: 'MongoDB',
    npmPackage: 'mongodb',
    npmVersion: '^6.16.0',
    directions: ['inbound', 'outbound'],
    databases: ['mongodb'],
    description: 'MongoDB find (inbound) and insertMany (outbound).',
    installNotes: 'Install mongodb driver, then enable and restart.',
  },
  {
    key: 'elasticsearch',
    label: 'Elasticsearch',
    npmPackage: '@elastic/elasticsearch',
    npmVersion: '^8.17.0',
    directions: ['inbound', 'outbound'],
    databases: ['elasticsearch'],
    description: 'Elasticsearch search (inbound) and bulk index (outbound).',
    installNotes: 'Install @elastic/elasticsearch, then enable and restart.',
  },
  {
    key: 'oracle',
    label: 'Oracle Database',
    npmPackage: 'oracledb',
    npmVersion: '^6.8.0',
    directions: ['inbound', 'outbound'],
    databases: ['oracle'],
    description: 'Oracle SELECT and INSERT. Requires Oracle Instant Client on the server.',
    installNotes: 'Install Oracle Instant Client, then npm install oracledb. Heavy native dependency.',
  },
  {
    key: 's3',
    label: 'S3 / object storage',
    npmPackage: '@aws-sdk/client-s3',
    npmVersion: '^3.758.0',
    directions: ['inbound', 'outbound'],
    databases: [],
    description: 'S3-compatible GetObject (inbound) and PutObject (outbound) for JSON/CSV files.',
    installNotes: 'Works with AWS S3, MinIO, and other S3-compatible endpoints.',
  },
  {
    key: 'sftp',
    label: 'SFTP',
    npmPackage: 'ssh2-sftp-client',
    npmVersion: '^12.0.0',
    directions: ['inbound', 'outbound'],
    databases: [],
    description: 'SFTP download (inbound) and upload (outbound) for JSON/CSV payloads.',
    installNotes: 'Install ssh2-sftp-client, then enable and restart.',
  },
]

/**
 * @param {string} key
 */
export function getConnectorDriver(key) {
  return CONNECTOR_DRIVER_CATALOG.find((d) => d.key === key) || null
}

/**
 * @param {Record<string, { enabled?: boolean }>} enabledMap
 */
export function normalizeEnabledRunners(enabledMap) {
  const src = enabledMap && typeof enabledMap === 'object' ? enabledMap : {}
  /** @type {Record<string, { enabled: boolean, enabledAt?: string, enabledBy?: string }>} */
  const out = {}
  for (const driver of CONNECTOR_DRIVER_CATALOG) {
    const row = src[driver.key]
    out[driver.key] = {
      enabled: Boolean(row?.enabled),
      enabledAt: row?.enabledAt ? String(row.enabledAt) : undefined,
      enabledBy: row?.enabledBy ? String(row.enabledBy) : undefined,
    }
  }
  return out
}

/**
 * @param {string} runnerKey
 * @param {Record<string, { enabled?: boolean }>} enabledMap
 */
export function isRunnerEnabledInSettings(runnerKey, enabledMap) {
  const map = normalizeEnabledRunners(enabledMap)
  return Boolean(map[runnerKey]?.enabled)
}

/**
 * @param {ConnectorDriverDef} driver
 * @param {{ cwd?: string, allowRemoteInstall?: boolean }} [opts]
 */
export function buildDriverInstallInstructions(driver, opts = {}) {
  const pkg = `${driver.npmPackage}@${driver.npmVersion}`
  const cwd = opts.cwd || process.cwd?.() || '.'
  const lines = [
    `# Install ${driver.label} driver (${driver.npmPackage})`,
    `cd ${cwd}`,
    `npm install ${pkg}`,
    '',
    '# Then restart the Nuxt/Nitro server',
    'npm run dev   # development',
    '# or redeploy / pm2 restart in production',
    '',
    '# Optional: allow in-app install (self-hosted only)',
    'ALLOW_PLATFORM_DRIVER_INSTALL=true',
  ]
  if (!opts.allowRemoteInstall) {
    lines.push('', '# In-app install is disabled on this host — run the commands above on the server.')
  }
  return lines.join('\n')
}
