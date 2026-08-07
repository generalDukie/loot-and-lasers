# AGENTS.md

## Project

Loot & Lasers — self-hosted game. Godot desktop client in `loot&lasers/`, API in `server/`.
Shared deterministic game rules live in `src/lib/` (imported by the Node API). There is no browser client.

## Commands

- API: `npm run server` (or `cd server && npm run dev`)
- Seed admin: `npm run server:seed`
- API smoke test: `npm run test:api`
- Godot script audit: run Godot headless with `-s res://_audit_all.gd` from `loot&lasers/`
- Windows friend installer: `.\scripts\build-windows-installer.ps1 -Version "0.1.13.2" -Interactive`

## Notes

- Player client: Godot in `loot&lasers/`
- Do not add third-party hosted backend SDKs
- Keep authoritative game rules in `src/lib/` / `server/`; mirror in Godot only as needed for presentation
- DB file: `server/data/game.db` (gitignored)

## Client source of truth

**`loot&lasers/` (Godot) is the player client.** Design, layout, copy, and flow live there.
Do not reintroduce a React/web SPA unless the user explicitly asks.

## Godot side nav ↔ operative console

Permanent layout contract in `loot&lasers/Scenes/Main/game_shell.gd` (see `.cursor/rules/side-nav-operative-console.mdc`):

- Operative console = fixed-height top chrome; side nav = leftover height under it.
- All page buttons stay visible at every window height — **no scroll**.
- Equal button heights + equal in-group gaps; keep group headings and larger between-group gaps.
- No min button height/font floor; console changes only rescale nav buttons, and vice versa must not disturb the console.
