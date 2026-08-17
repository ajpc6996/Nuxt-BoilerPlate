import { proposeMigrationPlan } from '~~/server/utils/migrations/proposeMigrationPlan.js'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const organizationId = String(body?.organizationId || '')

  if (!organizationId) {
    throw createError({ statusCode: 400, statusMessage: 'organizationId is required' })
  }

  await requireOrgAdmin(event, organizationId)

  const proposed = await proposeMigrationPlan({
    description: body?.description,
    sourceSummary: body?.sourceSummary,
    destinationSummary: body?.destinationSummary,
    docsUrl: body?.docsUrl,
    entities: body?.entities,
  })

  return { proposed }
})
