import { disableConnectorDriver } from '~~/server/utils/connectors/capabilities.js'

export default defineEventHandler(async (event) => {
  const key = getRouterParam(event, 'key')
  if (!key) {
    throw createError({ statusCode: 400, statusMessage: 'Driver key is required' })
  }

  const { user } = await requirePlatformAdmin(event)
  const admin = useSupabaseAdmin()
  return disableConnectorDriver(admin, key, user.id)
})
