/**
 * Local data adapter — Client-Side Row Model.
 * Pass a row array, or a sync/async function that returns rows.
 *
 * @param {object[] | (() => (object[] | Promise<object[]>))} source
 */
export function createLocalDataAdapter(source) {
  return {
    mode: 'local',
    /**
     * @returns {Promise<object[]>}
     */
    async load() {
      const data = typeof source === 'function' ? await source() : source
      return Array.isArray(data) ? data : []
    },
  }
}

/**
 * REST data adapter — Infinite Row Model (lazy load as the user scrolls).
 *
 * Expected default API shape: `{ rows: object[], lastRow: number }`
 * where `lastRow` is the total row count (or `-1` if unknown).
 *
 * @param {object} options
 * @param {string} options.url
 * @param {number} [options.blockSize=50]
 * @param {(params: object) => Record<string, string|number|boolean|undefined|null>} [options.mapParams]
 * @param {(json: any, params: object) => { rows: object[], lastRow: number }} [options.mapResponse]
 * @param {RequestInit | ((params: object) => RequestInit)} [options.fetchOptions]
 */
export function createRestDataAdapter(options = {}) {
  const {
    url,
    blockSize = 50,
    mapParams,
    mapResponse,
    fetchOptions,
  } = options

  if (!url) {
    throw new Error('createRestDataAdapter requires a url')
  }

  return {
    mode: 'rest',
    blockSize,
    createDatasource() {
      return {
        getRows: async (params) => {
          try {
            const query = mapParams
              ? mapParams(params)
              : {
                  startRow: params.startRow,
                  endRow: params.endRow,
                }

            const search = new URLSearchParams()
            Object.entries(query || {}).forEach(([key, value]) => {
              if (value !== undefined && value !== null) {
                search.set(key, String(value))
              }
            })

            const init =
              typeof fetchOptions === 'function'
                ? fetchOptions(params)
                : fetchOptions

            const response = await fetch(
              `${url}${search.size ? `?${search}` : ''}`,
              init,
            )

            if (!response.ok) {
              throw new Error(`Grid request failed (${response.status})`)
            }

            const json = await response.json()
            const mapped = mapResponse
              ? mapResponse(json, params)
              : {
                  rows: json.rows ?? json.data ?? [],
                  lastRow:
                    json.lastRow ??
                    json.total ??
                    json.totalCount ??
                    -1,
                }

            params.successCallback(mapped.rows || [], mapped.lastRow)
          } catch (error) {
            console.error('[createRestDataAdapter]', error)
            params.failCallback()
          }
        },
      }
    },
  }
}
