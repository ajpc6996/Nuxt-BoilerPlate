# Migration packs

Product-specific migration knowledge lives here — **not** in the generic pipeline.

Each pack is a source→destination pair (e.g. `rt-to-zammad.js`) and may define:

- destination defaults, aliases, boolean fields, required columns
- lookup maps and cross-field copies
- field hints for the Mapping UI
- export policies (pre-delete, FK validation config)
- extract scoping for child entities
- AI prompt guidance and run failure hints

## Adding a pack

1. Create `shared/migrationPacks/<pairId>.js` exporting a `MigrationPack` object (see `types.js` / `rtToZammad.js`).
2. Register it in `MIGRATION_PACKS` inside `index.js`.
3. Ensure catalog ids in `shared/migrationSystems.js` / `migrationSystemIds.js` include the systems.

Without a pack, migrations still work with AI + operator mappings — they just get no auto-enrichment.
