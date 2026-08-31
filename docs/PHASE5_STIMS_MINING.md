# Phase 5 — Stims + Mining

Server-authoritative Stim activation/selling and Mining session settlement.
Phase 4 Missions remain locked. Phase 6 Black Market is **not** started.

## Stim

Authoritative path: `src/lib/stimActivation.js` → `productionMath.nextStimState` / `STIM_TIERS`.

| Tier | Bonus | Base | Same-tier cap |
|------|------:|-----:|--------------:|
| Uncommon | +5% | 6h | 18h |
| Rare | +10% | 12h | 36h |
| Epic | +20% | 24h | 72h |

- One Stim → one core attribute (`strength` / `agility` / `intellect` / `vitality` / `luck`).
- Same tier: remaining + base, clamp to cap, only after at least half that tier's base duration has elapsed since `last_applied_at` (Uncommon 3h, Rare 6h, Epic 12h). Too-early use rejects without consume (`Stim effects are too concentrated.`).
- Higher tier: replace with fresh base duration (no carry); restim wait does not apply.
- Lower tier: reject, do not consume.
- Max 3 concurrent attributes (`STIM_MAX_ACTIVE_EFFECTS`); a fourth different attribute is rejected without consume.
- `expires_at` and `last_applied_at` are server timestamps; lazy expiry on read. Offline/reconnect time counts.
- Sell: `rround(SPF(item.level_requirement || seller.level) × 0.75/1.50/3.25)`.
- Shop price primitive (not Market): `rround(SPF × 1.50/3.00/6.50)`.

Mission Stim drop chance/tier thresholds are unchanged (Phase 4).

## Mining

Authoritative path: `miningStardustResolved` + `server/src/shared/miningService.js`.

`rround(minutes × SPF(snapshotLevel) × 0.03)` at session start.
Snapshot fields: `mining_snapshot_level`, `mining_rules_version`, start/end, hours, reward.

Product session window: 1–12 hours. Test 18's 720 minutes/day is a simulation checksum, not a live cap.

Hangar/Ship mining modifiers remain disabled.

## Tests

```
npm run test:phase5-stims
npm run test:phase5-mining
npm run test:phase5
```
