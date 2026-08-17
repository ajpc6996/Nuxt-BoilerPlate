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
    description: 'Direct MySQL read (inbound) and batch write (outbound) for migrations and data flows.',
    installNotes: 'Requires the mysql2 native driver on the Nitro server. Restart the app after installing in production.',
  },
  {
    key: 'postgres',
    label: 'PostgreSQL',
    npmPackage: 'pg',
    npmVersion: '^8.16.0',
    directions: ['inbound', 'outbound'],
    databases: ['postgresql'],
    description: 'Direct PostgreSQL read/write — e.g. Zammad, custom Postgres targets.',
    installNotes: 'Requires the pg driver on the Nitro server. Restart the app after installing in production.',
  },
  {
    key: 'mssql',
    label: 'Microsoft SQL Server',
    npmPackage: 'mssql',
    npmVersion: '^11.0.1',
    directions: ['inbound', 'outbound'],
    databases: ['mssql'],
    description: 'SQL Server via tedious driver (planned for heavy migrations).',
    installNotes: 'Install mssql on the server host, then enable here. Large native dependency — prefer CSV/REST when possible.',
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
