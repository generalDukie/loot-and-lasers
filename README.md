# Loot & Lasers

Self-hosted idle sci-fi RPG. New React client + Express/SQLite API. No Base44.

## Run

Node 22+ recommended.

```bash
# API
cd server
npm install
npm run seed    # admin@loot.local / admin123
npm run dev     # :8787

# Client (repo root)
npm install
npm run dev
```

## What's new

- Fresh client in `src/` (void / teal / amber look)
- Auth, character select/create, hub, missions, inventory, shop, operative
- Old Base44 UI archived in `legacy-src/` for reference
- Game rules/data kept in `src/lib/`

## Layout

| Path | Role |
|------|------|
| `src/` | New game client |
| `legacy-src/` | Previous UI (reference only) |
| `server/` | API + SQLite DB |
| `src/api/gameClient.js` | `api.auth` / `api.entities` / `api.functions` |
