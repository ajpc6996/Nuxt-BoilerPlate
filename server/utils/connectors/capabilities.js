import {
  CONNECTOR_DRIVER_CATALOG,
  getConnectorDriver,
  isRunnerEnabledInSettings,
  normalizeEnabledRunners,
  buildDriverInstallInstructions,
} from '~~/shared/connectorCapabilities.js'

const BUILTIN_RUNNERS = ['json_file', 'csv_file', 'rest_generic']

/** @type {Record<string, boolean | null>} */
const packageCache = {}

/**
 * @param {string} packageName
 */
export async function isNpmPackageAvailable(packageName) {
  if (packageCache[packageName] != null) return packageCache[packageName]
  try {
    await import(/* @vite-ignore */ packageName)
    packageCache[packageName] = true
    return true
  }
  catch {
    packageCache[packageName] = false
    return false
  }
}

export function clearPackageCache() {
  for (const key of Object.keys(packageCache)) delete packageCache[key]
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} [admin]
 */
export async function loadEnabledRunnersMap(admin) {
  const client = admin || useSupabaseAdmin()
  const { data, error } = await client
    .from('platform_system_settings')
    .select('enabled_runners')
    .eq('id', 1)
    .maybeSingle()

  if (error) {
    console.warn('[connector-capabilities] load enabled_runners failed', error.message)
    return normalizeEnabledRunners({})
  }

  return normalizeEnabledRunners(data?.enabled_runners)
}

/**
 * @param {string} runnerKey
 * @param {Record<string, { enabled?: boolean }>} enabledMap
 */
export async function isRunnerOperational(runnerKey, enabledMap) {
  if (BUILTIN_RUNNERS.includes(runnerKey)) return true
  const driver = getConnectorDriver(runnerKey)
  if (!driver) return false
  if (!isRunnerEnabledInSettings(runnerKey, enabledMap)) return false
  return isNpmPackageAvailable(driver.npmPackage)
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} [admin]
 */
export async function listOperationalRunnerKeys(admin) {
  const enabledMap = await loadEnabledRunnersMap(admin)
  const keys = [...BUILTIN_RUNNERS]
  for (const driver of CONNECTOR_DRIVER_CATALOG) {
    if (await isRunnerOperational(driver.key, enabledMap)) {
      keys.push(driver.key)
    }
  }
  return keys
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} [admin]
 */
export async function listConnectorCapabilityStatus(admin) {
  const enabledMap = await loadEnabledRunnersMap(admin)
  const allowRemoteInstall = canInstallDriversFromPlatform()

  const rows = []
  for (const driver of CONNECTOR_DRIVER_CATALOG) {
    const installed = await isNpmPackageAvailable(driver.npmPackage)
    const enabled = isRunnerEnabledInSettings(driver.key, enabledMap)
    const operational = BUILTIN_RUNNERS.includes(driver.key)
      ? true
      : (enabled && installed)

    let status = 'missing_package'
    if (operational) status = 'ready'
    else if (enabled && !installed) status = 'enabled_needs_install'
    else if (installed && !enabled) status = 'installed_needs_enable'
    else if (!installed && !enabled) status = 'missing_package'

    rows.push({
      key: driver.key,
      label: driver.label,
      npmPackage: driver.npmPackage,
      npmVersion: driver.npmVersion,
      directions: driver.directions,
      databases: driver.databases,
      description: driver.description,
      enabled,
      installed,
      operational,
      status,
      canInstallFromUi: allowRemoteInstall && !installed,
      canEnable: installed && !enabled,
      installInstructions: buildDriverInstallInstructions(driver, {
        cwd: process.cwd?.(),
        allowRemoteInstall,
      }),
      settings: enabledMap[driver.key] || { enabled: false },
    })
  }

  return {
    allowRemoteInstall,
    builtInRunners: BUILTIN_RUNNERS,
    drivers: rows,
  }
}

export function canInstallDriversFromPlatform() {
  if (process.env.ALLOW_PLATFORM_DRIVER_INSTALL === 'true') return true
  return process.env.NODE_ENV === 'development'
}

/**
 * @param {string} runnerKey
 */
export async function installConnectorDriverPackage(runnerKey) {
  const driver = getConnectorDriver(runnerKey)
  if (!driver) {
    throw createError({ statusCode: 404, statusMessage: 'Unknown driver' })
  }
  if (!canInstallDriversFromPlatform()) {
    throw createError({
      statusCode: 403,
      statusMessage: 'In-app driver install is disabled. Set ALLOW_PLATFORM_DRIVER_INSTALL=true or run npm on the server.',
    })
  }

  const pkg = `${driver.npmPackage}@${driver.npmVersion}`
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const execFileAsync = promisify(execFile)

  try {
    await execFileAsync('npm', ['install', pkg], {
      cwd: process.cwd(),
      timeout: 120_000,
      env: { ...process.env, npm_config_audit: 'false' },
    })
  }
  catch (err) {
    throw createError({
      statusCode: 500,
      statusMessage: `npm install failed: ${err?.message || 'unknown error'}`,
    })
  }

  clearPackageCache()
  const installed = await isNpmPackageAvailable(driver.npmPackage)
  if (!installed) {
    throw createError({
      statusCode: 500,
      statusMessage: `${driver.npmPackage} was installed but could not be loaded. Restart the server and try Enable.`,
    })
  }

  return { installed: true, package: driver.npmPackage }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {string} runnerKey
 * @param {string} userId
 */
export async function enableConnectorDriver(admin, runnerKey, userId) {
  const driver = getConnectorDriver(runnerKey)
  if (!driver) {
    throw createError({ statusCode: 404, statusMessage: 'Unknown driver' })
  }

  const installed = await isNpmPackageAvailable(driver.npmPackage)
  if (!installed) {
    throw createError({
      statusCode: 400,
      statusMessage: `${driver.npmPackage} is not installed on this server. Install the driver first.`,
    })
  }

  const enabledMap = await loadEnabledRunnersMap(admin)
  enabledMap[runnerKey] = {
    enabled: true,
    enabledAt: new Date().toISOString(),
    enabledBy: userId,
  }

  const { error } = await admin
    .from('platform_system_settings')
    .update({
      enabled_runners: enabledMap,
      updated_at: new Date().toISOString(),
      updated_by: userId,
    })
    .eq('id', 1)

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  await admin
    .from('connector_types')
    .update({ is_enabled: true })
    .eq('runner_key', runnerKey)

  clearPackageCache()
  return { enabled: true, runnerKey }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {string} runnerKey
 * @param {string} userId
 */
export async function disableConnectorDriver(admin, runnerKey, userId) {
  const driver = getConnectorDriver(runnerKey)
  if (!driver) {
    throw createError({ statusCode: 404, statusMessage: 'Unknown driver' })
  }

  const enabledMap = await loadEnabledRunnersMap(admin)
  enabledMap[runnerKey] = {
    enabled: false,
    enabledAt: enabledMap[runnerKey]?.enabledAt,
    enabledBy: enabledMap[runnerKey]?.enabledBy,
  }

  const { error } = await admin
    .from('platform_system_settings')
    .update({
      enabled_runners: enabledMap,
      updated_at: new Date().toISOString(),
      updated_by: userId,
    })
    .eq('id', 1)

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  await admin
    .from('connector_types')
    .update({ is_enabled: false })
    .eq('runner_key', runnerKey)

  return { enabled: false, runnerKey }
}
