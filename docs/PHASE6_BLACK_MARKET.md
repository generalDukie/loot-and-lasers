# Phase 6 — Black Market + Contraband Loot

Server-authoritative normal Market (8 stalls) and one separate **Contraband Loot** Gear offer.
Phases 1–5 remain locked. Phase 7 (Dungeons / Wormholes / Frontier) is **not** started.

Player-facing name: **Contraband Loot**. Persistence may still use the historical `hot_deal` / `hot_purchased` keys.

Canonical live path:

```
Godot ShopManager / shop.gd
  → Node EnsureShop / RefreshShop / BuyShopGear / BuyShopConsumable
  → src/lib/blackMarket.js + productionMath/market.js
  → universal Gear generator (Phase 2) + stimShopPriceResolved (Phase 5)
```

## Normal Market

- Exactly **8** slots.
- Each slot independently: **90% Gear / 10% Stim**.
- If all 8 rolled Gear, convert **one** random slot to Stim (Test 18 safeguard). Duplicate Gear slots are legal; shops are never rerolled for uniqueness.
- Gear rarity: Common 20% / Uncommon 35% / Rare 30% / Epic 12.5% / Legendary 2.5%.
- Gear item level: 35% L / 35% L−1 / 20% L−2 / 10% L−3; `max(1, L−offset)`; never above player level.
- Stim shop **tier** is player-level band (Test 18), **not** the Mission 40/40/20 drop table:
  - L ≤ 19 Uncommon
  - L ≤ 49 Rare
  - else Epic
- Stim economic level = player level at generation (`level_requirement` snapshot). Shop price is Phase 5 `stimShopPriceResolved` (1.50 / 3.00 / 6.50 × SPF). No Gear-style ±20% Stim variance. Stims are not haggle-eligible.

## Contraband Loot

- One Gear-only offer, **not** one of the 8 stalls. Never a Stim.
- Rarity: Rare 65% / Epic 25% / Legendary 10%.
- Item level: **100% current player level** at generation; later leveling does not retune the snapshot.
- Independent Sold Out and refresh state from the normal Market.

## Manufacturer / origin / Shipment

After slot selection, 50/50 between that slot's two eligible companies (`SLOT_ELIGIBLE_COMPANIES`).

| Origin | Enum | ShipmentEligible |
|---|---|---|
| Normal Market Gear | `market` | `false` permanently |
| Contraband Gear | `contraband` | `false` permanently |

Manufacturer does **not** imply Shipment eligibility. Phase 9 reputation / Shipments / Commissions are not implemented.

## Gear Stardust pricing

```
BaseMarketValue = SPF(ItemLevel) × RarityMarketMultiplier × SlotMultiplier
QualityPriceMultiplierBps = 8000 + 40 × PricingQualityScore
MarketPrice     = ROUND(BaseMarketValue × QualityPriceMultiplierBps ÷ 10000)
```

Independent Uniform(0.80, 1.20) Gear listing variance is retired. New offers use `phase7-amendment-pricing-quality-v1`. Existing active offers keep their snapshotted Stardust/Nova until the next refresh.

Rarity multipliers: Common 2.80 / Uncommon 4.25 / Rare 7.00 / Epic 12.00 / Legendary 24.50.
Slot: Weapon and Ship Module 1.20; all other slots 1.00.
Rounding: production `roundHalfUp`. Price uses **item level**, snapshotted. Contraband uses the same quality-based listing with no extra Contraband markup.

Resale: `ROUND(BaseMarketValue × rarityFraction × QualityPriceMultiplierBps ÷ 10000)` then cap strictly below max-haggle purchase (and below recorded `acquisition_stardust_paid` when present). Fractions remain 0.60/0.60/0.40/0.35/0.30. Quality is **not** shown to the player.

Permanent pricing quality (all five rarities) is separate from the Nova offer-relative CDF. See `docs/GEAR_PRICING_QUALITY_AMENDMENT.md`.

## Nova surcharge

Epic / Legendary only. Quality is **not** GES and **not** raw `stat_budget_variance`.

`RawQuality = 30 × BudgetQuality + 50 × Desirability + 20 × Shape` (uncapped). A perfect-distribution on-level piece is 97 / 98.5 / 100 / 101.5 / 103 at BQ 0.90 / 0.95 / 1.00 / 1.05 / 1.10.

**BudgetQuality** = `ActualPersistedTotalStatBudget / NeutralOnLevelReferenceBudget` at `quality_reference_level`, same rarity, same slot, no ±10% in the denominator. There is **no** extra ItemLevel penalty — L−1/L−2/L−3 score lower only because their actual budget is smaller.

**Epic Desirability** = `DesirableShare²` (P+V+Luck share of actual total). **Epic Shape** is branch-specific: full P/V/L uses P/V and Luck penalty tables (ideal Luck 17.5–22.5%); P+V+off prefers ~62.5/37.5 P/V; P+Luck+off and V+Luck+off use scaled 75/25 splits; one-desirable pieces use Primary/Vitality/Luck ceilings 0.60 / 0.50 / 0.35.

**Legendary Desirability** = `clamp(1 − 6 × Leakage, 0, 1)` where Leakage is discretionary off-stat share above the mandatory 10% per off-stat. **Legendary Shape** uses P/V and Luck penalty tables (ideal Luck 15–20%). Off-stat leakage is not double-penalized in Shape. Scoring math is unchanged. Legendary **generation** (Phase 6 cap correction): five stats, 10% floor, hard 17.5% cap per class off-stat (`floor(T × LEGENDARY_OFF_STAT_CAP_SHARE)`); remainder to Primary / Vitality / Luck. Applies to live Normal Legendary as well as directed pools. Existing persisted Gear/offers are not rewritten.

The combined RawQuality is classified by **within-rarity** empirical CDF (Epic vs Epic, Legendary vs Legendary; **not** class-segmented) into six Nova bands. The reference population is **normal Black Market Gear at the offer's snapshotted generation level**: Market 35/35/20/10 ItemLevel offsets, Phase 2 ±10% variance, current slot/allocation. Cache key is `rarity + quality_reference_level` (lazy, deterministic, not class). Contraband uses that same rarity/level CDF. Snapshotted on the offer; existing offers are not rescored. Nova formula/tables unchanged. New Market offers also carry `phase7-amendment-pricing-quality-v1` for Stardust pricing.

Common, Uncommon, and Rare Gear never receive a Nova surcharge.

**Bands** (`NOVA_SURCHARGE_BANDS`): Below Top 25% / Top 17.5–25% / Top 10–17.5% / Top 5–10% / Top 2.5–5% / Top 2.5% (cuts 0.75 / 0.825 / 0.90 / 0.95 / 0.975).

**Appearance chance:**

| Band | Epic | Legendary |
|---|---:|---:|
| Below Top 25% | 30% | 75% |
| Top 17.5–25% | 50% | 90% |
| Top 10–17.5% | 60% | 100% |
| Top 5–10% | 75% | 100% |
| Top 2.5–5% | 85% | 100% |
| Top 2.5% | 95% | 100% |

On a successful roll, Nova is chosen uniformly from the 3-value pool (`NOVA_SURCHARGE_POOL_SIZE`):

| Band | Epic | Legendary |
|---|---|---|
| Below Top 25% | 10 / 20 / 40 | 50 / 60 / 75 |
| Top 17.5–25% | 50 / 60 / 75 | 75 / 100 / 125 |
| Top 10–17.5% | 80 / 90 / 100 | 100 / 125 / 150 |
| Top 5–10% | 100 / 110 / 125 | 160 / 180 / 200 |
| Top 2.5–5% | 125 / 150 / 175 | 200 / 225 / 250 |
| Top 2.5% | 160 / 180 / 200 | 250 / 275 / 300 |

## Haggling

Applies **only to normal Black Market Gear**. Stims, Contraband Gear, and Sold Out / yanked offers are not eligible and must not expose or accept a Haggle action.

One attempt per generated normal Gear offer.

- Success chance from the **snapshotted** Nova surcharge (do not reroll Nova): **40%** with no Nova (`MARKET_HAGGLE_SUCCESS_CHANCE_STANDARD`); **30%** if snapshotted Nova > 0 (`MARKET_HAGGLE_SUCCESS_CHANCE_NOVA`).
- Success rolls **one** Uniform 10–20% discount and applies that **same** percentage to Stardust and to Nova. Nova is then quantized with `quantizeNova` (nearest 0.5). Example: 20,000 Stardust + 50 Nova at 15% → 17,000 Stardust + 42.5 Nova.
- Stardust uses existing rounding plus vendor floor `Final > VendorValue` (`MARKET_HAGGLE_VENDOR_FLOOR_OFFSET = 1`). Clamp to `VendorValue + 1`. Gear resale formulas are unchanged.
- Failure **yanks** the offer: no Stardust, no Nova, no grant, no replacement. The slot stays empty / Sold Out (presentation: **YANKED**) until the next legitimate **normal Market** refresh (auto 19:00 / 07:00 UTC, free manual, or paid 20 Nova). Contraband refreshes do not restore yanked normal slots. Remaining stalls are unchanged.
- Result persisted on the offer (`haggle_*`, original and final prices, yanked). Duplicate `request_id` cannot reroll success, discount, or yank.

## Refreshes (UTC, no DST)

| Event | 8 normal stalls | Contraband | Free-use | Counter |
|---|---|---|---|---|
| Auto 19:00 / 07:00 UTC | replace | no | no | no |
| Free manual (1 / 12h window) | replace | on 10th counted manual | consume | +1 |
| Paid 20 Nova | replace | on 10th counted manual | no | +1 |
| Daily Contraband 19:00 UTC | no | replace | no | no |

Counter persists across reconnect, 07:00, 19:00, and daily Contraband refresh. Every 10 counted **manual** refreshes (free or paid) replace Contraband and reset the 10-count. Automatic Market windows do not increment. 20,000 counted manuals → 2,000 triggers.

## Sold Out / purchase

Purchased offers stay Sold Out until the next **legitimate** refresh of that shop (normal vs Contraband independent). No auto-reroll on purchase.

Purchases: server validates offer / generation / Sold Out / snapshotted price / Haggle / Stardust / Nova / **Backpack 10 unequipped** before debit. Client prices and stats are rejected. Idempotent on `request_id`. Full backpack rejects without debit or Sold Out.

Simulation-only (not live): GES, 5% upgrade threshold, F2P/Light/Premium auto-buy, Nova opportunity-cost vs 20-Nova refresh.

## Tests

```
npm run test:phase6-market
npm run test:phase6-contraband
npm run test:phase6-pricing
npm run test:phase6-quality
npm run test:phase6-transactions
npm run test:phase6
npm run audit:no-magic-numbers
```

## Superseded (do not restore)

| Old rule | Disposition |
|---|---|
| 80% Gear / 20% Stim | REMOVED |
| 50/25/15/7/3 item levels through L−4 | REMOVED |
| 40/30/20/10 item levels | REMOVED |
| Old Contraband rarity (e.g. 35/45/15/5 Unc/R/E/L) | REMOVED |
| Player-facing Hot Deal / Hot Deals | MIGRATED → Contraband Loot (`hot_deal` key HISTORICAL) |
| Stim shop 2× / 4× / 10× SPF | REMOVED |
| Vendor-value × markup purchase architecture | REMOVED |
| Common resale 75% | REMOVED (live 60%) |
| Automatic refresh increments Contraband counter | REMOVED |
| Counter +1 only on free manual refresh | SUPERSEDED — free and paid manuals both +1 |
| Counter resets every 12h | REMOVED |
| Market Gear Shipment-eligible | REMOVED (`false` permanently) |
| Purchase causes reroll | REMOVED |
| Client-authoritative prices | REMOVED |
| Non-idempotent buys | REMOVED |
| Hidden auto-equip / Market overflow storage | REMOVED |
| GES / Light / Premium live purchase heuristics | UNRELATED (simulation-only; not implemented) |
| ET-based Market / Hot Deal clocks (`todayET`, 14:00 ET) | REMOVED for Market authority |
| Leave listing on Haggle failure | SUPERSEDED — failed Haggle yanks the slot until the next normal Market refresh |
| Haggle Contraband Gear | REMOVED — Contraband is never haggle-eligible |
| Nova unchanged on successful Haggle | SUPERSEDED — the same 10–20% discount applies to snapshotted Nova, then `quantizeNova` |
| Luck suitability peaked at one-third of desirable stats | SUPERSEDED — LuckShare vs total; full credit through 30%, linear decay to 60% |
| BudgetQuality vs the item's own ItemLevel / clamp-to-1.0 | SUPERSEDED — denominator is snapshotted Market generation level; BQ may exceed 1.0 |
| Legendary quality penalizes mandatory five-stat floors | SUPERSEDED — discretionary off-stat excess only |
| 17.5% Legendary off-stat cap only on directed Partial B | SUPERSEDED — hard `floor(T × 0.175)` cap on every class off-stat for all Legendary generation |
| Same-rarity + same-class CDF segmentation | SUPERSEDED — within-rarity CDF only |
| Single L50 CDF for all Market generation levels | SUPERSEDED — lazy CDF per rarity + `quality_reference_level` |
| Raw stat-budget variance as Nova percentile | REMOVED |
| 40/40/20 as Market Stim shop split | UNRELATED — Mission Stim **drop** table, not shop generation |
| Scrap Crate bundle stalls | REMOVED from generation (legacy buy path may still unwrap if present) |

Old Restoration 12A/12B/12C and Phase 15 shop docs are **HISTORICAL**. Live authority is this document + `productionMath`.
