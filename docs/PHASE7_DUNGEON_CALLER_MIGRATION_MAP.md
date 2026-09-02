# Phase 7 caller / stale-code migration map

Live authority is `docs/PHASE7_DUNGEON_WORMHOLE_FRONTIER.md`. Historical `docs/PHASE_DUNGEON.md` is not gameplay authority.

## Live production

| Symbol / path | Role |
| --- | --- |
| `src/lib/productionMath/pve.js` | Unlock, DRU, enemy level, XP, Wormhole, Frontier, EPA budget, rarity rollers |
| `src/lib/productionMath/attributes.js` | `expectedPlayerAttributes`, `distributeEnemyAttributes` |
| `src/lib/dungeonArchetypeSchedule.js` | Deterministic 4/3/3 schedule |
| `src/lib/dungeonEngine.js` | `generateDungeonEnemy`, `freezePhase7Settlement` |
| `src/lib/dungeonData.js` | Planet lore/names only |
| `server/src/shared/dungeonService.js` | Tracks, cooldowns, serialize, migration |
| `server/src/shared/combatService.js` | `simulateDungeonCombat` / Prepare pending |
| `server/src/functions/economyFollowOn.js` | Sync/Get/Prepare/Finish/Claim/Skip |
| `loot&lasers/Autoload/DungeonManager.gd` | Server blob + Prepare/Finish/Claim/Skip |
| `loot&lasers/Scenes/UI/galaxy.gd` | Ten-track presentation |
| `loot&lasers/Scripts/SpiralStage.gd` | Independent lock/progress orbs |

## Compatibility / migration-only

| Path | Disposition |
| --- | --- |
| `dungeon_planet` / `dungeon_enemy` on Character | Derived cursor in serialize; migration resets; not 100-clear proof |
| `economyFormulas.js` `DUNGEON_UNLOCK_LEVELS` 1-indexed table | Presentation wrapper; `getDungeonUnlockLevel` calls production |
| `generateDungeonEnemy(planet, idx, level)` positional | Test/compat shim over object form |
| `dungeonEngine` 1-indexed `DUNGEON_ENEMY_LEVELS` | Wraps production 0-indexed tables |

## Test-only guards

| Path | Notes |
| --- | --- |
| `server/scripts/test-dungeon.mjs` | Phase 7 lifecycle, Finish/skip idempotency, defeat identity |
| `server/scripts/test-dungeon-enemy.mjs` | Production EPA budgets |
| `server/scripts/test-phase7-pve.mjs` | Aggregate progression/archetype/settlement, badges, post-XP Gear |

## Historical documentation (non-executable)

- `docs/PHASE_DUNGEON.md`
- `docs/PHASE7_MISSIONS.md` (filename collision; Missions, not this phase)

## Unrelated / later phase

- Mission enemy construction (`constructMissionEnemy`) — still production EPA × 0.35, not Dungeon 1.20/1.30
- Arena bots
- Phase 8 Arena rewards — **not started**
- `src/lib/expectedPlayerAttributes.js` PCHIP EPA — leftover for Mission/legacy tests; Dungeon/Wormhole construction does not call it

## Removed from live Dungeon/Wormhole paths

- Sequential planet/enemy cursor as authority
- D10-boss-only Wormhole unlock
- Shared Dungeon/Wormhole cooldown
- 35-level Wormhole geometry / `185 + 25 × depth`
- Live `druToRewards` ×2.0 XP (deleted from `economyFormulas.js`)
- Collection XP on Dungeon/Wormhole
- Consumable / Stim / Junk / Stardust / chest Dungeon rewards
- `grantOrCompensate` Stardust overflow for Phase 7 Gear
- Per-attempt random archetypes
- Client-authoritative winner/reward/cooldown
- Player ×2.5 / enemy ×2.75 combat stacking
- GES / auto-equip
- Historical Dungeon rarity 40/30/20/10 in `stardustEconomy.js`
- PCHIP `dungeonEnemyAttributeBudget`
- Godot `DungeonRules.generate_enemy`
- Weekly Nova "Dungeon Delver" as an active objective

## Correction-pass live callers

| Symbol / path | Role |
| --- | --- |
| `src/lib/dungeonBadges.js` | Independent-track Dungeon badge count from `dungeon_clears` |
| `src/lib/productionMath/progression.js` `projectedProgressionAfterXp` | Post-XP Gear economic level |
| `displayedCooldownRemainingMs` | Monotonic local countdown from last server remaining_ms |
| `PHASE7_SKIP_LEDGER_TYPE` | Skip Nova debit keyed by `selector:request_id` |
