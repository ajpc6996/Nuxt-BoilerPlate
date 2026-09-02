# Migration plan validation

## Issue shape

```json
{
  "id": "val_tickets_state_id_type_mismatch",
  "severity": "error",
  "code": "TYPE_MISMATCH_AFTER_TRANSFORM",
  "entityKey": "tickets",
  "mappingId": "map_tickets_state_id",
  "destination": "state_id",
  "message": "Human-readable summary",
  "hint": "Actionable fix"
}
```

## Codes

| Code | Severity | Meaning |
|------|----------|---------|
| `REQUIRED_COLUMN_UNMAPPED` | error | NOT NULL destination column has no mapping |
| `TYPE_MISMATCH_AFTER_TRANSFORM` | error | Inferred output type ≠ destinationType |
| `MISSING_SOURCE_ENTITY` | error | Extract/transform stage missing sourceEntity |
| `MISSING_DESTINATION_ENTITY` | error | Transform stage missing destinationEntity |
| `DEPENDENCY_ORDER` | error | Stage runs before required prior entity |
| `EXPORT_CONFLICT_NO_PK` | error | onConflict skip without PK mapped |
| `ENUM_GAP` | warning | Source sample value not covered by map |
| `CONSTANT_ASSUMPTION` | warning | Hard constant with documented risk |
| `VALIDATION_ERRORS` | error | Aggregate block for materialize |
