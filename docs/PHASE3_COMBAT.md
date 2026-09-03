# Phase 3 — Universal Combat Engine + Player-Facing Combat Feedback

Phase 3 migrates live Mission / Arena / Dungeon / Wormhole settlement onto locked Phase 0 `productionMath` via one shared engine. Godot replays the committed event stream. Stims (consumable system), Mission rewards, Market, Mining, GES, and combat-UI redesign are **out of scope**.

Void Runner **Stim Injector** is a class passive and is in scope.

---

# Phase 3 Combat Caller Migration Map

| Caller | Old path | New authoritative engine | Context | Passive authority | Client presentation | Old disposition |
|---|---|---|---|---|---|---|
| **Mission** | `PrepareMissionCombat` → `simulateMissionCombat` → `simulateBattle` | Same `SimulateCombat` → `arenaEngine` + `combatMath` | Live `content: "mission"` player ×1.0 (canonical Base Damage) / enemy ×1.0 (certified EL curve **staged** until Phase 4) | `classPassives.js`; foes suppressed | Godot overlay replays `events` | Curve locked in productionMath; live application deferred |
| **Arena** | `PrepareArenaCombat` → `simulateArenaCombat` → same engine, old math | Same engine | `content: "arena"` — both ×1.0; both sides use canonical player Base Damage | Full class passives for players and bots | `ArenaManager` → same overlay | FinishArenaBattle still reads committed pending winner (not client `won` on ladder) |
| **Dungeon** | `PrepareDungeonCombat` → `simulateDungeonCombat` | Same engine | `content: "dungeon"` (`mode: "dungeon"`) — player ×1.0 / enemy native Base Damage ×1.10 | Foes suppressed; player passives live | `DungeonManager` → same overlay | Reward tables **not** migrated |
| **Wormhole** | Same prepare as dungeon (`viewing_wormhole` meta) | Same engine | `mode: "dungeon"` / `content: "dungeon"` (identical multipliers) | Same as dungeon | Same overlay | Reward formulas **not** migrated |
| **Guild war** | Node `guildSocialService.simulateGauntlet` | Same `simulateBattle` | `content: "arena"` (PvP ×1.0 both; canonical player damage) | Full class passives | Existing guild presentation | `src/lib/guildEngine.js` duplicate gauntlet is not the live Node path |
| **Nakama `combat_simulate`** | `modules/combat.lua` + `combat_formulas.lua` | **Not a live Godot caller** | n/a | Old Lua passives/formulas | Unused by Godot Prepare* | Historical / training RPC. Dual-engine **blocker only if** a client still invokes it. Godot does not. |

Combatant stats:

- **Live players:** `composePermanentAttributes` (starting + free-from-level + purchases) + equipped Gear once + existing Stim buffs last.
- **Generated foes / arena bots:** snapshot `.stats` + Gear (bots use empty cosmetic weapon stats). Flag: `missionEnemy` / `dungeonEnemy` / `isBot` / `snapshotStats`.

RNG: production `secureRandom`. Tests inject sequences / LCG. Replay uses stored events — no reroll.

---

## Attack-resolution order (Test 18 / Phase 3)

Documented and implemented in `resolveNormalAttack` / `simulateBattle`:

1. Dirty Trick unlock at **total combat turn** 14 / 28 (before the attack)
2. Own-turn start: Shadow own-turn increment + every 10th own turn re-prime Phantom; Astral 10% barrier
3. Snapshot Kinetic Tantrum / Acquire Target modifiers
4. Phantom Signal forced miss (not Dodge; no Kinetic)
5. Natural Dodge unless Strong Tantrum guaranteed hit
6. Canonical attack. Players / Arena opponents / Dungeon-Wormhole enemies: native `playerBaseDamage` / `dungeonWormholeEnemyBaseDamage` (`37.5 + 0.008 × Primary^1.727`). Mission enemies (temporary): historical `rawStandardAttack` (`missionEnemy` EL&lt;25: `5+10*(EL-1)/24` else 15; plus `0.0032 × Primary^1.727`).
7. Universal variance Uniform(0.90, 1.10)
8. Overclock outgoing
9. Crit / Tantrum / Acquire Target (natural Crit damage ×1.5; Strong ×2.0; Normal ×1.5)
10. Three-channel resist (True Damage skips)
11. Overclock incoming (defender Technomancer)
12. Combat-context multiplier
13. `roundHalfEven`
14. Defensive Protocol `round(fd * 0.75)`
15. Barrier absorb, then HP
16. Enemy Crit vs Technomancer −2 stacks (floor 0)
17. Consume Tantrum / Acquire Target (including on miss/dodge)
18. Overclock tick: if stacks ≥ 6 vent 2 else +1
19. Stim Injector opening-charge consume / extra Void turn
20. Death check

Cosmic Engineer **Orbital Assistant** is **not** in the post-hit pipeline. It runs at the **start of the Engineer's own turn**, before step 1, on turns 2/4/6/8/10 then every 3rd from 13. Acquire Target therefore applies to that same strike; Fire Support resolves before the Engineer's attack; Defensive Protocol still lasts until the Engineer is hit.

Crit **chance** uses Phase 0 ForMax ×1.55, exponent 1.80, then `min(FromAttr, naturalCritResistLevelCap(L), 30%)` (cap-bypass passives remain separate). Dodge uses the same FromAttr curve with `naturalDodgeLevelCap(L)` and mature 25%. Each resistance channel uses `naturalCritResistLevelCap(L)` and mature 30%. Crit **damage** is ×1.5 unless a Tantrum override applies.

Natural level ceilings (not guaranteed stats):

| | L1 | L25 | L75 | L100+ |
|---|---:|---:|---:|---:|
| Dodge | 8% | 15% | 20% | 25% |
| Crit / each Resistance | 10% | 17.5% | 25% | 30% |

Interpolation is Fritsch–Carlson PCHIP. Combat and the character sheet consume `min(attribute-derived, level cap)`. Do not display the theoretical cap in place of the actual stat.

Named combat authorities: `src/lib/productionMath/constants.js` (HP, raw attack, caps, context multipliers, Mission ramp) and `src/lib/classPassives.js` (class-passive cadence/values). See `docs/PRODUCTION_NO_MAGIC_NUMBER_POLICY.md`.

---

## Resistance / damage architecture

Attacker archetype → damage channel:

| Archetype | Channel |
|---|---|
| Might | Might |
| Reflex | Reflex |
| Tech | Tech |

Defender resists from locked `productionMath.resistances` (natural cap 30%):

- Might character: INT resists Reflex + Tech; no Might self-resist
- Reflex character: STR resists Might; INT resists Tech; no Reflex self-resist
- Tech character: STR resists Might + Reflex; no Tech self-resist

True Damage (Fire Support) skips resist. It does **not** skip Defensive Protocol or Astral Barrier.

Hit events expose `resistPercent` / `resistedAmount`. Log line adds `· resist −N` when mitigation is material.

---

## Context multipliers

Player Damage is universal across combat contexts. Context-specific player tempo multipliers are ×1.0. Differences come from enemy construction, enemy context rules, resistance, Crit, variance, passives, and content mechanics — not a hidden blanket player damage multiplier.

Centralized in `productionMath.combatContextMultiplier` / `combatMath.contextMultiplierFor`:

| Content | Player outgoing | Enemy outgoing |
|---|---|---|
| Mission (certified primitive) | ×1.0 | `missionEnemyOutgoingMultiplier(EL)` (L1=0.30 … L200+=12.00) |
| Mission (**live settlement**) | ×1.0 | certified `missionEnemyOutgoingMultiplier(EL)` applied once |
| Dungeon / Wormhole | ×1.0 | ×1.10 (`DUNGEON_WORMHOLE_ENEMY_DAMAGE_MULT`) on native combat-scale Base Damage |
| Arena / PvP / guild | ×1.0 | ×1.0 (opponents use native player Base Damage) |

Native player Base Damage: `playerBaseDamage = 37.5 + 0.008 × Primary^1.727`. Algebraically identical to the historical `(15 + 0.0032 × Primary^1.727) × 2.5`. There is no live `PLAYER_BASE_DAMAGE_SCALE`. Dungeon/Wormhole enemies use the same native polynomial, then ×1.10, so they deal about 10% more baseline damage than an equivalently constructed combatant (preserving former unscaled ×2.75).

Mission enemies remain on historical `rawStandardAttack` until Phase 4.

The locked Mission enemy outgoing curve is unchanged in `productionMath`. Phase 4 live Mission combat applies it (`APPLY_CERTIFIED_MISSION_ENEMY_OUTGOING_IN_LIVE_COMBAT = true`) exactly once. Mission enemy MaxHP then receives the Mission-only ×2.50 native-damage normalization × ×1.20 pacing factor (effective ×3.00). Do not add a Mission player ×0.4 (or similar) inverse scalar.

Mission early base-damage ramp is **separate** from the outgoing curve.

Prior 0% telemetry used `distributeProgressingPlayerAttributes` (L50 sum 669 vs EPA 1277) with empty Gear arrays — not a live Mission player. EPA-analog players win ~100% even with the certified curve.

---

## Combat event schema

Structured objects (not prose-only). UI formats `text` / `kind` for the existing log. Settlement never parses log strings.

| type / kind | When | Fields | Player-facing | Persistent? |
|---|---|---|---|---|
| `initiative` | Combat open | `opening_side`, `attacker` | “X opens combat” | no |
| `attack` | Successful hit | `damage`, `crit`, `resistPercent`, `resistedAmount`, `damageType`, `guaranteedHit`, `variance`, `totalTurn`, `ownTurn` | hit / CRIT / resist note | no |
| `dodge` | Natural Dodge | `naturalDodge: true`, `damageType` | DODGE floater | may prime Tantrum |
| `miss` + `missKind: phantom_signal` | Forced miss | `kind: phantom_signal_miss` | FORCED MISS / scramble copy | Phantom consumed |
| `barrier` `barrier_absorbed` / `barrier_broken` | Shield takes damage | `absorbed`, `barrierRemaining` | SHIELD −N | barrier remaining |
| `passive` `astral_barrier_created` / `_restored` | Own-turn 10% | `barrier`, `barrierMax` | Barrier amount / refresh | barrier |
| `passive` `phantom_signal_armed` / `_reprimed` | Combat start / 10th own turn | `primed` | Phantom primed chip | yes |
| `passive` `kinetic_tantrum_normal` / `_strong` / `_consumed` | Dodge triggers / spend | `kineticTantrum`, `guaranteedHit` | Tantrum 1.5× / 2.0× chip | primed until next attempt |
| `passive` `dirty_trick_selected` | Start / total 14 / 28 | `dirtyTrick`, `dirtyTricks`, `openingCharges` | trick name chips | yes |
| `passive` `stim_injector_charge` | Extra Void turns | `before`, `after` | Stim Injector N | charge count |
| `passive` `overclock_ready` / `_stack_gained` / `_vented` / `_stacks_removed` | OC lifecycle | `before`, `after`, `stacks` | OC n/6 chip | yes |
| `passive` `orbital_assistant_activated` | Engineer own-turn cadence | `effect`, `engineerTurns` | protocol name | primed state |
| `secondary` `fire_support` | Fire Support hit | `damageType: TRUE`, `trueDamage` | TRUE damage floater | no |
| `dodge` `fire_support_dodged` | Fire Support Dodge | | DODGE | may prime Tantrum |
| `passive` `defensive_protocol_applied` / `_consumed` | Prime / spend | `amount`, `before`, `after` | Def. Protocol chip | one-hit |
| `passive` `acquire_target_applied` / `_consumed` | Prime / spend | `critBonus` | Acquire Target chip | next attack |
| End snapshot | Combat end | `playerEnd` / `opponentEnd` HUD fields | chips / HP | authoritative |

Also: `telemetry` `{ totalTurns, playerTurns, opponentTurns, playerDamage, opponentDamage, critCount, dodgeCount, forcedMissCount, passiveActivations }`.

---

## Passive implementation matrix

| Class | Old live behavior | Production behavior | Migrated? | Tests | UI feedback |
|---|---|---|---|---|---|
| Vanguard | Kinetic on Dodge; mixed guaranteed-hit rules | Own natural Dodge → 1.5× (can miss, consumed on attempt). Enemy natural Dodge → 2.0× guaranteed hit. Strong beats Normal. Forced miss does not trigger | Yes | phase3 + passives | Tantrum 1.5× / 2.0× chips + log |
| Astral Warden | Barrier proc | 10% at own turn start; 15% unrounded max HP, roundHalfEven; refresh not stack | Yes | phase3 + passives | Barrier N chip + absorb log |
| Shadow Operative | Two charges | First incoming forced miss; re-prime every 10th **Shadow own turn**. Not natural Dodge | Yes | phase3 + passives | Phantom primed chip; FORCED MISS |
| Void Runner | One trick at start | Distinct tricks at start, total turn 14, 28. Flashbang/Beacon +7.5pp cap-bypass. Stim Injector = next two attack turns (`openingCharges=2`) | Yes | phase3 + passives | Trick name chips; Stim Injector N |
| Technomancer | Uncapped; Crit −3 | Cap 6; +12.5% out / +5% in per stack; attack at 6 then vent 6→4; enemy Crit −2 floor 0 | Yes | phase3 + passives | OC n/6 from combat start (`overclock_ready`) |
| Cosmic Engineer | Every 2 turns forever | Own turns 2/4/6/8/10 then 13,16,19… Equal 1/3 Fire / Defense / Acquire. Fire Support 60% of canonical player Base Damage (INT primary) × context (×1.0), True, dodgeable | Yes | phase3 + passives | Def. Protocol / Acquire Target chips; Fire Support log |

---

## Persistent combat-state indicators

All reuse the **existing HP-chrome status chip hosts** (`arena_combat.gd` `_player_status` / `_enemy_status`). No new panel, overlay, tooltip system, or layout resize.

| State | Chip text |
|---|---|
| Overclock | `OC n/6` (including 0/6 after `overclock_ready`) |
| Astral Barrier | `Barrier N` |
| Phantom Signal | `Phantom primed` |
| Kinetic Tantrum | `Tantrum 1.5×` / `Tantrum 2.0×` |
| Dirty Tricks | one chip per active trick |
| Stim Injector charges | `Stim Injector N` on that trick chip |
| Defensive Protocol | `Def. Protocol` |
| Acquire Target | `Acquire Target` |

**USER DESIGN DECISION REQUIRED:** none. Existing chips were sufficient.

---

## UI files changed

Existing combat window, HP bars, turn flow, log feed, buttons, animations, result presentation **preserved**.

| File | Preserved | Added | Layout impact | Why |
|---|---|---|---|---|
| `loot&lasers/Scripts/UI/Combat/CombatPresentation.gd` | chip host, floaters, log | Phantom/OC/tricks/Tantrum/Orbital/Stim charge reduction; FORCED MISS floater; resist/barrier log already via `text` | none | replay structured events |
| `loot&lasers/Scripts/ClassPassives.gd` | banners | production kind copy | none | banners match events |
| `loot&lasers/Scripts/GameData.gd` | class cards | production special copy | none | Codex matches live passives |
| `src/lib/combatPresentation.js` | JS helper (tests) | same status reduction | n/a | parity with Godot |
| `src/lib/gameData.js` | class specials | production copy | n/a | server/Codex |

`Scenes/UI/arena_combat.gd` still drives the overlay; no scene restructure.

---

## Stale combat-authority search

| Occurrence | Classification |
|---|---|
| `statEngine.AGI_VARIANCE_*` | Historical constants. `calculateAgilityDamage` now uses universal 0.90–1.10. Not live settlement. |
| `statEngine.mitigationForDamageType` Armor/Tech | Historical helper. Live uses `combatMath.resistFraction`. Tests still call it. |
| `statEngine.computeDerivedStats` Armor/Tech percents | Sheet-era leftover / arena-bot tests. Live fighters use `derivedCombatStats`. |
| `statEngine.getMaxHP` `Math.round` | Sheet helper. Combat HP is `productionMath.maxHp` (`roundHalfEven`). |
| `combatEngine.js` re-exports of AGI_VARIANCE / mitigation | Façade for old tests. Settlement exports `simulateBattle` from arenaEngine. |
| `modules/lib/combat_formulas.lua` AGI 0.80–1.05 | Historical Nakama `combat_simulate`. Godot live path is Node Prepare*. |
| `loot&lasers/Scripts/MissionCombat.gd` | Presentation / foe-preview mirror. **Not** mission/dungeon settlement. Unscaled polynomial (not player Base Damage). |
| Godot `StatsRules.gd` Damage | Character-sheet presentation of canonical `playerBaseDamage`. Combat authority remains server `combatMath`. |
| Direct-challenge `FinishArenaBattle` `body.won` fallback | **Removed in Phase 8.** Direct challenges settle from committed pending combat only. |
| Consumable Stim combat mods | Existing `applyBuffs` last step. **Not expanded** (Phase 5). |

No second live JS engine can settle Mission/Arena/Dungeon/Wormhole.

---

## Tests / evidence

Commands (from repo root):

- `npm run test:phase3-combat` — 21 fixtures (variance, context, ramp, six classes, events, gear-once, snapshot stats, Fire Support True, Stim Injector charges, L1–L2000 finite, death)
- `npm run test:damage-scale` — native player polynomial / dungeon enemy ×1.10 parity / Mission enemy unscaled / staged outgoing OFF
- `npm run test:combat` — 23/23
- `npm run test:passives` — 27/27
- `npm run test:mission-enemy` — generation + combat input wiring
- `npm run test:production-math` — Phase 0
- `npm run test:progression` — Phase 1
- `npm run test:phase2-gear` — Phase 2
- `npm run test:presentation`
- `npm run test:arena-bot`

Deferred (unchanged, Phase 4 Mission product): pity test treating any item as Gear; low-Fuel test vs tutorial 30s pin.

---

## Later dependencies (not started)

Phase 4 Mission construction/rewards/drops/pity and Mission combat activation (certified outgoing ON, Mission enemy HP ×3.00) are complete. Do not add a hidden Mission player inverse scalar. Phase 5 Stims (consumable / resale). Dungeon/Wormhole/Arena **reward** formulas. Market, Mining, Companies, Shipments, Reputation, Commissions, GES.

---

## Manual smoke checklist

No developer knowledge required:

1. Fight as each of the six classes.
2. Confirm normal hits, Crits, and Dodges show in the existing combat log / floaters.
3. Vanguard: Dodge primes Tantrum 1.5×; enemy Dodge primes 2.0×; 1.5× can still miss.
4. Astral Warden: Barrier chip appears/refreshes; absorb shows on hits.
5. Shadow: first incoming attack is a forced miss (not a generic Dodge); protection returns later in the fight.
6. Void Runner: see one trick at the start, more later; names stay on the HP chips; Stim Injector shows remaining turns if selected.
7. Technomancer: OC n/6 stays visible and matches the log (gain / vent 6→4 / enemy Crit −2).
8. Cosmic Engineer: Orbital Assistant names Fire Support / Defensive Protocol / Acquire Target; primed chips appear until spent.
9. Fight Might, Reflex, and Tech foes; resisted hits mention resist when it matters.
10. Play one Mission, one Arena, and a Dungeon or Wormhole fight if unlocked.
11. Close and relaunch; combat overlay still opens and looks the same.
