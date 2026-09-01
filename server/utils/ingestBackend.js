/**
 * Per-organization ingest backend toggle.
 *
 * When organizations.ingest_backend = 'supabase' (default), we keep using the
 * existing Supabase RPC functions against the hosted warehouse.
 *
 * When organizations.ingest_backend = 'local', we call equivalent SQL
 * functions against a locally hosted Postgres database (INGEST_DATABASE_URL).
 *
 * Local DB must be bootstrapped with the ingest + staged schemas/functions
 * (and minimal public control tables required by those functions).
 */

const LOCAL_BACKEND_SYNC_CACHE_MS = 10 * 60 * 1000 // 10 minutes

/** @type {import('pg').Pool | null} */
let localPool = null

/** @type {Map<string, number>} */
const orgSyncedAt = new Map()

async function getLocalPool() {
  if (localPool) return localPool
  let pg
  try {
    pg = await import('pg')
  }
  catch {
    throw createError({
      statusCode: 500,
      statusMessage: 'pg driver is not installed on this server host.',
    })
  }

  const config = useRuntimeConfig()
  const connectionString = String(config.ingestDatabaseUrl || '').trim()
  if (!connectionString) {
    throw createError({
      statusCode: 500,
      statusMessage:
        'Local ingest backend requires INGEST_DATABASE_URL (server env) to be set.',
    })
  }

  localPool = new pg.Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
  })

  return localPool
}

/**
 * Sync minimal control-plane rows to local DB so ingest/report functions
 * that enforce FKs / validate allowed ingest destinations can work.
 *
 * Local DB needs tables:
 * - public.organizations(id uuid)
 * - public.connections(id uuid, organization_id uuid)
 * - public.data_sources(id uuid, organization_id uuid, destination_table text)
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {string} organizationId
 */
async function ensureLocalOrgSynced(admin, organizationId) {
  const orgId = String(organizationId || '').trim()
  if (!orgId) return

  const prevAt = orgSyncedAt.get(orgId)
  const now = Date.now()
  if (prevAt && now - prevAt < LOCAL_BACKEND_SYNC_CACHE_MS) return

  const pool = await getLocalPool()

  // Minimal rows. We only sync what local functions reference.
  const { data: orgRow, error: orgErr } = await admin
    .from('organizations')
    .select('id')
    .eq('id', orgId)
    .maybeSingle()

  if (orgErr) throw createError({ statusCode: 500, statusMessage: orgErr.message })
  if (!orgRow) return

  const { data: connections, error: connErr } = await admin
    .from('connections')
    .select('id, organization_id')
    .eq('organization_id', orgId)

  if (connErr) throw createError({ statusCode: 500, statusMessage: connErr.message })

  const { data: dataSources, error: dsErr } = await admin
    .from('data_sources')
    .select('id, organization_id, destination_table')
    .eq('organization_id', orgId)

  if (dsErr) throw createError({ statusCode: 500, statusMessage: dsErr.message })

  await pool.query(
    'insert into public.organizations (id) values ($1) on conflict (id) do nothing',
    [orgId],
  )

  for (const c of connections || []) {
    await pool.query(
      'insert into public.connections (id, organization_id) values ($1, $2) on conflict (id) do update set organization_id = excluded.organization_id',
      [c.id, c.organization_id],
    )
  }

  for (const ds of dataSources || []) {
    await pool.query(
      'insert into public.data_sources (id, organization_id, destination_table) values ($1, $2, $3) on conflict (id) do update set organization_id = excluded.organization_id, destination_table = excluded.destination_table',
      [ds.id, ds.organization_id, ds.destination_table],
    )
  }

  orgSyncedAt.set(orgId, now)
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {string} organizationId
 */
export async function getIngestBackend(admin, organizationId) {
  const orgId = String(organizationId || '').trim()
  if (!orgId) {
    throw createError({ statusCode: 400, statusMessage: 'organizationId is required' })
  }

  /** @type {'supabase'|'local'} */
  let ingestBackendMode = 'supabase'
  const { data: org, error: orgErr } = await admin
    .from('organizations')
    .select('ingest_backend')
    .eq('id', orgId)
    .maybeSingle()

  if (orgErr) {
    throw createError({ statusCode: 500, statusMessage: orgErr.message })
  }
  ingestBackendMode = (org?.ingest_backend === 'local' ? 'local' : 'supabase')

  if (ingestBackendMode === 'supabase') {
    return createSupabaseIngestBackend(admin)
  }

  return createLocalIngestBackend(admin, orgId)
}

function createSupabaseIngestBackend(admin) {
  return {
    /**
     * @param {number} ttlMinutes
     */
    async stagedCleanupStale(ttlMinutes) {
      const { error } = await admin.rpc('staged_cleanup_stale', {
        p_ttl_minutes: ttlMinutes,
      })
      if (error) throw createError({ statusCode: 500, statusMessage: error.message })
      return true
    },

    async ingestAppendRows({ table, organizationId, connectionId, runId, rows, cycleTime }) {
      const { data, error } = await admin.rpc('ingest_append_rows', {
        p_table: table,
        p_organization_id: organizationId,
        p_connection_id: connectionId,
        p_run_id: runId,
        p_rows: rows,
        p_cycle_time: cycleTime,
      })
      if (error) throw createError({ statusCode: 500, statusMessage: error.message })
      return Number(data) || 0
    },

    async ingestReplaceRows({ table, organizationId, connectionId, runId, rows, cycleTime }) {
      const { data, error } = await admin.rpc('ingest_replace_rows', {
        p_table: table,
        p_organization_id: organizationId,
        p_connection_id: connectionId,
        p_run_id: runId,
        p_rows: rows,
        p_cycle_time: cycleTime,
      })
      if (error) throw createError({ statusCode: 500, statusMessage: error.message })
      return Number(data) || 0
    },

    async ingestCleanupExpired({ table, organizationId, connectionId, retentionDays }) {
      const { data, error } = await admin.rpc('ingest_cleanup_expired', {
        p_table: table,
        p_organization_id: organizationId,
        p_connection_id: connectionId,
        p_retention_days: retentionDays,
      })
      if (error) throw createError({ statusCode: 500, statusMessage: error.message })
      return Number(data) || 0
    },

    async stagedCountOrg(organizationId) {
      const { data, error } = await admin.rpc('staged_count_org', {
        p_organization_id: organizationId,
      })
      if (error) throw createError({ statusCode: 500, statusMessage: error.message })
      return Number(data) || 0
    },

    async stagedAppendRows({ organizationId, connectionId, dataSourceId, runId, batchNo, rows }) {
      const { data, error } = await admin.rpc('staged_append_rows', {
        p_organization_id: organizationId,
        p_connection_id: connectionId,
        p_data_source_id: dataSourceId,
        p_run_id: runId,
        p_batch_no: batchNo,
        p_rows: rows,
      })
      if (error) throw createError({ statusCode: 500, statusMessage: error.message })
      return Number(data) || 0
    },

    async stagedDeleteBatch({ runId, batchNo }) {
      const { data, error } = await admin.rpc('staged_delete_batch', {
        p_run_id: runId,
        p_batch_no: batchNo,
      })
      if (error) throw createError({ statusCode: 500, statusMessage: error.message })
      return Number(data) || 0
    },

    async stagedDeleteRun({ runId }) {
      const { data, error } = await admin.rpc('staged_delete_run', { p_run_id: runId })
      if (error) throw createError({ statusCode: 500, statusMessage: error.message })
      return Number(data) || 0
    },

    async ingestReadRows({ table, organizationId, connectionId, limit }) {
      const { data, error } = await admin.rpc('ingest_read_rows', {
        p_table: table,
        p_organization_id: organizationId,
        p_connection_id: connectionId || null,
        p_limit: limit,
      })
      if (error) throw createError({ statusCode: 500, statusMessage: error.message })
      return Array.isArray(data) ? data : []
    },

    async ingestLookupDistinct({ table, columns, organizationId, limit }) {
      const { data, error } = await admin.rpc('ingest_lookup_distinct', {
        p_table: table,
        p_columns: columns,
        p_organization_id: organizationId,
        p_limit: limit,
      })
      if (error) throw createError({ statusCode: 500, statusMessage: error.message })
      return Array.isArray(data) ? data : (data || [])
    },

    async reportRunQuery({ organizationId, sources, joins, fields, limit }) {
      const { data, error } = await admin.rpc('report_run_query', {
        p_organization_id: organizationId,
        p_sources: sources,
        p_joins: joins || [],
        p_fields: fields || [],
        p_limit: limit,
      })
      if (error) throw createError({ statusCode: 500, statusMessage: error.message })
      return Array.isArray(data) ? data : (data || [])
    },

    async dashboardRunQuery({
      organizationId,
      sources,
      joins,
      dimensions,
      metrics,
      filters,
      seriesField,
      limit,
      orderBy,
    }) {
      /** @type {Record<string, unknown>} */
      const payload = {
        p_organization_id: organizationId,
        p_sources: sources,
        p_joins: joins || [],
        p_dimensions: dimensions || [],
        p_metrics: metrics || [],
        p_filters: filters || [],
        p_series_field: seriesField || null,
        p_limit: limit,
      }

      // p_order_by was added in a later function signature; omit when not
      // provided so older local/supabase schemas still resolve with defaults.
      if (orderBy != null) {
        payload.p_order_by = orderBy
      }

      const { data, error } = await admin.rpc('dashboard_run_query', payload)
      if (error) throw createError({ statusCode: 500, statusMessage: error.message })
      return Array.isArray(data) ? data : (data || [])
    },

    async licencePurgeIngestRows(organizationId) {
      const { data, error } = await admin.rpc('licence_purge_ingest_rows', {
        p_organization_id: organizationId,
      })
      if (error) throw createError({ statusCode: 500, statusMessage: error.message })
      return BigInt(data || 0)
    },
  }
}

function createLocalIngestBackend(admin, organizationId) {
  const orgId = String(organizationId || '').trim()

  return {
    async stagedCleanupStale(ttlMinutes) {
      await ensureLocalOrgSynced(admin, orgId)
      const pool = await getLocalPool()
      const { rows } = await pool.query(
        'select public.staged_cleanup_stale($1::integer) as result',
        [ttlMinutes],
      )
      return Number(rows?.[0]?.result) || 0
    },

    async ingestAppendRows({ table, organizationId, connectionId, runId, rows, cycleTime }) {
      await ensureLocalOrgSynced(admin, organizationId)
      const pool = await getLocalPool()
      const payload = JSON.stringify(rows || [])
      const { rows: res } = await pool.query(
        'select public.ingest_append_rows($1::text,$2::uuid,$3::uuid,$4::uuid,$5::jsonb,$6::timestamptz) as result',
        [table, organizationId, connectionId, runId, payload, cycleTime],
      )
      return Number(res?.[0]?.result) || 0
    },

    async ingestReplaceRows({ table, organizationId, connectionId, runId, rows, cycleTime }) {
      await ensureLocalOrgSynced(admin, organizationId)
      const pool = await getLocalPool()
      const payload = JSON.stringify(rows || [])
      const { rows: res } = await pool.query(
        'select public.ingest_replace_rows($1::text,$2::uuid,$3::uuid,$4::uuid,$5::jsonb,$6::timestamptz) as result',
        [table, organizationId, connectionId, runId, payload, cycleTime],
      )
      return Number(res?.[0]?.result) || 0
    },

    async ingestCleanupExpired({ table, organizationId, connectionId, retentionDays }) {
      await ensureLocalOrgSynced(admin, organizationId)
      const pool = await getLocalPool()
      const { rows: res } = await pool.query(
        'select public.ingest_cleanup_expired($1::text,$2::uuid,$3::uuid,$4::integer) as result',
        [table, organizationId, connectionId, retentionDays],
      )
      return Number(res?.[0]?.result) || 0
    },

    async stagedCountOrg(organizationId) {
      await ensureLocalOrgSynced(admin, organizationId)
      const pool = await getLocalPool()
      const { rows: res } = await pool.query(
        'select public.staged_count_org($1::uuid) as result',
        [organizationId],
      )
      return Number(res?.[0]?.result) || 0
    },

    async stagedAppendRows({ organizationId, connectionId, dataSourceId, runId, batchNo, rows }) {
      await ensureLocalOrgSynced(admin, organizationId)
      const pool = await getLocalPool()
      const payload = JSON.stringify(rows || [])
      const { rows: res } = await pool.query(
        'select public.staged_append_rows($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::integer,$6::jsonb) as result',
        [organizationId, connectionId, dataSourceId, runId, batchNo, payload],
      )
      return Number(res?.[0]?.result) || 0
    },

    async stagedDeleteBatch({ runId, batchNo }) {
      const pool = await getLocalPool()
      const { rows: res } = await pool.query(
        'select public.staged_delete_batch($1::uuid,$2::integer) as result',
        [runId, batchNo],
      )
      return Number(res?.[0]?.result) || 0
    },

    async stagedDeleteRun({ runId }) {
      const pool = await getLocalPool()
      const { rows: res } = await pool.query(
        'select public.staged_delete_run($1::uuid) as result',
        [runId],
      )
      return Number(res?.[0]?.result) || 0
    },

    async ingestReadRows({ table, organizationId, connectionId, limit }) {
      await ensureLocalOrgSynced(admin, organizationId)
      const pool = await getLocalPool()
      const { rows: res } = await pool.query(
        'select public.ingest_read_rows($1::text,$2::uuid,$3::uuid,$4::integer) as result',
        [table, organizationId, connectionId || null, limit],
      )
      return Array.isArray(res?.[0]?.result) ? res[0].result : (res?.[0]?.result || [])
    },

    async ingestLookupDistinct({ table, columns, organizationId, limit }) {
      await ensureLocalOrgSynced(admin, organizationId)
      const pool = await getLocalPool()
      const { rows: res } = await pool.query(
        'select public.ingest_lookup_distinct($1::text,$2::text[],$3::uuid,$4::integer) as result',
        [table, columns || [], organizationId, limit || 100],
      )
      return Array.isArray(res?.[0]?.result) ? res[0].result : (res?.[0]?.result || [])
    },

    async reportRunQuery({ organizationId, sources, joins, fields, limit }) {
      await ensureLocalOrgSynced(admin, organizationId)
      const pool = await getLocalPool()
      const { rows: res } = await pool.query(
        'select public.report_run_query($1::uuid,$2::jsonb,$3::jsonb,$4::jsonb,$5::integer) as result',
        [
          organizationId,
          JSON.stringify(sources || []),
          JSON.stringify(joins || []),
          JSON.stringify(fields || []),
          limit,
        ],
      )
      return Array.isArray(res?.[0]?.result) ? res[0].result : (res?.[0]?.result || [])
    },

    async dashboardRunQuery({
      organizationId,
      sources,
      joins,
      dimensions,
      metrics,
      filters,
      seriesField,
      limit,
      orderBy,
    }) {
      await ensureLocalOrgSynced(admin, organizationId)
      const pool = await getLocalPool()

      // When p_order_by is not passed, rely on the function default.
      if (orderBy == null) {
        const { rows: res } = await pool.query(
          'select public.dashboard_run_query($1::uuid,$2::jsonb,$3::jsonb,$4::jsonb,$5::jsonb,$6::jsonb,$7::text,$8::integer) as result',
          [
            organizationId,
            JSON.stringify(sources || []),
            JSON.stringify(joins || []),
            JSON.stringify(dimensions || []),
            JSON.stringify(metrics || []),
            JSON.stringify(filters || []),
            seriesField || null,
            limit,
          ],
        )
        return Array.isArray(res?.[0]?.result) ? res[0].result : (res?.[0]?.result || [])
      }

      const { rows: res } = await pool.query(
        'select public.dashboard_run_query($1::uuid,$2::jsonb,$3::jsonb,$4::jsonb,$5::jsonb,$6::jsonb,$7::text,$8::integer,$9::jsonb) as result',
        [
          organizationId,
          JSON.stringify(sources || []),
          JSON.stringify(joins || []),
          JSON.stringify(dimensions || []),
          JSON.stringify(metrics || []),
          JSON.stringify(filters || []),
          seriesField || null,
          limit,
          JSON.stringify(orderBy || {}),
        ],
      )
      return Array.isArray(res?.[0]?.result) ? res[0].result : (res?.[0]?.result || [])
    },

    async licencePurgeIngestRows(organizationId) {
      await ensureLocalOrgSynced(admin, organizationId)
      const pool = await getLocalPool()
      const { rows: res } = await pool.query(
        'select public.licence_purge_ingest_rows($1::uuid) as result',
        [organizationId],
      )
      const v = res?.[0]?.result
      try {
        return BigInt(v || 0)
      }
      catch {
        return BigInt(Number(v) || 0)
      }
    },
  }
}

