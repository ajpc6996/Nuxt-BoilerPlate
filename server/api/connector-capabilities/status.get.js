import { listConnectorCapabilityStatus } from '~~/server/utils/connectors/capabilities.js'

/** Org admins + platform admin — read driver status for migration setup. */
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const organizationId = String(query.organizationId || '')
  if (!organizationId) {
    throw createError({ statusCode: 400, statusMessage: 'organizationId is required' })
  }

  await requireOrgAdmin(event, organizationId)
  const admin = useSupabaseAdmin()
  return listConnectorCapabilityStatus(admin)
})
