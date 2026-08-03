# Backend architecture

Loot & Lasers uses a **dual stack** during the Nakama migration:

| Layer | Role |
|-------|------|
| Node API (`server/`, port 8787) | Gameplay auth (JWT), character/items economy, fuel buy/sync, shops |
| Nakama (Docker, port 7350) | Authoritative services migrating phase-by-phase |
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
| 7 | Missions core | `missions_get`, `missions_refresh`, `mission_start`, `mission_status` | board/active; **no rewards** |
| 8 | Mission authority | same RPCs | **Nakama is sole mission SoT** |

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

## Mission authority (Phase 8)

**Nakama is the single authoritative mission system.**

| Concern | Authority |
|---------|-----------|
| Mission generation | Nakama `missions_get` / `missions_refresh` |
| Mission ownership | Character-level Nakama storage |
| Mission start | Nakama `mission_start` |
| Timers / completion eligibility | Nakama `mission_status` |
| Local board cfg | **Display cache only** — never generates; Nakama wins on conflict |
| Node `LaunchMission` / `Mission` entity | **Not used** for live Cantina |
| Rewards / XP / loot / fuel debit | Deferred (not granted by mission core) |

Collections: `mission_boards/<character_id>`, `active_missions/<character_id>`.

See `docs/PHASE7_MISSIONS.md` and `docs/PHASE8_MISSION_MIGRATION.md`.
