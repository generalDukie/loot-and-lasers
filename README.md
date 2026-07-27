# Loot & Lasers

Self-hosted idle sci-fi RPG. React client in `src/` + Express/SQLite API in `server/`.

## Run locally

Node 22+ recommended.

```bash
# API
cd server
npm install
npm run seed    # admin@loot.local / admin123
npm run dev     # :8787

# Client (repo root, second terminal)
npm install
npm run dev     # :5173 — proxies /api and /ws to :8787
```

Optional root `.env.local`:

```env
VITE_API_URL=http://localhost:8787
VITE_APP_ID=lootandlasers-local
```

## API smoke test

With the API running:

```bash
npm run test:api
# or: cd server && npm run smoke
```

## Deploy (Docker)

Single container serves the built client + API + WebSocket on one port. SQLite DB persists in a Docker volume.

```bash
cp env.example .env
# Edit .env — set JWT_SECRET (openssl rand -hex 32) and SEED_PASSWORD

docker compose up -d --build
# → http://localhost:8787
```

| Variable | Purpose |
|----------|---------|
| `JWT_SECRET` | **Required** in production — signs login tokens |
| `SEED_EMAIL` / `SEED_PASSWORD` | First admin account (seed runs on container start) |
| `APP_ID` | App identifier (default `lootandlasers-local`) |
| `RUN_SEED` | Set `false` after first deploy to skip seed on restart |
| `SMTP_HOST` (+ `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`) | Enables email OTP + password reset links |
| `PUBLIC_CLIENT_URL` | Base URL used in reset links (default `http://localhost:8787`) |

Data volume: `lootandlasers-data` → `/app/server/data/game.db`

See `server/BACKUP.md` for JSON backup/restore of your database.

## Layout

| Path | Role |
|------|------|
| `src/` | Game client (React + Vite) |
| `src/api/gameClient.js` | `api.auth` / `api.entities` / `api.functions` |
| `server/` | API + SQLite DB |
| `public/assets/` | Self-hosted game art |
| `server/scripts/smoke-test.mjs` | API integration smoke test |
| `server/BACKUP.md` | Database backup & restore |

## Notes

- Register OTP and password-reset tokens log to the API console in **development** only.
- In production, set `SMTP_HOST` to enable actual email sending for OTP verification and password resets.
- Admins can view recent email delivery events under **Admin → Email** (SMTP status, send test, delivery log).
- Email + password auth only (no social login).
