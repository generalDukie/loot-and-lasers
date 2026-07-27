# AGENTS.md

## Project

Loot & Lasers — self-hosted game. Client in `src/`, API in `server/`.

## Commands

- Frontend: `npm run dev`
- API: `npm run server` (or `cd server && npm run dev`)
- Seed admin: `npm run server:seed`
- API smoke test: `npm run test:api`

## Notes

- Game client: `src/api/gameClient.js` (`api` export)
- Do not add third-party hosted backend SDKs or vendor-specific Vite plugins
- Prefer extending the `src/` client; keep game rules in `src/lib/`
- DB file: `server/data/game.db` (gitignored)
