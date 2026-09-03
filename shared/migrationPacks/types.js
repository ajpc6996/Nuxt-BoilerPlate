/**
 * @typedef {{
 *   destination: string,
 *   constantValue?: unknown,
 *   required?: boolean,
 *   force?: boolean,
 * }} PackConstantDefault
 *
 * @typedef {{
 *   destination: string,
 *   sources?: string[],
 *   transform?: string,
 *   cast?: string,
 *   template?: string,
 *   constantValue?: unknown,
 *   force?: boolean,
 *   required?: boolean,
 *   destinationType?: string,
 *   mapValues?: Record<string, unknown>,
 *   notes?: string,
 * }} PackCrossFieldCopy
 *
 * @typedef {{
 *   map: Record<string, string | number>,
 *   defaultConstant?: unknown,
 *   defaultSources?: string[],
 *   notes?: string,
 * }} PackLookupMapRule
 *
 * @typedef {{
 *   type: 'boolean' | 'integer' | 'enum' | 'timestamp' | 'string',
 *   options?: Array<{ value: string | number | boolean, label: string }>,
 *   placeholder?: string,
 *   hint?: string,
 * }} PackFieldHint
 *
 * @typedef {{
 *   rowField: string,
 *   parentTable: string,
 *   reason: string,
 * }} PackFkParentLookup
 *
 * @typedef {{
 *   parentLookups: PackFkParentLookup[],
 *   userRefFields?: string[],
 *   fallbackUserSql?: string,
 *   fkErrorHints?: Record<string, string>,
 *   emptyResultMessage?: string,
 * }} PackExportFkValidation
 *
 * @typedef {{
 *   preDeleteByField?: string,
 *   preDeleteCascade?: Array<{ table: string, matchField: string }>,
 *   requireFields?: string[],
 *   syncSerialSequence?: string,
 *   missingTicketParents?: string,
 *   validateArticleForeignKeys?: string,
 *   patchMissingUserRefs?: boolean,
 *   exportFkValidation?: PackExportFkValidation,
 * }} PackExportPolicy
 *
 * @typedef {{
 *   childEntityKeys: string[],
 *   parentEntityKey: string,
 *   childParentFields: string[],
 *   parentIdFields: string[],
 * }} PackExtractScope
 *
 * @typedef {{
 *   childEntityKeys: string[],
 *   parentEntityKey: string,
 *   missingParentMessage: string,
 *   missingParentHint: string,
 *   zeroOutboundMessage: string,
 *   zeroOutboundHint: string,
 * }} PackChildExportGate
 *
 * @typedef {{
 *   test: (message: string, stage: { entity_key?: string, name?: string }) => boolean,
 *   hint: string,
 * }} PackFailureHint
 *
 * @typedef {{
 *   id: string,
 *   label: string,
 *   sourceSystemId: string,
 *   destinationSystemId: string,
 *   docsUrls?: string[],
 *   promptGuidance?: string,
 *   destination: {
 *     defaults: Record<string, PackConstantDefault[]>,
 *     entityAliases: Record<string, string>,
 *     booleanFields: string[],
 *     requiredColumns: Record<string, string[]>,
 *     fieldHints: Record<string, Record<string, PackFieldHint>>,
 *     lookupMaps: Record<string, Record<string, PackLookupMapRule>>,
 *     integerExtraFields?: string[],
 *   },
 *   crossFieldCopies: Record<string, PackCrossFieldCopy[]>,
 *   exportPolicies: Record<string, PackExportPolicy>,
 *   extractScope?: PackExtractScope,
 *   childExportGate?: PackChildExportGate,
 *   failureHints?: PackFailureHint[],
 * }} MigrationPack
 */

export {}
