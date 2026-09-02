# Gear pricing quality amendment (post–Phase 7)

Bounded production amendment. Phase 7 remains locked. Phase 8 is not started.

Permanent **internal** pricing quality for all five Gear rarities drives Black Market / Contraband **Stardust list price** and **resale**. It is not player-facing. It is not the Phase 6 Nova Intrinsic Quality path.

## Authority

1. The amendment prompt.
2. Locked Phase 6 Nova + Phase 7 PvE behavior.
3. Formula Registry + `src/lib/productionMath/`.
4. This map.

## Canonical callers

| Role | Live path |
|---|---|
| Gear generator | `src/lib/itemGeneration.js` `GenerateGearItem` / `rollItemStats` |
| Nova quality (unchanged) | `productionMath/gearQuality.js` `scoreGearIntrinsicQuality` + `src/lib/gearIntrinsicQuality.js` |
| Pricing quality | `productionMath/gearQuality.js` `scoreGearPricingQuality` + `src/lib/gearPricingQuality.js` |
| List / resale math | `productionMath/economy.js` `qualityPriceMultiplierBps` / `gearQualityListPrice` / `gearQualityResaleValue` |
| Offer snapshot | `src/lib/blackMarket.js` `snapshotGearOffer` |
| Purchase | `server/src/functions/economy.js` `BuyShopGear` |
| Resale | `computeItemVendorValue` → `resolveAuthoritativeGearResaleValue` → `DissolveItem` |
| Grant / pending | `inventoryGrant.grantItemOrPending`, `rewards/pending.js` |

Do not add a second generator, Nova engine, or resale path.

## Internal names

| Kind | Name |
|---|---|
| Rules version | `PRICING_QUALITY_RULES_VERSION` = `phase7-amendment-pricing-quality-v1` |
| New offer snapshot | `BLACK_MARKET_RULES_VERSION` (same string; old offers keep their snapshotted version) |
| Score | `pricing_quality_score` (0–100) |
| Raw / percentile | `pricing_quality_raw`, `pricing_quality_percentile` |
| Frozen class / budget level | `pricing_quality_class`, `pricing_quality_stat_budget_level` |
| Multiplier | `pricing_quality_multiplier_bps` |
| Paid Stardust | `acquisition_stardust_paid` |
| CDF cache key | `rarity:statBudgetLevel:phase7-amendment-pricing-quality-v1` |
| CDF sample | `PRICING_QUALITY_CDF_SAMPLE_SIZE` = 4096 |
| Seed namespace | `PRICING_QUALITY_CDF_SEED_BASE` / `PRICING_QUALITY_CDF_LEVEL_SEED_MIX` |

Nova fields (`intrinsic_quality*`, `INTRINSIC_QUALITY_*`) are unchanged.

## Stale-path disposition

| Path | Disposition |
|---|---|
| `rollMarketPriceVariance` on new Gear offers | Removed. Helper kept for Stim `price_variance: 1`, tests, and `legacyMarketMinimumLegalPurchase` |
| `blackMarketPrice(..., randomVariance)` for live Gear | Superseded by `gearQualityListPrice` |
| `gearResaleValue` (no quality) | Still the rarity-fraction primitive; live dissolve uses quality × fraction in one round |
| Client `StardustEconomy.gear_sale_value` | Prefers server `sell_value`; does not compute quality |
| Offer-only Nova quality | Unchanged; stripped on purchase as before |
| Historical `GearSaleValue` | Unused by live buy/resale |
| Multi-item Gear `scrap_crate` | Not a live Market offer. No per-item cost allocation invented; acquisition metadata is recorded only for single-item grants |

## Migration

- New Gear: `GenerateGearItem` finalizes pricing quality after stat RNG (`skipPricingQuality` only for Nova CDF samples and the tutorial helmet's pre-stat construction).
- Tutorial first-mission helmet: roll with `skipPricingQuality`, overwrite stats to the class primary, then `finalizeGearPricingQuality({ forceRescore: true })` and resale. No extra gameplay RNG.
- Existing Gear: lazy backfill from frozen stats / `stat_budget_level` / class. Neutral score 50 only if unrecoverable.
- Pending loot: claim runs `ensureGearPricingQuality` without rerolling frozen fields.
- Active Market offers: not repriced. Next refresh uses the new rules version.

## Public responses

Internal quality fields are stripped from **non-admin** `/api` JSON copies at one role-aware boundary (`attachPricingQualityResponseBoundary`). `user.role === "admin"` (the existing `isAdmin` gate) may retain `pricing_quality_*` and `acquisition_stardust_paid` for inspection. Named economy helpers, persisted items, `shop_meta`, pending loot, and `/internal/*` are not mutated. Follow-on `wrap()` and `FUNCTION_HANDLERS` skip sanitizing for admins so inspection data is not stripped before HTTP.
