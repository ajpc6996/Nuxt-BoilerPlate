/**
 * Destination field value hints for migration mappings and transform defaults.
 * Product-specific hints come from migration packs (no global Zammad fallback).
 */

import {
  getPackFieldHint,
  listPackDestinationFields,
} from './migrationPacks/index.js'

/**
 * @typedef {{
 *   type: 'boolean' | 'integer' | 'enum' | 'timestamp' | 'string',
 *   options?: Array<{ value: string | number | boolean, label: string }>,
 *   placeholder?: string,
 *   hint?: string,
 * }} DestinationFieldHint
 */

/**
 * Known destination field names from the active pack (for mapping dropdowns).
 * @param {string} systemId
 * @param {string} entityKey
 * @param {string} [sourceSystemId]
 * @returns {string[]}
 */
export function listKnownDestinationFields(systemId, entityKey, sourceSystemId = '') {
  return listPackDestinationFields(systemId, entityKey, sourceSystemId)
}

/**
 * @param {string} systemId
 * @param {string} entityKey
 * @param {string} fieldName
 * @param {string} [sourceSystemId]
 * @returns {DestinationFieldHint | null}
 */
export function getDestinationFieldHint(systemId, entityKey, fieldName, sourceSystemId = '') {
  return getPackFieldHint(systemId, entityKey, fieldName, sourceSystemId)
}

/**
 * Field-name-only lookup without a destination system — intentionally empty.
 * Callers should pass systemId via getDestinationFieldHint when possible.
 * @param {string} fieldName
 * @returns {DestinationFieldHint | null}
 */
export function getFieldHintByName(fieldName) {
  void fieldName
  return null
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
