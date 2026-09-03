# Phase 7 — Dungeons / Wormholes / Frontier

Production integration of independent D1–D10 tracks, infinite Wormhole bands, Frontier XP, and guaranteed Gear. Godot renders server state. The client does not author winners, XP, Gear, cooldowns, or Nova debits.

**Phase 8 Arena/PvP is live.** See `docs/PHASE8_ARENA_PVP.md`.

Historical `docs/PHASE7_MISSIONS.md` and `docs/PHASE_DUNGEON.md` are not authority for this phase.

## State model

Authoritative blob `character.phase7_pve` (`PHASE7_PVE_RULES_VERSION` = `phase7-pve-v1`):

| Field | Meaning |
| --- | --- |
| `dungeon_clears[10]` | One-time clears per Dungeon (0–10). Enemy 10 is the boss. |
| `wormhole_next_index` | Absolute 0-based Wormhole encounter. Band/enemy derived. |
| `dungeon_cooldown_until` | Shared D1–D10 cooldown (ISO). |
| `wormhole_cooldown_until` | Independent Wormhole cooldown (ISO). |
| `pending_settlement` | Frozen victory Gear when the backpack filled after launch. |

Serialize also exposes derived `dungeon_badges` / `dungeon_badge_ids` / `dungeon_badge_max` from completed tracks (`dungeon_clears[i] >= 10`). Identities are D1–D10. These are not a separate persisted counter. The Godot client keeps the current Dungeon view in DungeonManager, not only as a nested field on the active character.

`dungeon_pending_combat` still holds the committed Phase 3 event stream, `meta` (content, dungeon id, encounter, wormhole index), and `settlement` (XP/Frontier/Gear freeze).

Compatibility `dungeon_planet` / `dungeon_enemy` in the serialized blob are **derived** from tracks. They are not completion authority.

## Progression

- Ten independent level-gated tracks. Gates and enemy levels come only from `dungeonUnlockLevel` / `dungeonEnemyLevel`.
- A character may fight only that Dungeon's next uncleared enemy. Defeat does not clear. Completed tracks cannot be replayed.
- Completing one Dungeon does not advance another. A later unlocked Dungeon can progress while earlier tracks are incomplete.
- Wormhole unlocks only at **100/100** standard clears (`DUNGEON_STANDARD_TOTAL_CLEARS_FOR_WORMHOLE`). D10 completion alone does not unlock it.
- Wormhole is an infinite sequence of 10-enemy bands. Enemy 10 is the band boss. Levels from `wormholeEnemyLevel(i) = 202 + 2*i`.

## Archetypes

Version `phase7-archetype-v1`. Global mix32 permutation of a 4/3/3 bag. Extra-slot start: Dungeons Reflex, Wormhole Tech. Frozen in `src/lib/productionMath/fixtures/phase7-archetype-schedule.json`. Not `secureRandom`, not character/class seeded. Enemy 10 is included in the 4/3/3 bag.

Attribute split: 35% primary / 25% Vitality / 20% Luck / 10% / 10% via `distributeEnemyAttributes`. No class passive on generated enemies.

## Combat

`SimulateCombat` / `simulateBattle` (Phase 3). Player outgoing ×1.0. Dungeon/Wormhole enemy outgoing ×1.10 (`combatContextMultiplier`). Player passives and Phase 5 Stims apply. Enemies `suppressClassPassive`. Runtime RNG is server-owned; tests inject RNG. Godot replays the committed event stream.

## Cooldowns and skips

- One hour Dungeon cooldown for all D1–D10. One hour Wormhole cooldown. Independent.
- Victory **and** defeat start the applicable cooldown when Prepare commits combat.
- Skip 25 Nova (`DUNGEON_WORMHOLE_SKIP_NOVA`) with explicit selector `dungeon` | `wormhole`. `request_id` is required. The skip ledger (`PHASE7_SKIP_LEDGER_TYPE`) scopes the client ID; reusing it with a different selector is `DUNGEON_SKIP_ID_CONFLICT` and does not mutate. Duplicate retry of the same selector returns the committed result and debits Nova once.
- The client retains one skip ID per activity until a definitive HTTP result. Displayed remaining time is `displayedCooldownRemainingMs(serverRemaining, monotonicElapsed)` and is re-snapshotted from each server response.

## Rewards / Frontier / Gear

**Operation order (Prepare freeze, Finish apply):** snapshot `playerLevelAtVictory` and leftover XP → `dungeonEncounterXp` / `wormholeEncounterXp` → `frontierBonusPct` / `applyFrontierBonus` (still using the pre-grant player level) → `projectedProgressionAfterXp` → roll rarity/slot → `GenerateGearItem` at **post-XP** economic/display level with `applyPveHiddenBudgetOffset: true` (hidden stat-budget = post-XP + PvE offset) → freeze. Finish grants the frozen XP then inserts or parks the frozen Gear. Duplicate Finish of a settled combat ID never clears a different pending combat.

- Defeat: zero of every reward type. No Gear RNG. Cooldown still starts at Prepare. Frozen result keeps true enemy level, archetype, boss flag, dungeon/band, and combat ID.
- Victory: production XP + Frontier on XP only + exactly one Gear.
- Regular rarity 85/10/5 Rare/Epic/Legendary. Boss 80/20 Epic/Legendary.
- Origin `dungeon` or `wormhole`. No collection XP added onto Dungeon/Wormhole XP, no Stardust, Stim, Junk, chest, auto-equip, GES, or weekly Nova dungeon progress.
- Hidden PvE +5→+10 is stat-budget only; displayed economic/resale level is the post-XP character level.

## Dungeon collection badges

Completing all ten one-time enemies in any standard Dungeon track awards that Dungeon's one badge. D1–D10 can each award once, in any order. Maximum ten. Derived from `phase7_pve.dungeon_clears` (`dungeonBadgeCount`). Wormhole and Frontier do not add Dungeon badges. Mission/Arena collection XP and Cosmic Vault summaries consume this count.

## Weekly Nova

The retired "Dungeon Delver" weekly objective is no longer generated or progressed. Dungeon/Wormhole victories do not advance it. An unclaimed in-progress dungeon weekly cannot be claimed (`WEEKLY_QUEST_RETIRED`). Nova already claimed before this correction is left in place. Arena and Mission weekly objectives are unchanged.

## Backpack recovery

Hard cap 10 unequipped items. Prepare rejects `INVENTORY_FULL` before sim/cooldown/rolls. If the bag fills after launch, Finish parks the frozen Gear on `phase7_pve.pending_settlement` (not Stardust compensation, not generic `pending_loot`). `ClaimPhase7Settlement` inserts the same item. Duplicate claim replays. New fights are blocked while a Phase 7 settlement is pending.

Atomic boundary: `wrap()` → `withTransactionAsync`. Cooldown + combat snapshot + settlement freeze commit together on Prepare. XP, track advance, Gear insert-or-park commit together on Finish.

## Endpoints

| Handler | Role |
| --- | --- |
| `SyncDungeonState` / `GetDungeonStatus` | Tracks, Wormhole, both cooldowns, pending combat/settlement. Versioned migration. |
| `PrepareDungeonCombat` | Client may send Dungeon id or Wormhole; server derives the enemy. |
| `FinishDungeonBattle` | Acknowledges committed combat. Ignores client winner/rewards. |
| `ClaimPhase7Settlement` | Recovers parked Gear. |
| `SkipDungeonCooldown` | Selector `dungeon` \| `wormhole`. |

## Migration

Development PvE state is disposable. `needsPhase7Migration` resets only Dungeon/Wormhole fields to empty tracks. It does **not** infer 100 clears from D10 and does **not** convert the old shared cooldown into contradictory independent history. Unrelated Gear, currencies, Missions, Stims, and Market state are preserved.

## UI

Galaxy map shows all ten Dungeons from `dungeon.tracks` (independent lock/progress). Wormhole stays locked until 100/100. Separate cooldown skip by viewed content. Recover Gear CTA when a settlement is parked. Combat overlay is unchanged Phase 3 replay.

## Tests

`npm run test:phase7-pve` composes `test-phase7-pve.mjs`, `test-dungeon.mjs`, `test-dungeon-enemy.mjs`, and `test-phase7-client-contract.mjs`.
