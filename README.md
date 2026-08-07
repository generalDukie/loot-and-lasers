# Loot & Lasers

Self-hosted idle sci-fi RPG. Godot desktop client in `loot&lasers/` + Express/SQLite API in `server/`.
Shared game rules used by the API live in `src/lib/`.

## Run locally

Node 22+ recommended.

```bash
# API
cd server
npm install
npm run seed    # admin@loot.local / admin123
npm run dev     # :8787
```

Open the Godot project in `loot&lasers/` (Godot 4.7.1) and run against the local API / staging as configured.

## API smoke test

With the API running:

```bash
npm run test:api
# or: cd server && npm run smoke
```

## Windows friend installer

```powershell
.\scripts\build-windows-installer.ps1 -Version "0.1.15" -Interactive
```

See `docs/WINDOWS_FRIEND_BUILD.md`.

## Deploy (Docker — API only)

```bash
cp env.example .env
# Edit .env — set JWT_SECRET (openssl rand -hex 32) and SEED_PASSWORD

docker compose -f docker-compose.node-api.yml --env-file .env.node-api up -d --build
# → API on :8787 (no browser SPA)
```

| Variable | Purpose |
|----------|---------|
| `JWT_SECRET` | **Required** in production — signs login tokens |
| `SEED_EMAIL` / `SEED_PASSWORD` | First admin account (seed runs on container start) |
| `APP_ID` | App identifier (default `lootandlasers-local`) |
| `RUN_SEED` | Set `false` after first deploy to skip seed on restart |
| `SMTP_HOST` (+ `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`) | Enables email OTP + password reset links |
| `PUBLIC_CLIENT_URL` | Base URL used in reset links |

Data volume: `node_api_data` → `/app/server/data/game.db`

See `server/BACKUP.md` for JSON backup/restore of your database.
