/**
 * Merge connection (shared) + data-source (endpoint) config.
 * Data-source keys win on conflict.
 * @param {Record<string, unknown>} connectionConfig
 * @param {Record<string, unknown>} sourceConfig
 */
export function mergeConnectorConfig(connectionConfig, sourceConfig) {
  return {
    ...(connectionConfig && typeof connectionConfig === 'object' ? connectionConfig : {}),
    ...(sourceConfig && typeof sourceConfig === 'object' ? sourceConfig : {}),
  }
}
