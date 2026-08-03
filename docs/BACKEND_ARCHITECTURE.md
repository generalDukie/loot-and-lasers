# Backend architecture

Loot & Lasers uses a **dual stack** during the Nakama migration:

| Layer | Role |
|-------|------|
| Node API (`server/`, port 8787) | Live gameplay auth (JWT), entities, claim/fuel/shop economy |
| Nakama (Docker, port 7350) | Parallel session + authoritative services migrating phase-by-phase |
| Godot (`loot&lasers/`) | Client; managers call `NakamaManager` / `GameApiClient` |

## Phase map

| Phase | Service | Public RPCs | Writes? |
|-------|---------|-------------|---------|
| 1 | Auth session | (device auth) | session |
| 2 | RPC framework | — | — |
| 3 | Profile | `profile_get`, `profile_update` | yes |
| 4 | Inventory | `inventory_get` | no |
| 5 | Wallet | `wallet_get` (+ internal credit/debit) | mutations internal-only |
| 6 | Equipment | `equipment_get` | no |
| 7 | Missions core | `missions_get`, `missions_refresh`, `mission_start`, `mission_status` | board/active only; **no rewards** |

## Client → server pattern

```
UI
 → *Manager (autoload)
 → NakamaManager.call_authenticated_rpc / invoke_rpc
 → modules/*.lua
 → Nakama storage
 → Manager signals
 → UI
```

Rules:

- Never trust client-supplied account ids, balances, or authoritative timestamps.
- Character-scoped data validates `character_id == profile.selected_character_id`.
- One backend service per phase/commit; independently testable and reversible.

## Mission ownership (Phase 7)

Character-level. Collections: `mission_boards/<character_id>`, `active_missions/<character_id>`.

Live Cantina launch/claim/fuel remain on Node until a later cutover. See `docs/PHASE7_MISSIONS.md`.
