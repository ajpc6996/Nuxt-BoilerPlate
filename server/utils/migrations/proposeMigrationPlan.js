import { callLlmJson } from '~~/server/utils/connectors/proposeConnectorType.js'
import { listRegisteredRunnerKeys } from '~~/server/utils/connectors/registry.js'
import { normalizeProposedPlan } from '~~/server/utils/migrations.js'

/**
 * Propose a multi-stage migration plan via configured LLM.
 * @param {{
 *   description: string,
 *   sourceSummary?: string,
 *   destinationSummary?: string,
 *   docsUrl?: string,
 *   entities?: Array<{ key?: string, label?: string, sourceFields?: string[], destinationFields?: string[] }>,
 * }} input
 */
export async function proposeMigrationPlan(input) {
  const description = String(input.description || '').trim()
  if (description.length < 20) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Provide a richer migration description (at least ~20 characters)',
    })
  }

  const runners = await listRegisteredRunnerKeys()
  const system = buildMigrationSystemPrompt(runners)
  const userParts = [`Migration goal:\n${description}`]
  if (input.sourceSummary) userParts.push(`Source system:\n${String(input.sourceSummary).trim()}`)
  if (input.destinationSummary) userParts.push(`Destination system:\n${String(input.destinationSummary).trim()}`)
  if (input.docsUrl) userParts.push(`Docs URL:\n${String(input.docsUrl).trim()}`)
  if (Array.isArray(input.entities) && input.entities.length) {
    userParts.push(`Known entities:\n${JSON.stringify(input.entities, null, 2)}`)
  }

  const raw = await callLlmJson({
    system,
    userText: userParts.join('\n\n'),
  })

  return normalizeProposedPlan(raw)
}

/**
 * @param {string[]} runners
 */
function buildMigrationSystemPrompt(runners) {
  return `You design multi-stage data migration plans for a platform that uses:
- Hybrid model: raw data always lands in ingest.* tables (append + retention)
- Mapped rows use dual-sink: same transform output writes ingest.* (mapped) AND Export Temp Stage to outbound destination
- Each executable stage becomes a Data Flow pipeline

Registered connector runners (only recommend these): ${runners.join(', ')}

Return ONLY valid JSON (no markdown):
{
  "sourceSummary": "brief source description",
  "destinationSummary": "brief destination description",
  "aiNotes": "risks, assumptions, ordering rationale",
  "entities": [
    { "key": "customers", "label": "Customers", "sourceFields": ["id","name"], "destinationFields": ["customer_id","full_name"] }
  ],
  "connectorNeeds": [
    {
      "role": "source|destination",
      "system": "Legacy MySQL",
      "preferredRunner": "rest_generic",
      "status": "available|disabled|missing_runner",
      "fallback": "optional fallback approach",
      "platformAction": "what platform admin must do if missing"
    }
  ],
  "stages": [
    {
      "sortOrder": 0,
      "name": "Extract customers (raw)",
      "description": "Landing in ingest",
      "stageType": "extract",
      "entityKey": "customers",
      "entityLabel": "Customers",
      "sourceEntity": "legacy.customers",
      "destinationEntity": "",
      "fieldMappings": [],
      "validationRules": [],
      "connectorNeeds": []
    },
    {
      "sortOrder": 1,
      "name": "Map customers",
      "stageType": "transform",
      "entityKey": "customers",
      "fieldMappings": [
        { "sources": ["id"], "destination": "customer_id", "transform": "copy", "required": true },
        { "sources": ["first_name","last_name"], "destination": "full_name", "transform": "template", "template": "{{first_name}} {{last_name}}" }
      ]
    },
    {
      "sortOrder": 2,
      "name": "Validate customer counts",
      "stageType": "validate",
      "entityKey": "customers",
      "validationRules": [
        { "type": "row_count_match", "sourceStage": "extract", "targetStage": "transform" },
        { "type": "required_fields", "fields": ["customer_id","full_name"] }
      ]
    }
  ],
  "generation_notes": "why this stage order and any blocked dependencies"
}

Rules:
- For each business entity, prefer: extract (raw ingest) → transform (map + dual-sink export) → validate
- stageType must be one of: extract, transform, validate, export, manual
- fieldMappings only on transform stages; use transform: copy | template | map | join
- Mark connectorNeeds status missing_runner when no registered runner fits; never invent runner keys
- Keep stages ordered with sortOrder starting at 0
- entityKey lowercase snake_case`
}
