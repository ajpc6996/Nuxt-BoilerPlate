import { listConnectorCapabilityStatus } from '~~/server/utils/connectors/capabilities.js'

export default defineEventHandler(async (event) => {
  await requirePlatformAdmin(event)
  const admin = useSupabaseAdmin()
  return listConnectorCapabilityStatus(admin)
})
