# AGENTS.md

## Project

Loot & Lasers — self-hosted game. New client in `src/`, API in `server/`. Old UI in `legacy-src/` (reference only).

## Commands

- Frontend: `npm run dev`
- API: `npm run server` (or `cd server && npm run dev`)
- Seed admin: `npm run server:seed`

## Notes

- Game client: `src/api/gameClient.js` (`api` export)
- Do not reintroduce Base44 SDK / vite plugin
- Prefer extending the new `src/` client over restoring `legacy-src/` UI
- DB file: `server/data/game.db` (gitignored)
