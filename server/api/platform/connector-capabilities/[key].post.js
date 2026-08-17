import {
  enableConnectorDriver,
  installConnectorDriverPackage,
} from '~~/server/utils/connectors/capabilities.js'

export default defineEventHandler(async (event) => {
  const key = getRouterParam(event, 'key')
  const body = await readBody(event)
  const action = String(body?.action || 'install')

  if (!key) {
    throw createError({ statusCode: 400, statusMessage: 'Driver key is required' })
  }

  const { user } = await requirePlatformAdmin(event)
  const admin = useSupabaseAdmin()

  if (action === 'enable') {
    return enableConnectorDriver(admin, key, user.id)
  }

  await installConnectorDriverPackage(key)
  return enableConnectorDriver(admin, key, user.id)
})
