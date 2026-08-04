# Database backup & restore

Export and import game data as JSON (users + entities).

Godot clients are **not** backups. Nakama auth data alone cannot reconstruct gameplay.

## Export (backup)

```bash
cd server
export API_URL=http://localhost:8787
export API_TOKEN=<admin-jwt>

npm run backup:export
# → data/migration/backup.json
```

## Import (restore)

Dry-run first:

```bash
npm run backup:import -- --file ./data/migration/backup.json
```

Apply (prefer copying DB first):

```bash
cp data/game.db data/game.db.backup
npm run backup:import -- --file ./data/migration/backup.json --apply
```

## Isolated restore drill (Restoration 25)

Does not touch production `game.db`:

```bash
npm run integrity:restore-drill -- --file ./data/migration/restore-drill-fixture.json
# or any export JSON
```

## Integrity migrations

```bash
npm run integrity:migrate -- --list
npm run integrity:migrate -- --id integrity_framework_v1          # dry-run
ALLOW_PROD_MIGRATION=1 npm run integrity:migrate -- --id … --apply  # production only with explicit flag
```

See `scripts/import-data.mjs` source for `--skip-users`, `--types`, `--replace`.
See `docs/PHASE_INTEGRITY.md` for RPO/RTO honesty and quarantine/repair policy.
