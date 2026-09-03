import { callLlmJson } from '~~/server/utils/connectors/proposeConnectorType.js'
import { listRegisteredRunnerKeys } from '~~/server/utils/connectors/registry.js'
import { normalizeProposedPlan } from '~~/server/utils/migrations.js'
import {
  getMigrationSystem,
} from '~~/shared/migrationSystems.js'
import { getMigrationPack } from '~~/shared/migrationPacks/index.js'

/**
 * Propose a multi-stage migration plan via configured LLM.
 * @param {{
 *   description: string,
 *   operatorNotes?: string,
 *   sourceSummary?: string,
 *   destinationSummary?: string,
 *   sourceSystemId?: string,
 *   destinationSystemId?: string,
 *   docsUrl?: string,
 *   docsUrls?: string[],
 *   entities?: Array<{ key?: string, label?: string, sourceFields?: string[], destinationFields?: string[] }>,
 * }} input
 */
export async function proposeMigrationPlan(input) {
  const description = String(input.description || '').trim()
  const operatorNotes = String(input.operatorNotes || '').trim()
  const combinedDescription = [description, operatorNotes].filter(Boolean).join('\n\n')
  if (combinedDescription.length < 20) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Provide a richer migration description or operator notes (at least ~20 characters)',
    })
  }

  const docsUrls = normalizeDocsUrls(input.docsUrls, input.docsUrl)

  const runners = await listRegisteredRunnerKeys()
  const sourceSystem = getMigrationSystem(input.sourceSystemId || 'custom')
  const destinationSystem = getMigrationSystem(input.destinationSystemId || 'custom')

  const userParts = [`Migration goal:\n${description || '(see operator notes)'}`]
  if (operatorNotes) {
    userParts.push(`Operator guidance (high priority — follow these constraints and preferences):\n${operatorNotes}`)
  }
  userParts.push(
    `Selected systems:\n- Source: ${sourceSystem.label} (id=${sourceSystem.id}, db=${sourceSystem.database}, preferredRunner=${sourceSystem.preferredRunner})\n- Destination: ${destinationSystem.label} (id=${destinationSystem.id}, db=${destinationSystem.database}, preferredRunner=${destinationSystem.preferredRunner})`,
  )
  if (sourceSystem.notes) userParts.push(`Source system notes:\n${sourceSystem.notes}`)
  if (destinationSystem.notes) userParts.push(`Destination system notes:\n${destinationSystem.notes}`)
  if (input.sourceSummary) userParts.push(`Source summary:\n${String(input.sourceSummary).trim()}`)
  if (input.destinationSummary) {
    userParts.push(`Destination summary:\n${String(input.destinationSummary).trim()}`)
  }
  if (docsUrls.length) {
    userParts.push(
      `Authoritative documentation links (prefer these over guesswork; cite assumptions when a link cannot be fetched):\n${docsUrls.map((u, i) => `${i + 1}. ${u}`).join('\n')}`,
    )
  }
  if (Array.isArray(input.entities) && input.entities.length) {
    userParts.push(`Known entities:\n${JSON.stringify(input.entities, null, 2)}`)
  }

  const pack = getMigrationPack(sourceSystem.id, destinationSystem.id)
  const destKnowledgeDefaults = pack?.destination?.defaults || {}
  if (Object.keys(destKnowledgeDefaults).length) {
    userParts.push(
      `Platform-known destination NOT NULL / audit defaults (must include unless docs prove otherwise):\n${JSON.stringify(destKnowledgeDefaults, null, 2)}`,
    )
  }

  const packGuidance = pack?.promptGuidance
    ? `\nPack guidance (${pack.label}):\n${pack.promptGuidance}\n`
    : '\nNo product pack is registered for this source→destination pair. Rely on operator notes, docs URLs, and generic constraints only.\n'

  const system = buildMigrationSystemPrompt(runners, sourceSystem, destinationSystem, packGuidance)

  const raw = await callLlmJson({
    system,
    userText: userParts.join('\n\n'),
  })

  return normalizeProposedPlan(raw)
}

/**
 * @param {unknown} docsUrls
 * @param {unknown} docsUrl
 * @returns {string[]}
 */
function normalizeDocsUrls(docsUrls, docsUrl) {
  /** @type {string[]} */
  const out = []
  const push = (raw) => {
    String(raw || '')
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((u) => {
        if (!/^https?:\/\//i.test(u)) return
        if (!out.includes(u)) out.push(u)
      })
  }
  if (Array.isArray(docsUrls)) docsUrls.forEach(push)
  else if (docsUrls) push(docsUrls)
  if (docsUrl) push(docsUrl)
  return out.slice(0, 20)
}

/**
 * @param {string[]} runners
 * @param {{ id: string, label: string, database: string, preferredRunner: string, notes?: string }} sourceSystem
 * @param {{ id: string, label: string, database: string, preferredRunner: string, notes?: string }} destinationSystem
 */
function buildMigrationSystemPrompt(runners, sourceSystem, destinationSystem, packGuidance = '') {
  return `You are a senior data-migration architect. Plans you produce may be used in production without further code changes, so you MUST prevent avoidable runtime failures up front.

Platform execution model:
- Hybrid: raw extract always lands in ingest.* (append + retention)
- Transform stages dual-sink: mapped rows write ingest.* AND Export Temp Stage to the outbound destination
- Each executable stage becomes a Data Flow; outbound SQL INSERT uses ONLY mapped destination columns
- Unmapped source columns must NEVER be exported (they cause "column does not exist" errors)

Registered connector runners (only recommend these): ${runners.join(', ')}

Selected endpoints for this plan:
- Source: ${sourceSystem.label} (${sourceSystem.id} / ${sourceSystem.database})
- Destination: ${destinationSystem.label} (${destinationSystem.id} / ${destinationSystem.database})

CRITICAL — destination constraints & documentation:
1. Use your knowledge of the official ${destinationSystem.label} schema/API docs thoroughly. Prefer any operator-supplied documentation links over guesswork.
2. Treat operator guidance and documentation links as authoritative requirements for constraints, table/column names, and required constants.
3. For every destination entity/table you map into, identify and mitigate:
   - NOT NULL columns without DB defaults
   - Foreign keys / required reference IDs (created_by_id, updated_by_id, organization_id, group_id, customer_id, state_id, priority_id, type_id, etc.)
   - Unique constraints and natural keys
   - Enums / state machines / type lookup IDs
   - Case-sensitive table/column names
   - Timestamps (created_at, updated_at) and timezone expectations
   - Boolean / integer / UUID type mismatches
   - Soft-delete / active flags
4. If a required destination column has no source equivalent, emit a constant mapping (transform:"constant") with a safe production default and document the assumption in aiNotes / stage notes.
5. Prefer real destination column names exactly as documented — never invent columns.
6. Prefer real source table names (sourceEntity) and destination table names (destinationEntity).
7. Export projection is destination-only: every transform stage fieldMappings destination list must be exactly the columns you intend to INSERT/POST.
8. Call out residual risks that cannot be auto-fixed (auth, network, missing seed users, Elasticsearch reindex) in aiNotes and generation_notes.
9. Order stages so dependencies succeed (parent entities before children).
${packGuidance}
Return ONLY valid JSON (no markdown):
{
  "planVersion": 2,
  "sourceSummary": "brief source description",
  "destinationSummary": "brief destination description",
  "aiNotes": "risks, assumptions, constraint mitigations, ordering rationale",
  "dependencies": {
    "entities": [
      { "key": "users", "order": 10, "destinationKey": "users", "requires": [] },
      { "key": "queues", "order": 20, "destinationKey": "groups", "requires": [] },
      { "key": "tickets", "order": 30, "destinationKey": "tickets", "requires": ["users", "groups"] }
    ]
  },
  "constraintChecklist": [
    {
      "entityKey": "users",
      "destinationTable": "users",
      "requiredColumns": ["login","created_by_id","updated_by_id","created_at","updated_at"],
      "mitigations": ["constant updated_by_id=1", "constant created_at=__NOW__"],
      "residualRisks": ["admin user id 1 must exist"]
    }
  ],
  "entities": [
    {
      "key": "users",
      "label": "Users",
      "sourceFields": ["id","Name","EmailAddress"],
      "destinationFields": ["id","login","email","created_by_id","updated_by_id","created_at","updated_at","active"]
    }
  ],
  "connectorNeeds": [
    {
      "role": "source|destination",
      "system": "system name",
      "preferredRunner": "mysql|postgres|rest_generic|...",
      "status": "available|disabled|missing_runner",
      "fallback": "optional fallback",
      "platformAction": "what admin must do if missing"
    }
  ],
  "stages": [
    {
      "sortOrder": 0,
      "name": "Extract users (raw)",
      "description": "Landing in ingest",
      "stageType": "extract",
      "entityKey": "users",
      "entityLabel": "Users",
      "sourceEntity": "Users",
      "destinationEntity": "",
      "fieldMappings": [],
      "validationRules": [],
      "notes": ""
    },
    {
      "sortOrder": 1,
      "name": "Map users",
      "stageType": "transform",
      "entityKey": "users",
      "entityLabel": "Users",
      "sourceEntity": "Users",
      "destinationEntity": "users",
      "fieldMappings": [
        {
          "id": "map_users_login",
          "sources": [{ "entity": "users", "field": "Name", "type": "string" }],
          "destination": "login",
          "destinationType": "string",
          "transform": "copy",
          "required": true
        },
        {
          "id": "map_users_created_by",
          "sources": [],
          "destination": "created_by_id",
          "destinationType": "integer",
          "transform": "constant",
          "constantValue": 1,
          "required": true,
          "notes": "Assumes admin user id 1 exists"
        }
      ],
      "export": { "mode": "insert", "onConflict": "skip", "conflictTarget": "primary_key" },
      "notes": "Audit columns required by destination NOT NULL constraints"
    },
    {
      "sortOrder": 2,
      "name": "Validate users",
      "stageType": "validate",
      "entityKey": "users",
      "validationRules": [
        { "type": "required_fields", "fields": ["login","created_by_id","updated_by_id","created_at","updated_at"] }
      ]
    }
  ],
  "generation_notes": "constraint research summary + why this stage order"
}

Hard rules:
- planVersion MUST be 2
- For each business entity: extract → transform (map + dual-sink) → validate (unless blocked)
- stageType must be one of: extract, transform, validate, export, manual
- fieldMappings only on transform stages
- Each fieldMapping MUST include destinationType (string|integer|boolean|timestamp|number)
- Use transform:"map" with mapValues OR transform:{op:"chain",steps:[...]} for status/name → id conversions — never copy strings into integer/boolean columns
- constant mappings: set constantValue (number|boolean|string). Use "__NOW__" for timestamps
- optional ifNullValue on copy/map rows: static value when source is null only
- transform stages MUST include export:{mode:"insert",onConflict:"skip",conflictTarget:"primary_key"}
- dependencies.entities MUST list order and requires[] for FK ordering
- Never leave sourceEntity empty on extract/transform; never leave destinationEntity empty on transform/export
- destinationFields on entities MUST include every NOT NULL / required column you will insert
- Do not invent runner keys; mark missing runners in connectorNeeds
- sortOrder starts at 0; entityKey lowercase snake_case
- Prefer preferredRunner for each selected system when available in the registered list
- See docs/migrations/PLAN_V2_REFERENCE.md on the platform for the full contract`
}
