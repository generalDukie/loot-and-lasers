# Production Numeric Policy

Phase 0 established units and rounding. XP unit policy was later locked as completely 1:1 (post-Phase 0 user override / Phase 1). Certified formulas are unchanged.

Named coefficient authorities live in `src/lib/productionMath/constants.js`. See `docs/PRODUCTION_NO_MAGIC_NUMBER_POLICY.md`.

## Canonical design units

Certified Test 18 formulas are expressed in **design units**. A later production decision raised the XP denomination by rewriting the authoritative XP coefficients (`mission_xpf(1)=100`, `xpToNext(1)=133`). This is NOT an XP scaling layer.

- XP rewards and XPToNext: unscaled production integers (`mission_xpf(1)=100`, `xpToNext(1)=133`).
- Stardust: T18 integers from `sdpf` / `rround` products.
- Fuel: quarter-units (0.25).
- Nova: half-units (0.5).
- Attributes / EPA: dimensionless attribute points (EPA is a real benchmark, not an integer wallet).
- Combat chances: 0–1 fractions (30% = 0.30).
- HP: whole hit points.

## Production XP units (locked)

Production XP is completely 1:1:

1 calculated XP = 1 granted XP = 1 stored XP = 1 API XP = 1 displayed XP

The production XP denomination was increased by rewriting the authoritative XP formulas and constants. This is NOT an XP scaling layer.

`PRODUCTION_XP_STORAGE_SCALE = 1` is an **identity sentinel**, not a conversion. `toStorageXp` / `fromStorageXp` are identity helpers. There is no intended ×10 or ÷10 XP conversion anywhere.

Never bake ×10 or ÷10 into `missionXpPerFuel`, `xpToNext`, Arena XP, Dungeon XP, Wormhole XP, grants, persistence, or HUD.

| Quantity | Canonical formula | Live storage / API / HUD |
|---|---|---|
| XP (all sources + XPToNext) | design integer | design integer (identity 1:1) |
| Stardust (certified SPF / mission SD) | design integer | design integer (SPF is not ×10) |
| Nova | half-units | existing Nova half-unit scheme |
| Fuel | quarter-units | existing Fuel |

`XP_STARDUST_SCALE = 10` is **LEGACY ECONOMY IMPLEMENTATION — PENDING SYSTEM-SPECIFIC MIGRATION/RECONCILIATION**. It is not production XP policy and not production economy authority. Remaining casino / guild / ship / vendor ×10 usages keep today's live numbers until those systems' assigned phases replace them with actual production values.

## Rounding helpers

| Helper | Semantics | Used by |
|---|---|---|
| `roundHalfUp` | T18 `rround` = `floor(x+0.5)` | XP rewards, SPF, gear base, attr cost, prices, PvE XP |
| `roundHalfEven` | Python 3 `round` (banker's) | Combat HP and T18 per-hit `round(dmg)` |
| Fuel quantize | nearest 0.25 via half-up on `x/0.25` | Fuel product later |
| Nova quantize | nearest 0.5 via half-up on `x/0.5` | Nova product later |

JS `Math.round` is **not** the XP/economy authority (it matches half-up only for positives). Python 3 `round` is **not** `rround`. T18 telemetry HP used `rround` while combat used `round` — production HP follows **combat**.

## Reward / economy rounding order

1. Compute the full-precision product in the documented factor order.
2. Apply `rround` at the certified boundary (once per documented step).
3. Defeat: `rround(alreadyRoundedWin * 0.5)` — second round, not half-then-round of the unrounded win.
4. Dungeon/Wormhole: `rround(DRU*share*xpf*0.87*2.10)` then `rround(*1.25)` then optional `rround(base*(1+frontier))`.
5. Market price: `rround(preVarianceBase * variance)`.
6. Resale: `rround(preVarianceBase * rarityFraction)` — variance is not included.
7. Stim shop/sell: T18 used the unrounded `SPF * mult`. Integer helpers `stimShopPriceResolved` / `stimSellValueResolved` apply `rround` for a future integer wallet.

## Combat-stat rounding

Derived Crit/Dodge/Resist stay full-precision fractions. There is **no** certified 0.01 combat-stat rounding in T18; do not invent one. Display may round later.

## Safe integer considerations

`Number.MAX_SAFE_INTEGER = 9_007_199_254_740_991`.

At L2500 (ordinary gameplay-scale samples):

| Value | Magnitude |
|---|---|
| XPToNext | 43_495_928_775 |
| SPF | 1_313_360_839 |
| Legendary weapon market @1.20 | 46_335_370_400 |
| Attr cost n=2500 | 173_096_476 |
| Wormhole encounter XP (idx 1149, enemy L~2500) | 98_403_598_998 |

All of the above are well below MAX_SAFE_INTEGER. XPToNext grows ~L^4 from `empl`; SPF grows ~L^{1.625+3.055}. JS Number remains safe for **reasonable indefinite progression** (thousands of levels). Beyond ~L10^5, XPToNext would threaten the 53-bit mantissa; a later bigint/decimal wallet can wait until that horizon is relevant.

Phase 0 itself did **not** migrate currency storage. Phase 1 later locked XP as 1:1. Remaining Stardust ×10 usages stay until their assigned phases. Casino wager caps remain separate product rules and are not a wallet cap.
