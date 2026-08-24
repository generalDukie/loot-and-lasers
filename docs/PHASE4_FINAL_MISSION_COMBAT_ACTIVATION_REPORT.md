# PHASE 4 — FINAL MISSION COMBAT ACTIVATION REPORT

Production activation of certified Mission outgoing and Mission-only enemy HP ×3.00. Diagnostic history is retained; this document is the live production record.

## 1. Executive result

Certified Mission enemy outgoing is **ON**. Mission enemy MaxHP is the universal Vitality polynomial, then **×2.50 native-damage normalization × ×1.20 pacing** (effective **×3.00**), rounded with the combat HP half-even helper. Exact Test 18 replay **N = 32,400** produced **100% wins**, **7.43 mean turns**, **85.21% mean victory HP** — inside the approved ×3.00 neighborhood (~7.41 / ~85.2%). Phase 5 was not started.

**PHASE 4 FINAL MISSION COMBAT PASS — READY FOR HUMAN SMOKE TEST**

## 2. Certified outgoing activation

- Final flag: `APPLY_CERTIFIED_MISSION_ENEMY_OUTGOING_IN_LIVE_COMBAT = true` in `src/lib/combatMath.js`.
- Formula unchanged. Checksum:

| Level | Multiplier |
|---|---|
| L1 | 0.30 |
| L10 | 0.35 |
| L15 | 0.50 |
| L20 | 2.50 |
| L25 | 3.0833… |
| L50 | 6.00 |
| L75 | 8.00 |
| L100 | 10.00 |
| L150 | 11.00 |
| L200+ | 12.00 |

- Applied **exactly once** at the existing `resolveBasicHit` context-multiplier boundary via `contextMultiplierFor` → `combatContextMultiplier` → `missionEnemyOutgoingMultiplier`.
- Proof (`test-phase4-mission-combat-activation.mjs`): live damage equals `roundCombatDamage(canonical × outgoing)`; missing ×1, duplicate ×2, and Dungeon/Wormhole ×1.10 all fail equality.

## 3. Mission enemy HP implementation

- `MISSION_ENEMY_HP_NATIVE_DAMAGE_NORMALIZATION = PLAYER_BASE_DAMAGE_FLAT / STANDARD_ATTACK_FLAT = 37.5 / 15 = 2.50` (also `0.008 / 0.0032 = 2.50`).
- `MISSION_ENEMY_HP_PACING_MULTIPLIER = 1.20` — approved extra Mission combat presence, not part of the 2.50 identity.
- `MISSION_ENEMY_HP_SCALE = 2.50 × 1.20 = 3.00`.
- `missionEnemyMaxHp(V) = max(1, roundHalfEven(maxHp(V) × scale))`.
- Rounding boundary: same `roundHalfEven` used by universal combat HP (Python round / banker's rounding).
- Universal `maxHp(Vitality)` polynomial is unchanged. Enemy Vitality is unchanged.

## 4. Snapshot persistence / versioning

`snapshotMissionAcceptance` freezes:

- `mission_combat_rules_version` (`phase4_mission_combat_v1`)
- `mission_enemy_hp_scale` (3.00)
- `mission_enemy_outgoing_multiplier` (level knot at acceptance)

`economy.js` persists those fields on the Mission row. `generateMissionEncounter` stamps `missionEnemyHpScale` / `missionEnemyOutgoingMultiplier` from the snapshot. `buildFighter` uses the frozen outgoing when present. An accepted Mission cannot silently retune if live constants later change.

## 5. Enemy non-HP invariance

Fingerprint test compares attributes, Base Damage, canonical damage, Crit, Dodge, resists, archetype, and outgoing before/after HP normalization.

**Mismatches: 0** except MaxHP and CurrentHP (CurrentHP = MaxHP at combat start).

## 6. Exact-state final replay

Source: `server/fixtures/test18/checkpoint_character_states.csv` + reconstructed L1. Six classes, F2P/Light/Premium, retained L10/L25/L50/L75/L100/L150/L200, no fabricated L20. Live outgoing ON, HP ×3.00, current Phase 3 passives / caps / native player Damage.

| Metric | Result |
|---|---|
| N | 32,400 |
| Pooled win rate | 100% |
| Minimum cell win rate | 100% |
| Mean turns | 7.427 |
| Median turns | 7 |
| P10 / P90 turns | 5 / 11 |
| Mean victory HP | 85.21% |
| P10 / P50 / P90 victory HP | 73.93% / 85.44% / 96.03% |
| Enemy attacks attempted / landed | 110,829 / 97,057 |

Approved diagnostic neighborhood was ~7.41 turns / ~85.2% HP / 100% wins.

### Level

| Level | Mean turns | Mean victory HP |
|---|---|---|
| L1 | 9.52 | 94.1% |
| L10 | 13.11 | 94.3% |
| L25 | 8.26 | 85.5% |
| L50 | 6.75 | 83.7% |
| L75 | 6.11 | 83.1% |
| L100 | 5.78 | 81.3% |
| L150 | 5.51 | 82.2% |
| L200 | 5.41 | 81.9% |

### Class

| Class | Mean victory HP |
|---|---|
| Vanguard | 83.6% |
| Astral Warden | 85.2% |
| Shadow Operative | 88.6% |
| Void Runner | 86.1% |
| Technomancer | 83.0% |
| Cosmic Engineer | 84.8% |

### Profile

| Profile | Mean turns | Mean victory HP |
|---|---|---|
| F2P | 8.28 | 82.5% |
| Light | 7.20 | 85.8% |
| Premium | 6.81 | 87.3% |

Early levels remain gentler by design of the certified outgoing curve. Class and spender identity is not flattened.

## 7. Obsolete fixture retirement

- Official `npm run test:phase4-missions` no longer contains the purchased-ish OFF-vs-ON gate and no longer prints `OUTGOING_GATE_LEAVE_OFF`.
- Replacement official gate: exact Test 18 states in `server/scripts/test-phase4-mission-combat-activation.mjs` (composed into the Phase 4 runner).
- Invalidated fixture preserved as `server/scripts/diagnostic-mission-outgoing-purchased-ish.mjs` — historical / test-only, **not** production balance authority.

## 8. No-magic-number audit

Named authorities live in `src/lib/productionMath/constants.js`. Callers use `MISSION_ENEMY_HP_NATIVE_DAMAGE_NORMALIZATION`, `MISSION_ENEMY_HP_PACING_MULTIPLIER`, `MISSION_ENEMY_HP_SCALE`, and `MISSION_COMBAT_RULES_VERSION`. No raw `* 3.0` in live Mission combat. See regression table.

## 9. Full regressions

| Command | Result |
|---|---|
| `npm run audit:no-magic-numbers` | 21 files, 0 suspicious literals |
| `npm run test:phase4-missions` | all composed suites passed (includes 32,400-fight activation) |
| `npm run test:production-math` | 41 passed |
| `npm run test:progression` | passed |
| `npm run test:attributes` | passed |
| `npm run test:phase2-gear` | passed |
| `npm run test:inventory` | passed |
| `npm run test:derived-stat-caps` | passed |
| `npm run test:damage-scale` | 16/16 |
| `npm run test:phase3-combat` | 21 passed |
| `npm run test:combat` | 23 passed |
| `npm run test:passives` | 29 passed |
| `npm run test:mission-enemy` | 12 passed |
| `npm run test:presentation` | OK |
| `npm run test:economy` | 11 passed |

Locked-phase regressions remain green. Synthetic EPA-analog / uncommon-only underfill is no longer a production win-rate authority (exact Test 18 states are).

## 10. Files changed

See git status / Files changed section of the completion message.

## 11. UI preservation

No UI redesign. No new panel, warning, difficulty badge, overlay, tooltip, scrolling region, or card resize. Godot HP bars continue to render server `opponentMaxHp`. `MissionCombat.max_hp` remains the universal presentation polynomial and is **not** a second combat HP multiplier.

## 12. Scope confirmation

- Phase 5 **not** started.
- Stim resale **not** changed (still the known Phase 5 1 Stardust item).
- No other balance value changed: board, three offers, durations, Fuel, safeguards, Mission XP/Stardust, skip, 35% EPA, archetypes, enemy base-damage ramp, victory/defeat rewards, Fuel Gear pity, 60/30/10 Gear, item level, 10% Stim, 75% Junk, 0.45 Junk value, Backpack 10, atomicity/idempotency.
- No Mission player damage multiplier. Native player Base Damage remains `37.5 + 0.008 × P^1.727`. Mission player outgoing remains ×1.0.

## 13. Human smoke-test checklist

- Ordinary L1 Mission: enemy survives multiple hits; fight is still clearly winnable.
- L10 Mission: longer than pre-activation; winner HP still high (introductory curve).
- L25–50 Mission: several turns; enemy visibly attacks more than once; player takes noticeable but non-threatening damage.
- L100+ Mission: similar pacing to the audit (~5–6 turns, ~81–83% HP).
- Six classes where practical: identity differences are expected (Shadow Operative safer, Vanguard/Technomancer a bit spicier).
- HP bar matches authoritative MaxHP (larger than pre-activation).
- Rewards unchanged (XP, Stardust, loot chain).
- Skip unchanged.
- Reconnect unchanged.
- Repeat claim unchanged.

Machine tables: `docs/PHASE4_FINAL_MISSION_COMBAT_ACTIVATION_RESULTS.json`.
