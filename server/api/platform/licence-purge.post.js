/**
 * Platform: run due licence data purges (retention elapsed).
 * Optional body: { organizationId } to purge one org (force if locked + due, or force: true).
 */
export default defineEventHandler(async (event) => {
  await requirePlatformAdmin(event)
  const body = await readBody(event).catch(() => ({}))
  const admin = useSupabaseAdmin()

  const organizationId = body?.organizationId ? String(body.organizationId) : ''
  if (organizationId) {
    const licence = await resolveOrgLicence(admin, organizationId)
    if (body?.force) {
      const purged = await purgeOrgRetainedData(admin, organizationId)
      return { mode: 'single', force: true, ...purged }
    }
    const purged = await maybePurgeOrgData(admin, {
      organizationId,
      status: licence.status,
      dataPurgeAt: licence.dataPurgeAt,
      dataPurgedAt: licence.dataPurgedAt,
      force: false,
    })
    if (!purged) {
      return {
        mode: 'single',
        skipped: true,
        status: licence.status,
        dataPurgeAt: licence.dataPurgeAt,
        dataPurgedAt: licence.dataPurgedAt,
        message: 'Not due for purge yet (or already purged)',
      }
    }
    return { mode: 'single', ...purged }
  }

  const batch = await processDueLicencePurges(admin)
  return { mode: 'batch', ...batch }
})
