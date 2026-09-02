import {
  cleanEntityKey,
  normalizeFieldMapping,
  normalizeMigrationProject,
  normalizeMigrationStage,
  normalizePlanConfig,
} from '~~/shared/migration.js'
import { PLAN_VERSION_V2 } from '~~/shared/migrationPlanV2.js'
import { normalizeConnectionDirection } from '~~/shared/connectionDirection.js'

/**
 * @param {unknown} body
 */
export function parseMigrationProjectBody(body) {
  return normalizeMigrationProject(body)
}

/**
 * @param {unknown} body
 */
export function parseMigrationStageBody(body) {
  return normalizeMigrationStage(body)
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {string} projectId
 * @param {string} organizationId
 */
export async function loadMigrationProject(admin, projectId, organizationId) {
  const { data: project, error } = await admin
    .from('migration_projects')
    .select('*')
    .eq('id', projectId)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }
  if (!project) {
    throw createError({ statusCode: 404, statusMessage: 'Migration project not found' })
  }
  return project
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {string} projectId
 */
export async function loadMigrationStages(admin, projectId) {
  const { data, error } = await admin
    .from('migration_stages')
    .select('*')
    .eq('migration_project_id', projectId)
    .order('sort_order', { ascending: true })

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }
  return data || []
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {string} connectionId
 * @param {string} organizationId
 * @param {'inbound'|'outbound'} direction
 */
export async function assertMigrationConnection(admin, connectionId, organizationId, direction) {
  if (!connectionId) {
    throw createError({
      statusCode: 400,
      statusMessage: `${direction} connection is required`,
    })
  }

  const { data: connection, error } = await admin
    .from('connections')
    .select('id, direction, connector_types(is_enabled)')
    .eq('id', connectionId)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (error || !connection) {
    throw createError({ statusCode: 400, statusMessage: `Unknown ${direction} connection` })
  }
  if (!connection.connector_types?.is_enabled) {
    throw createError({ statusCode: 400, statusMessage: 'Connector type is disabled' })
  }

  if (normalizeConnectionDirection(connection.direction) !== direction) {
    throw createError({
      statusCode: 400,
      statusMessage: `Connection must be ${direction}`,
    })
  }

  return connection
}

/**
 * @param {unknown} raw
 */
export function normalizeProposedPlan(raw) {
  const plan = raw && typeof raw === 'object' ? raw : {}
  const stages = Array.isArray(plan.stages)
    ? plan.stages.map((s, i) => {
      const entityKey = cleanEntityKey(s?.entityKey ?? s?.entity_key)
      const stageType = ['extract', 'transform', 'validate', 'export', 'manual'].includes(String(s?.stageType ?? s?.stage_type))
        ? String(s.stageType ?? s.stage_type)
        : 'extract'
      const mappings = Array.isArray(s?.fieldMappings ?? s?.config?.fieldMappings)
        ? (s.fieldMappings ?? s.config.fieldMappings).map(normalizeFieldMapping)
        : []
      const stageExport = s?.export || s?.config?.export
      return {
        sortOrder: Number(s?.sortOrder ?? s?.sort_order ?? i),
        name: String(s?.name || `${stageType} ${entityKey || i + 1}`).trim(),
        description: s?.description ? String(s.description).trim() : '',
        stageType,
        entityKey,
        status: s?.status === 'blocked' ? 'blocked' : 'draft',
        config: {
          entityLabel: String(s?.entityLabel ?? s?.config?.entityLabel ?? entityKey).trim(),
          sourceEntity: String(s?.sourceEntity ?? s?.config?.sourceEntity ?? '').trim(),
          destinationEntity: String(s?.destinationEntity ?? s?.config?.destinationEntity ?? '').trim(),
          fieldMappings: mappings,
          validationRules: Array.isArray(s?.validationRules) ? s.validationRules : [],
          connectorNeeds: Array.isArray(s?.connectorNeeds) ? s.connectorNeeds : [],
          notes: s?.notes ? String(s.notes).slice(0, 2000) : '',
          ...(stageType === 'transform' && stageExport ? { export: stageExport } : {}),
          ...(stageType === 'transform' && !stageExport ? {
            export: { mode: 'insert', onConflict: 'skip', conflictTarget: 'primary_key' },
          } : {}),
        },
      }
    })
    : []

  return {
    planConfig: normalizePlanConfig({
      planVersion: PLAN_VERSION_V2,
      sourceSummary: plan.sourceSummary,
      destinationSummary: plan.destinationSummary,
      aiNotes: plan.aiNotes ?? plan.generation_notes,
      entities: plan.entities,
      connectorNeeds: plan.connectorNeeds,
      constraintChecklist: plan.constraintChecklist ?? plan.constraint_checklist,
      dependencies: plan.dependencies,
      schemas: plan.schemas,
      approved: false,
    }),
    stages,
    generationNotes: String(plan.generation_notes ?? plan.generationNotes ?? '').slice(0, 4000),
  }
}
