# Phase 5 — Stims + Mining

Server-authoritative Stim activation/selling and Mining session settlement.
Phase 4 Missions remain locked. Phase 6 consumes `stimShopPriceResolved` only; Stim effects and Mining remain locked.

## Stim

Authoritative path: `src/lib/stimActivation.js` → `productionMath.nextStimState` / `STIM_TIERS`.

| Tier | Bonus | Base | Same-tier cap |
|------|------:|-----:|--------------:|
| Uncommon | +5% | 6h | 18h |
| Rare | +10% | 12h | 36h |
| Epic | +20% | 24h | 72h |

- One Stim → one core attribute (`strength` / `agility` / `intellect` / `vitality` / `luck`).
- Same tier: remaining + base, clamp to cap. Immediate 1→2→3 stacks to the cap are allowed. A further same-tier dose is rejected (`Stim effects are too concentrated.`) while remaining is above 2.5 × base (Uncommon 15h, Rare 30h, Epic 60h). At that threshold, another dose extends and clamps (Epic 60h + 24h → 72h).
- Higher tier: replace with fresh base duration (no carry); restim remaining-threshold does not apply.
- Lower tier: reject, do not consume.
- Max 3 concurrent attributes (`STIM_MAX_ACTIVE_EFFECTS`); a fourth different attribute is rejected without consume.
- `expires_at` is the server remaining-time authority; offline/reconnect time counts.
- Sell: `rround(SPF(item.level_requirement || seller.level) × 0.75/1.50/3.25)`.
- Shop price primitive (Phase 6 Market consumes this): `rround(SPF × 1.50/3.00/6.50)`.

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
