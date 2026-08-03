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
| 9 | Shared runtime + verification | `modules/lib/*`, `npm run verify:backend` | infrastructure only |
| 10 | Remote config + feature flags | `config_get` | system storage; mutations internal-only |
| 11 | Equipment mutations | `equipment_get`, `equipment_equip`, `equipment_unequip` | equipment + inventory moves |
| 12 | Central reward service | internal `apply_reward_bundle`; gated `dev_reward_test` | soft currency via wallet |

## Shared library

See `docs/BACKEND_SHARED_LIBRARY.md`. Prefer `require("lib.*")` for auth, responses, validation, storage wrappers, time, logging, and transaction-id helpers.

## Verification

See `docs/BACKEND_VERIFICATION.md`. Run `npm run verify:backend` before backend commits.

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

## Remote config (Phase 10)

Server-authoritative configuration namespaces (`global`, `missions`, `client_ui`) and feature flags.
Public RPC: `config_get` (client-visible only). Mutations are internal helpers — not registered.
Environment: `LOOT_ENVIRONMENT` on Nakama runtime. See `docs/PHASE10_REMOTE_CONFIG.md` and `docs/STORAGE_MIGRATIONS.md`.

## Equipment mutations (Phase 11)

Nakama is authoritative for equip/unequip. Representation B: instances move between `inventories` and `equipment`.
Godot uses `EquipmentManager`; legacy `AuthManager.equip_item` / `unequip_item` are disabled.
See `docs/PHASE11_EQUIPMENT_MUTATIONS.md`.

## Reward service (Phase 12)

Internal orchestrator in `modules/rewards.lua`. No public grant RPC.
Soft-currency credits via `wallet.credit_currency`. Server-generated item instances via `inventory.grant_item_instance` (wired in Phase 13).
XP/premium still rejected. Gated `dev_reward_test` for local soft-currency verification. Missions **not** connected yet.
See `docs/PHASE12_REWARD_SERVICE.md`.

## Loot generation (Phase 13)

Internal LootService in `modules/loot.lua`. Server-side tables/pools in `modules/data/`. Deterministic weighted rolls → item instance → RewardService grant.
No generic public loot RPC. Gated `dev_loot_test` only.
See `docs/PHASE13_LOOT_GENERATION.md`.

## Mission rewards (Phase 14)

`mission_claim` connects MissionService → LootService → RewardService.
Snapshot reward references at mission generation. Stardust + sample loot; XP explicitly unsupported.
Godot `MissionManager` claims via Nakama only. See `docs/PHASE14_MISSION_REWARDS.md`.
