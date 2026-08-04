/**
 * $fetch wrapper that attaches the current Supabase access token.
 */
export function useAuthedFetch() {
  const supabase = useSupabase()

  /**
   * @param {string} url
   * @param {import('ofetch').FetchOptions} [opts]
   */
  return async (url, opts = {}) => {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    const headers = {
      ...(opts.headers || {}),
    }

    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`
    }

    return $fetch(url, {
      ...opts,
      headers,
    })
  }
}
