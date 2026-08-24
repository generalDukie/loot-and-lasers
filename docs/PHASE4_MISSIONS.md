# Phase 4 — Missions

Authoritative Mission economy, snapshots, combat construction, and physical rewards live in `src/lib/productionMath/missions.js`. Node settlement in `server/src/functions/economy.js` is the only write path. Godot renders server values and does not invent Fuel, duration, XP, Stardust, or loot.

## Board

- Exactly **3** simultaneous offers (`MISSION_OFFER_COUNT`).
- Offers persist per character until a completed/claimed/failed Mission rotates the board.
- There is **no** free/paid/timer/login/navigation/reconnect reroll.
- Duplicate economic offers (duration + XP variance + Stardust variance) are nudged apart with named retry limits.
- If a normal duration in the level pool is affordable, the board always contains at least one affordable offer.
- If no normal duration is affordable and remaining Fuel ≥ 0.25, all three offers use the remainder exception: `FuelCost = remaining Fuel`, `Duration = Fuel × 60`.

## Duration / Fuel

Discrete pools: `MISSION_DURATION_POOLS`. L21+ is intentionally stable (`[300, 600, 900, 1200]`). Fuel = duration/60, quantized to 0.25. Minimum 0.25 Fuel.

## Snapshot

On launch, `snapshotMissionAcceptance` freezes level, Fuel, duration, both variances, preview XP/Stardust, item-level basis, offer id, flavor, enemy EPA level/budget, collection %, and Nexus flag. Leveling during a Mission does not change the accepted payout or enemy. Unaccepted boards may refresh **preview arithmetic** from the live acceptance level without rerolling duration/variance/ids.

## XP / Stardust

`missionXpReward` / `missionStardustReward` in productionMath. XP uses named `MISSION_XP_EFFICIENCY` and `MISSION_XP_REWARD_SCALAR` (each 0.85). Stardust has no XP-efficiency scalar. Variances are independent Uniform(0.90, 1.10). Defeat uses `DEFEAT_REWARD_FACTOR` (50%). Preview at acceptance = snapshot = victory grant.

## Skip

`missionSkipCostNova(originalFuel)`: `max(0.5, ceil(fuel × 0.10 × 2) / 2)`. Elapsed time never reduces the price. Skip does not guarantee victory, alter the enemy, or reroll loot.

## Enemy / combat

`constructMissionEnemy` uses snapshot level, `ROUND(EPA(L) × 0.35)`, hidden Might/Reflex/Tech at 1/3 each, 35/25/20/10/10 allocation, Mission-enemy base-damage ramp, current PCHIP caps. No class passive, Gear, or race. Combat is the Phase 3 engine; `PrepareMissionCombat` is idempotent.

Outgoing curve: certified knots in `MISSION_OUTGOING_KNOTS`. Live flag `APPLY_CERTIFIED_MISSION_ENEMY_OUTGOING_IN_LIVE_COMBAT` is **ON**. Applied exactly once through `contextMultiplierFor` → `combatContextMultiplier`. Not Dungeon/Wormhole ×1.10.

Mission enemy MaxHP is the universal Vitality polynomial, then Mission-only:

`missionEnemyMaxHp = roundHalfEven(maxHp(Vitality) × 2.50 × 1.20)`

where 2.50 is `MISSION_ENEMY_HP_NATIVE_DAMAGE_NORMALIZATION` (Phase 3 native player-damage compensation) and 1.20 is `MISSION_ENEMY_HP_PACING_MULTIPLIER` (approved extra combat presence). Effective scale = 3.00. Vitality, EPA, attributes, Base Damage, Crit, Dodge, and resists are unchanged. Player Mission outgoing remains ×1.0. There is no Mission player damage nerf.

Acceptance snapshot freezes `mission_combat_rules_version`, `mission_enemy_hp_scale`, and `mission_enemy_outgoing_multiplier` so in-flight Missions cannot silently retune.

### Resolved combat history

1. Mission outgoing was staged OFF during Phase 3.
2. Initial Phase 4 synthetic purchased-ish gate reported ~46.9% wins.
3. That fixture was invalidated: it severely understated realistic player progression.
4. Exact retained Test 18 states produced 100% wins with certified outgoing.
5. Certified outgoing was approved.
6. Native player-damage hardening made Missions too short: ~2.79 turns / ~95.6% HP.
7. HP ×2.50 mathematically restored historical relative survivability: ~6.31 turns / ~87.7% HP.
8. Human approved an additional ×1.20 Mission enemy pacing factor.
9. Final HP scale = ×3.00.
10. Approved diagnostic: ~7.41 turns / ~85.2% winner HP / 100% audited wins.
11. Production outgoing is now ON.
12. Obsolete purchased-ish gate is no longer production authority (`server/scripts/diagnostic-mission-outgoing-purchased-ish.mjs` only).

Official exact-state certification: `server/scripts/test-phase4-mission-combat-activation.mjs`.
Diagnostic history retained in `docs/PHASE4_MISSION_OUTGOING_BLOCKER_REPORT.md` and `docs/PHASE4_MISSION_COMBAT_PACING_REPORT.md`.

## Loot (victory only)

Exclusive chain: Gear → Stim → Junk → None.

- Gear: `P = 1 - (1 - min(0.999, 0.30 + 0.025 × FuelSinceLastGear/12.5))^(F/12.5)`
- Stim given no Gear: `1 - 0.90^(F/12.5)` (10% at 12.5 Fuel). **Not** 25%.
- Junk given no Gear/Stim: `1 - 0.25^(F/12.5)` (75% at 12.5 Fuel)
- Mission Gear rarity: 60/30/10 Common/Uncommon/Rare. 0% Epic/Legendary.
- Item level: snapshot offsets 0–5 at 10/15/20/20/20/15, clamped to [1, snapshot].
- Gear generation: universal `GenerateGearItem`, origin `mission`.
- Stim: snapshot-level tier (Uncommon L1–19, Rare L20–49, Epic L50+). Sale/use is Phase 5.
- Junk value: `ROUND(MissionStardust × 0.45 × Uniform(0.60, 1.40))`, snapshotted.

Defeat does not run the item chain and does not mutate Gear pity.

## Backpack

Hard 10 unequipped items. Launch at 10/10 fails before Fuel debit. If the bag fills during an active Mission, claim fails with Backpack full, leaves the Mission claimable, and does not invent pending loot.

## Stale logic

| Path | Disposition |
|---|---|
| 20% flat Gear / mission-count miss streak | MIGRATED to Fuel pity |
| 50/25/15/8/2 Mission rarity | REMOVED (Mission Gear is 60/30/10) |
| 25% Stim conditional | SUPERSEDED (Test 18 = 10%) |
| 0.225 Junk coefficient | REMOVED (0.45) |
| Client-authoritative duration/XP/Stardust | RETIRED |
| Manual/daily/reconnect board reroll | RETIRED |
| Live-level rewards/enemy at claim | MIGRATED to acceptance snapshot |
| Mission player ×2.5 / enemy flat ×12 from L1 | NOT RESTORED |
| Ship/Hangar Mission bonuses | DISABLED (unchanged) |
| Stim resale 1 Stardust | HISTORICAL — Phase 5 |
