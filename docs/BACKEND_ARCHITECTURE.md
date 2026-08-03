# Backend architecture

Loot & Lasers uses an intentional hybrid boundary, not dual gameplay authority:

| Layer | Role |
|-------|------|
| Nakama (Docker / staging, port 7350) | Authentication, user identity, session creation/validation/lifecycle only |
| Node API (`server/`, port 8787) | **All authoritative gameplay**, validation, persistence, rewards, and state changes |
| Godot (`loot&lasers/`) | Primary GDScript client; Nakama login followed by a Node gameplay-token exchange |

Node `Character` is the selected-character gameplay ledger, including Fuel,
Stardust, and Nova. Existing Nakama gameplay modules and storage are restoration
debt from the incomplete migration. They must not be expanded or treated as the
target authority.
See `docs/WALLET_ARCHITECTURE.md`.

### Auth bridge (current)

1. Godot login/register → Nakama `authenticate_email`
2. Godot → `POST /api/auth/nakama-bridge` with the Nakama session token; Nakama passwords never cross into Node
3. Node validates the session against Nakama HTTP, atomically resolves the unique `users.nakama_user_id` mapping, and returns a stateless 10–15 minute gameplay JWT
4. Gameplay JWT `sub` is the immutable Nakama user id; issuer, audience, `iat`, `exp`, and `jti` are required, and `exp` never exceeds the Nakama session
5. Node resolves the Loot & Lasers account from the verified subject, then resolves and ownership-checks `users.active_character_id`
6. Godot proactively re-exchanges before expiry using a currently valid Nakama session
5. Automated dual-stack path: `npm run test:godot-auth-flow` (also picked up by `npm run verify:backend`)

Legacy Node password routes remain for compatibility, but Godot never uses them.
Do not create new Nakama gameplay services.

## Legacy Nakama migration inventory (not target authority)

| Phase | Service | Public RPCs | Writes? |
|-------|---------|-------------|---------|
| 1 | Auth session | (device auth) | session |
| 2 | RPC framework | — | — |
| 3 | Profile | `profile_get`, `profile_update` | yes |
| 4 | Inventory | `inventory_get` | no |
| 5 | Legacy Nakama wallet | `wallet_get` (+ internal credit/debit) | retained; not the Godot display ledger |
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

## Client → authoritative gameplay pattern

```
UI
 → *Manager (autoload)
 → GameApiClient with short-lived gameplay JWT
 → Node resolves Nakama identity mapping + selected owned Character
 → Node gameplay service / SQLite
 → Manager signals
 → UI
```

Rules:

- Never trust client-supplied account, owner, Character, balances, rewards, combat outcomes, progression, or timestamps.
- The selected Character is Node `users.active_character_id`; Nakama profile selection is ignored by the authentication foundation.
- Character CRUD reads and filters are account-scoped on Node. Foreign reads and writes fail.
- One backend service per phase/commit; independently testable and reversible.

## Legacy Nakama mission implementation

This is a historical implementation that must be restored to Node in a dedicated
gameplay phase. The authentication foundation does not resume Nakama mission state
during boot.

| Concern | Authority |
|---------|-----------|
| Mission generation | Target: Node; legacy: Nakama `missions_get` / `missions_refresh` |
| Mission ownership | Target: Node; legacy: Character-level Nakama storage |
| Mission start | Target: Node; legacy: Nakama `mission_start` |
| Timers / completion eligibility | Target: Node; legacy: Nakama `mission_status` |
| Local board cfg | **Display cache only** — never generates; Nakama wins on conflict |
| Node `LaunchMission` / `Mission` entity | **Not used** for live Cantina |
| Rewards / XP / loot | Mission claim service; XP remains deferred where documented |
| Fuel / Nova payment | Trusted Nakama→Node wallet bridge; Node Character ledger |

Collections: `mission_boards/<character_id>`, `active_missions/<character_id>`.

See `docs/PHASE7_MISSIONS.md` and `docs/PHASE8_MISSION_MIGRATION.md`.

## Remote config (Phase 10)

Server-authoritative configuration namespaces (`global`, `missions`, `client_ui`) and feature flags.
Public RPC: `config_get` (client-visible only). Mutations are internal helpers — not registered.
Environment: `LOOT_ENVIRONMENT` on Nakama runtime. See `docs/PHASE10_REMOTE_CONFIG.md` and `docs/STORAGE_MIGRATIONS.md`.

## Legacy Nakama equipment mutations (Phase 11)

These RPCs are historical migration artifacts, not the target authority. Node Items
remain authoritative during restoration; the Godot Hero compatibility path uses
Node through `AuthManager`.
See `docs/PHASE11_EQUIPMENT_MUTATIONS.md`.

## Legacy Nakama reward service (Phase 12)

Internal orchestrator in `modules/rewards.lua`. No public grant RPC.
Player-facing currency delivery routes to the compatibility-authoritative Node
Character ledger through the trusted bridge. Server-generated item instances use
`inventory.grant_item_instance` (wired in Phase 13).
XP/premium still rejected. Gated `dev_reward_test` for local soft-currency verification. Missions **not** connected yet.
See `docs/PHASE12_REWARD_SERVICE.md`.

## Legacy Nakama loot generation (Phase 13)

Internal LootService in `modules/loot.lua`. Server-side tables/pools in `modules/data/`. Deterministic weighted rolls → item instance → RewardService grant.
No generic public loot RPC. Gated `dev_loot_test` only.
See `docs/PHASE13_LOOT_GENERATION.md`.

## Legacy Nakama mission rewards (Phase 14)

`mission_claim` connects MissionService → LootService → RewardService.
Snapshot reward references at mission generation. Stardust + sample loot; XP explicitly unsupported.
Godot `MissionManager` claims via Nakama only. See `docs/PHASE14_MISSION_REWARDS.md`.

## Legacy Nakama shops (Phase 15)

`modules/shops.lua` — character-level `general` shop. Soft currency buy/sell; free cooldown refresh.
Godot `ShopManager` uses Nakama; Node EnsureShop/BuyShop disabled for stalls.
See `docs/PHASE15_SHOPS.md`.

## Legacy Nakama combat engine (Phase 17)

`modules/combat.lua` — reusable server-authoritative simulator (`combat_simulate`).
Equipment and formulas loaded on the server; deterministic RNG; structured combat log for Godot animation.
Does not implement Arena, Dungeons, Bosses, Guild Wars, or PvE modes. See `docs/PHASE17_COMBAT_ENGINE.md`.

## Legacy Nakama Arena (Phase 18)

`modules/arena.lua` — character Arena state, matchmaking, rankings, direct challenges.
Combat via CombatService; Elo rating + lower-ranked gain penalties; custom `arena_index` (character-safe).
Godot `ArenaManager` uses Nakama; local combat settlement disabled. No Arena rewards yet.
See `docs/PHASE18_ARENA.md`.

## Legacy Nakama social and chat (Phase 19)

`modules/social.lua` + `modules/chat.lua` — account-level friends/blocks and global/DM chat.
Native Nakama friends + channel APIs; RealtimeManager owns one Nakama socket.
Guild remains on Node. See `docs/PHASE19_SOCIAL_CHAT.md`.

## Legacy Nakama mail (Phase 20)

`modules/mail.lua` — account-level inbox, player text mail, system/reward mail (internal),
attachment claims via RewardService, soft delete, pagination, Nakama notifications.
Godot `MailManager` + `RealtimeManager.nakama_notification`. See `docs/PHASE20_MAIL.md`.

## Hero / inventory UI equip path (compatibility)

Hero and Inventory pages render **Node** `Item` rows (`StatsManager` / `AuthManager.list_items`).
Equip, unequip, and stim use go through `AuthManager` → Node Item PATCH / `UseConsumable`
(web `useInventory` parity). See `docs/HERO_PAGE_UI.md`.

`EquipmentManager` still owns Nakama `equipment_*` RPCs for Nakama inventory instance IDs
(e.g. shop grants). Do not send Node Item UUIDs into those RPCs until inventories are bridged.
