# Loot & Lasers API

Self-hosted game backend (Express + SQLite + JWT + WebSocket).

## Quick start

```bash
cd server
npm install
npm run seed    # creates admin@loot.local / admin123
npm run dev     # http://localhost:8787
```

## API

| Area | Routes |
|------|--------|
| Auth | `POST /api/auth/register`, `/login`, `/verify-otp`, `GET/PATCH /api/auth/me`, … |
| Entities | `GET/POST/PATCH/DELETE /api/entities/:type` (+ filter, update-many, delete-many, bulk) |
| Functions | `POST /api/functions/:name` |
| Realtime | `ws://localhost:8787/ws?entity=Character` |

### Functions

`ClaimDailyLogin`, `ClaimMailReward`, `RedeemPromoCode`, `SyncAchievements`, `SendMessage`, `ResolveNexusAssault`, `AdminModeration`

## Env

| Var | Default |
|-----|---------|
| `PORT` | `8787` |
| `JWT_SECRET` | dev secret |
| `DB_PATH` | `server/data/game.db` |
| `APP_ID` | `lootandlasers-local` |

Frontend `.env.local`:

```
VITE_API_URL=http://localhost:8787
VITE_APP_ID=lootandlasers-local
```

Register OTP codes are printed to the API console and shown in the UI during local/dev.
