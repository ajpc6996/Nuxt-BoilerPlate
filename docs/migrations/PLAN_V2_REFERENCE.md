# Migration plan v2 reference

Plan v2 is **migration-only**. It does not change connector types, connections, data flows, dashboards, or reports.

## Top-level `plan_config`

```json
{
  "planVersion": 2,
  "sourceSystemId": "rt",
  "destinationSystemId": "zammad",
  "schemas": { "source": { "entities": {} }, "destination": { "entities": {} } },
  "dependencies": { "entities": [{ "key": "users", "order": 10, "requires": [] }] },
  "entities": [],
  "constraintChecklist": [],
  "aiNotes": ""
}
```

## Typed field mapping

Each destination column has one mapping:

```json
{
  "id": "map_tickets_state_id",
  "destination": "state_id",
  "destinationType": "integer",
  "required": true,
  "sources": [{ "entity": "tickets", "field": "Status", "type": "string" }],
  "transform": {
    "op": "chain",
    "steps": [
      { "op": "map", "mapping": { "open": 2, "approved": 2, "closed": 4 }, "fallback": { "op": "cast", "to": "integer", "onError": "null" } },
      { "op": "default", "when": "null", "value": 2, "valueType": "integer" }
    ]
  },
  "ifNullValue": 2
}
```

Legacy v1 mappings (`transform: "copy"`, `sources: ["Status"]`) remain supported.

## Stage export policy

Transform stages may include:

```json
{
  "export": {
    "mode": "insert",
    "onConflict": "skip",
    "conflictTarget": "primary_key"
  }
}
```

## Validation

See [VALIDATION.md](./VALIDATION.md). Materialize blocks when validation returns `valid: false`.
