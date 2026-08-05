import { proposeConnectorType } from '~~/server/utils/connectors/proposeConnectorType.js'

export default defineEventHandler(async (event) => {
  await requirePlatformAdmin(event)
  const body = await readBody(event)

  const proposed = await proposeConnectorType({
    description: body?.description,
    docsUrl: body?.docsUrl,
    sampleCurl: body?.sampleCurl,
  })

  return { proposed }
})
