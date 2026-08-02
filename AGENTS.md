# AGENTS.md

## Project

Loot & Lasers — self-hosted game. Client in `src/`, API in `server/`.
Godot client (desktop port) in `loot&lasers/`.

## Commands

- Frontend: `npm run dev`
- API: `npm run server` (or `cd server && npm run dev`)
- Seed admin: `npm run server:seed`
- API smoke test: `npm run test:api`
- Godot script audit: run Godot headless with `-s res://_audit_all.gd` from `loot&lasers/`

## Notes

- Game client: `src/api/gameClient.js` (`api` export)
- Do not add third-party hosted backend SDKs or vendor-specific Vite plugins
- Prefer extending the `src/` client; keep game rules in `src/lib/`
- DB file: `server/data/game.db` (gitignored)

## Godot ↔ web parity

**`src/` is the source of truth** for design, layout, copy, flow, and feel.

When working in `loot&lasers/`:

- Replicate the web UI/UX as closely as possible (layout, hierarchy, palette, typography, spacing, icons, animations, menus, gameplay flow).
- Do **not** redesign or modernize unless the user explicitly asks.
- Use Godot strengths for performance and animation fidelity — not for inventing a new look.
- If exact parity is impossible, explain why and propose the closest visual/functional equivalent.
- Always inspect the matching `src/` page or `src/components/game/*` component before changing Godot UI.

## Godot side nav ↔ operative console

Permanent layout contract in `loot&lasers/Scenes/Main/game_shell.gd` (see `.cursor/rules/side-nav-operative-console.mdc`):

- Operative console = fixed-height top chrome; side nav = leftover height under it.
- All page buttons stay visible at every window height — **no scroll**.
- Equal button heights + equal in-group gaps; keep group headings and larger between-group gaps.
- No min button height/font floor; console changes only rescale nav buttons, and vice versa must not disturb the console.
