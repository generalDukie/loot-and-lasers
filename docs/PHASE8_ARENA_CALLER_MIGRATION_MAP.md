# Phase 8 caller / authority migration map

Live authority is `docs/PHASE8_ARENA_PVP.md` plus `docs/PRODUCTION_FORMULA_REGISTRY.md` (PM-ARENA-XP / SD / ORDER). Do not infer live rules from Nakama Lua or historical Restoration Arena docs.

## Live production

| Symbol / path | Role |
| --- | --- |
| `src/lib/productionMath/progression.js` `arenaXpReward` | Canonical Arena XP |
| `src/lib/productionMath/economy.js` `arenaStardustReward` | Canonical Arena Stardust |
| `src/lib/productionMath/market.js` `productionGameDayId` | 19:00 UTC game-day key (aliases `contrabandPeriodId`) |
| `src/lib/productionMath/constants.js` `ARENA_COOLDOWN_SKIP_NOVA` | Skip cost = 10 Nova |
| `src/lib/stardustEconomy.js` | `ArenaWinStardust` → `arenaStardustReward`; rewarded-win cap helpers |
| `src/lib/gameData.js` `getArenaXpReward` | Product wrapper → `arenaXpReward` |
| `server/src/shared/economyFormulas.js` | `computeArenaRewards` preview; `applyArenaRewardGrant` settlement order |
| `server/src/shared/combatService.js` | `simulateArenaCombat` / pending commit / pending-conflict |
| `server/src/functions/economyFollowOn.js` | Sync/Get/Prepare/Finish/Skip/Recover |
| `server/src/shared/arenaService.js` | Offers, cooldown, rank, serialize (no free-attempt fields) |
| `server/src/arena/service.js` | Direct-challenge create/complete from pending combat |
| `server/src/arena/routes.js` | Challenge prepare/complete → Prepare/Finish |
| `loot&lasers/Autoload/ArenaManager.gd` | Identifiers + skip intent only |
| `loot&lasers/Scenes/UI/arena.gd` | Lobby: rating, rank, offers, cooldown skip, rewarded wins / rating-only |
| `loot&lasers/Scripts/ArenaRules.gd` | Presentation mirror (not settlement) |
| `loot&lasers/Scripts/CodexCatalog.gd` | Player-facing Arena rules |

## Removed from live code

| Former symbol | Disposition |
| --- | --- |
| `ARENA_DAILY_FREE_BATTLES` | Deleted. Use `ARENA_REWARDED_WINS_PER_DAY`. |
| `ARENA_PAID_BATTLE_COST` | Deleted. No extra-battle purchase. |
| `arena_attempts_left` / `arena_attempts_date` | Not read, written, serialized, scheduled, or admin-adjusted. Stripped from entity create/update. |
| `is_free` / `daily_attempt_limit` | Not an Arena request/reward contract. |
| Godot `PAID_BATTLE_COST` / `DAILY_FREE_BATTLES` | Deleted. |
| `RefreshArenaOpponents` | Returns `ARENA_REFRESH_REMOVED`. Godot `refresh_opponents` is a soft reload. |

## Historical / quarantined (not live entrypoints)

| Path | Disposition |
| --- | --- |
| `modules/arena.lua` RPCs | Registered as `rpc_arena_gameplay_blocked`. File kept; not deleted. |
| `modules/lib/arena_rating.lua` | Obsolete Nakama rating. No Godot callers. |
| `docs/PHASE18_ARENA.md` | Obsolete Nakama generation. |
| `docs/PHASE8_MISSION_MIGRATION.md` | Old Missions numbering. Not this phase. |
| Direct-challenge `body.won` | Removed. Complete requires matching pending combat. |

## Intentionally unchanged

- Ladder Elo K / delta clamps
- Direct-challenge gap, repeat-opponent, practice, anti-farm
- Three-offer board, 2h TTL, real-preferred / bot fallback
- Phase 3 combat math, class passives, Stims, derived-stat caps
- Phase 7 Dungeon/Wormhole 4/3/3 archetype schedule
- Unrelated ET clocks (missions, dungeon lives, daily login)

## Tests

| Path | Notes |
| --- | --- |
| `server/scripts/test-phase8-arena.mjs` | Authority, cap, 19:00 UTC, skip, recovery, privacy |
| `server/scripts/test-phase8-pvp-matrix.mjs` | Player-vs-player class evidence separate from bot integration |
| `server/scripts/run-phase8.mjs` | Composed with existing `test-arena*` |
| `scripts/verify_nakama_gameplay_blocked.mjs` | Godot must not invoke Nakama `arena_` RPCs |
