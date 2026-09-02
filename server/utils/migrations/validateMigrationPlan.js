import { validateMigrationPlan } from '~~/shared/validateMigrationPlan.js'
import { loadMigrationProject, loadMigrationStages } from '~~/server/utils/migrations.js'

/**
 * Validate a migration project plan + stages.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {{ projectId: string, organizationId: string, persist?: boolean }} opts
 */
export async function validateMigrationProjectPlan(admin, opts) {
  const project = await loadMigrationProject(admin, opts.projectId, opts.organizationId)
  const stages = await loadMigrationStages(admin, opts.projectId)
  const planConfig = project.plan_config && typeof project.plan_config === 'object'
    ? project.plan_config
    : {}

  const result = validateMigrationPlan(planConfig, stages)
  result.validatedAt = new Date().toISOString()

  if (opts.persist) {
    await admin
      .from('migration_projects')
      .update({
        plan_config: {
          ...planConfig,
          lastValidation: result,
        },
      })
      .eq('id', opts.projectId)
      .eq('organization_id', opts.organizationId)
  }

  return result
}
