# Database backup & restore

Export and import game data as JSON (users + entities).

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

Apply:

```bash
cp data/game.db data/game.db.backup
npm run backup:import -- --file ./data/migration/backup.json --apply
```

See `scripts/import-data.mjs --help` via source for `--skip-users`, `--types`, `--replace`.
