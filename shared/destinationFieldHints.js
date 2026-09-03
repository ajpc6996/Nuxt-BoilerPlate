/**
 * Destination field value hints for migration mappings and transform defaults.
 * Drives "If null" pickers when a field has a restricted set of valid values.
 */

import {
  ZAMMAD_ARTICLE_SENDER_NAME_MAP,
  ZAMMAD_ARTICLE_TYPE_NAME_MAP,
  ZAMMAD_TICKET_PRIORITY_NAME_MAP,
  ZAMMAD_TICKET_STATE_NAME_MAP,
} from './migrationSystems.js'

/**
 * @typedef {{
 *   type: 'boolean' | 'integer' | 'enum' | 'timestamp' | 'string',
 *   options?: Array<{ value: string | number | boolean, label: string }>,
 *   placeholder?: string,
 *   hint?: string,
 * }} DestinationFieldHint
 */

/** @type {Record<string, Record<string, Record<string, DestinationFieldHint>>>} */
const FIELD_HINTS = {
  zammad: {
    users: {
      active: {
        type: 'boolean',
        options: [
          { value: true, label: 'true (active)' },
          { value: false, label: 'false (inactive)' },
        ],
      },
      created_at: { type: 'timestamp', options: [{ value: '__NOW__', label: 'Now (__NOW__)' }] },
      updated_at: { type: 'timestamp', options: [{ value: '__NOW__', label: 'Now (__NOW__)' }] },
      created_by_id: { type: 'integer', placeholder: '1', hint: 'Zammad user id (often admin = 1)' },
      updated_by_id: { type: 'integer', placeholder: '1', hint: 'Zammad user id (often admin = 1)' },
    },
    groups: {
      active: {
        type: 'boolean',
        options: [
          { value: true, label: 'true (active)' },
          { value: false, label: 'false (inactive)' },
        ],
      },
      shared_drafts: {
        type: 'boolean',
        options: [
          { value: true, label: 'true (enabled)' },
          { value: false, label: 'false (disabled)' },
        ],
      },
      follow_up_assignment: {
        type: 'boolean',
        options: [
          { value: true, label: 'true (keep owner)' },
          { value: false, label: 'false (reset owner)' },
        ],
      },
      follow_up_possible: {
        type: 'enum',
        options: [
          { value: 'yes', label: 'yes (reopen same ticket)' },
          { value: 'new_ticket', label: 'new_ticket' },
        ],
      },
      created_at: { type: 'timestamp', options: [{ value: '__NOW__', label: 'Now (__NOW__)' }] },
      updated_at: { type: 'timestamp', options: [{ value: '__NOW__', label: 'Now (__NOW__)' }] },
      created_by_id: { type: 'integer', placeholder: '1' },
      updated_by_id: { type: 'integer', placeholder: '1' },
    },
    tickets: {
      number: {
        type: 'string',
        placeholder: 'RT Tickets.id',
        hint: 'Zammad display number (NOT NULL) — usually RT ticket id as text',
      },
      title: {
        type: 'string',
        placeholder: 'RT Subject',
        hint: 'Ticket title (NOT NULL)',
      },
      state_id: {
        type: 'enum',
        options: uniqueMapOptions(ZAMMAD_TICKET_STATE_NAME_MAP, 'Zammad state'),
        placeholder: '2',
        hint: 'Integer ticket_states.id (default open = 2)',
      },
      priority_id: {
        type: 'enum',
        options: uniqueMapOptions(ZAMMAD_TICKET_PRIORITY_NAME_MAP, 'Zammad priority'),
        placeholder: '2',
        hint: 'Integer ticket_priorities.id (default normal = 2)',
      },
      group_id: { type: 'integer', placeholder: '1', hint: 'groups.id' },
      customer_id: { type: 'integer', placeholder: '1', hint: 'users.id (requester)' },
      owner_id: { type: 'integer', placeholder: '1', hint: 'users.id (agent)' },
      created_by_id: { type: 'integer', placeholder: '1' },
      updated_by_id: { type: 'integer', placeholder: '1' },
      created_at: { type: 'timestamp', options: [{ value: '__NOW__', label: 'Now (__NOW__)' }] },
      updated_at: { type: 'timestamp', options: [{ value: '__NOW__', label: 'Now (__NOW__)' }] },
    },
    articles: {
      ticket_id: {
        type: 'integer',
        placeholder: 'RT ObjectId',
        hint: 'Must match tickets.id — preserve RT ticket id on ticket export',
      },
      type_id: {
        type: 'enum',
        options: uniqueMapOptions(ZAMMAD_ARTICLE_TYPE_NAME_MAP, 'Zammad article type'),
        placeholder: '10',
        hint: 'ticket_article_types.id (default note = 10)',
      },
      sender_id: {
        type: 'enum',
        options: uniqueMapOptions(ZAMMAD_ARTICLE_SENDER_NAME_MAP, 'Zammad sender'),
        placeholder: '2',
        hint: 'ticket_article_senders.id (default Agent = 2)',
      },
      body: { type: 'string', placeholder: 'RT Content', hint: 'Article body (NOT NULL)' },
      content_type: { type: 'string', placeholder: 'text/plain' },
      internal: { type: 'boolean', placeholder: 'false' },
      created_by_id: { type: 'integer', placeholder: '1' },
      updated_by_id: { type: 'integer', placeholder: '1' },
      created_at: { type: 'timestamp', options: [{ value: '__NOW__', label: 'Now (__NOW__)' }] },
      updated_at: { type: 'timestamp', options: [{ value: '__NOW__', label: 'Now (__NOW__)' }] },
    },
  },
}

/** Fallback when only the field name is known (pipeline transform editor). */
const FIELD_HINTS_BY_NAME = {
  active: FIELD_HINTS.zammad.users.active,
  shared_drafts: FIELD_HINTS.zammad.groups.shared_drafts,
  follow_up_assignment: FIELD_HINTS.zammad.groups.follow_up_assignment,
  follow_up_possible: FIELD_HINTS.zammad.groups.follow_up_possible,
  state_id: FIELD_HINTS.zammad.tickets.state_id,
  priority_id: FIELD_HINTS.zammad.tickets.priority_id,
  created_at: FIELD_HINTS.zammad.users.created_at,
  updated_at: FIELD_HINTS.zammad.users.updated_at,
  created_by_id: FIELD_HINTS.zammad.users.created_by_id,
  updated_by_id: FIELD_HINTS.zammad.users.updated_by_id,
  group_id: FIELD_HINTS.zammad.tickets.group_id,
  customer_id: FIELD_HINTS.zammad.tickets.customer_id,
  owner_id: FIELD_HINTS.zammad.tickets.owner_id,
  ticket_id: FIELD_HINTS.zammad.articles.ticket_id,
  type_id: FIELD_HINTS.zammad.articles.type_id,
  sender_id: FIELD_HINTS.zammad.articles.sender_id,
  body: FIELD_HINTS.zammad.articles.body,
  content_type: FIELD_HINTS.zammad.articles.content_type,
}

/**
 * @param {Record<string, string | number>} map
 * @param {string} prefix
 * @returns {Array<{ value: string | number | boolean, label: string }>}
 */
function uniqueMapOptions(map, prefix) {
  const seen = new Set()
  /** @type {Array<{ value: string | number | boolean, label: string }>} */
  const out = []
  for (const [label, value] of Object.entries(map || {})) {
    const key = String(value)
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ value, label: `${label} → ${value}` })
  }
  return out.sort((a, b) => Number(a.value) - Number(b.value))
}

/**
 * Known destination field names from docs/hints (for mapping dropdowns).
 * @param {string} systemId
 * @param {string} entityKey
 * @returns {string[]}
 */
export function listKnownDestinationFields(systemId, entityKey) {
  const system = String(systemId || '').trim().toLowerCase()
  const entity = String(entityKey || '').trim().toLowerCase()
  const scoped = FIELD_HINTS[system]?.[entity]
  if (!scoped || typeof scoped !== 'object') return []
  return Object.keys(scoped).sort((a, b) => a.localeCompare(b))
}

/**
 * @param {string} systemId
 * @param {string} entityKey
 * @param {string} fieldName
 * @returns {DestinationFieldHint | null}
 */
export function getDestinationFieldHint(systemId, entityKey, fieldName) {
  const system = String(systemId || '').trim().toLowerCase()
  const entity = String(entityKey || '').trim().toLowerCase()
  const field = String(fieldName || '').trim().toLowerCase()
  if (!field) return null

  const scoped = FIELD_HINTS[system]?.[entity]?.[field]
  if (scoped) return scoped

  return FIELD_HINTS_BY_NAME[field] || null
}

/**
 * @param {string} fieldName
 * @returns {DestinationFieldHint | null}
 */
export function getFieldHintByName(fieldName) {
  const field = String(fieldName || '').trim().toLowerCase()
  if (!field) return null
  return FIELD_HINTS_BY_NAME[field] || null
}

/**
 * @param {unknown} value
 */
export function formatMappingValue(value) {
  if (value === undefined || value === null) return ''
  if (typeof value === 'boolean' || typeof value === 'number') return String(value)
  return String(value)
}

/**
 * @param {string} raw
 */
export function parseMappingValue(raw) {
  const s = String(raw ?? '').trim()
  if (s === '') return ''
  if (s === 'true') return true
  if (s === 'false') return false
  if (s === '__NOW__' || s === '{{now}}') return '__NOW__'
  if (/^-?\d+$/.test(s)) {
    const n = Number(s)
    if (Number.isSafeInteger(n)) return n
  }
  return s
}

/**
 * @param {unknown} value
 * @param {DestinationFieldHint | null} hint
 */
export function coerceHintValue(value, hint) {
  if (value === '' || value === undefined || value === null) return ''
  if (!hint) return parseMappingValue(formatMappingValue(value))
  if (hint.type === 'boolean') {
    if (value === true || value === false) return value
    return parseMappingValue(String(value))
  }
  if (hint.type === 'integer' || hint.type === 'enum') {
    const n = Number(value)
    if (Number.isFinite(n) && String(value).trim() !== '') return n
    return parseMappingValue(String(value))
  }
  return parseMappingValue(String(value))
}
