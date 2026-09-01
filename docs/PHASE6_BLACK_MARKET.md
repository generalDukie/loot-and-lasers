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
MarketPrice     = ROUND(BaseMarketValue × Uniform(0.80, 1.20))
```

Rarity multipliers: Common 2.80 / Uncommon 4.25 / Rare 7.00 / Epic 12.00 / Legendary 24.50.
Slot: Weapon and Ship Module 1.20; all other slots 1.00.
Rounding: production `roundHalfUp`. Price uses **item level**, snapshotted. Contraband uses the same formula with no extra Contraband markup.

Resale (Phase 2, reused): `ROUND(pre-variance base × 0.60/0.60/0.40/0.35/0.30)`. Independent of purchase variance, Haggling, Nova, and what the player paid.

## Nova surcharge

Epic / Legendary only. Intrinsic Quality is **not** GES and **not** raw `stat_budget_variance`.

`IntrinsicQuality = 0.20 × BudgetQuality + 0.80 × DistributionQuality`

**BudgetQuality** = `ActualGeneratedBudget / NeutralPool(snapshotted Market generation level, same rarity, same slot)`.

The denominator is **not** the item's own ItemLevel. A Market L47 piece generated at player L50 uses the neutral L50 pool. Phase 2 ±10% variance is in the numerator only; BudgetQuality is **not** clamped to 1.0.

**Epic Distribution Quality:** 60% desirable-stat share (class Primary + Vitality + Luck) + 20% Primary/Vitality balance + 20% Luck suitability.

**Legendary Distribution Quality:** 60% **discretionary** off-stat avoidance + 25% P/V balance + 15% Luck suitability. Legendary's mandatory 10% per stat is not a penalty; only off-stat allocation above that floor counts as excess.

**Luck suitability** (`Luck / ActualTotal`): absent = 0; `(0, 30%]` = full credit; 30%→60% linear decay; `≥60%` = 0. There is no peak at one-third.

**P/V balance:** `1 − |Primary − Vitality| / (Primary + Vitality)`.

The combined score is classified by **within-rarity** empirical CDF (Epic vs Epic, Legendary vs Legendary; **not** class-segmented, **not** a shared Epic+Legendary cutoff) into the six Nova bands. The reference population is **normal Black Market Gear at the offer's snapshotted generation level**: Market 35/35/20/10 ItemLevel offsets vs that level, Phase 2 ±10% variance, current slot/allocation. Cache key is `rarity + quality_reference_level` (lazy, deterministic, not class). A single L50 CDF is **not** used for other levels — BudgetQuality's L−k / L ratio is nonlinear, and a fixed L50 table over-rates high-level Epic Nova. Contraband uses that same rarity/level CDF (no separate on-level distribution); its 100% current-level generation naturally scores stronger BudgetQuality. Appearance chances and Nova pools are unchanged. Snapshotted on the offer (`quality_reference_level`); existing offers are not rescored when the helper changes.

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
| Free manual (1 / 12h window) | replace | only on 10th counted | consume | +1 |
| Paid 20 Nova | replace | no | no | no |
| Daily Contraband 19:00 UTC | no | replace | no | no |

Counter persists across reconnect, 07:00, 19:00, and daily Contraband refresh. Every 10 counted free manual refreshes replace Contraband and reset the 10-count. 20,000 counted free refreshes → 2,000 triggers.

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
| Paid or automatic refresh increments Contraband counter | REMOVED |
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
| Same-rarity + same-class CDF segmentation | SUPERSEDED — within-rarity CDF only |
| Single L50 CDF for all Market generation levels | SUPERSEDED — lazy CDF per rarity + `quality_reference_level` |
| Raw stat-budget variance as Nova percentile | REMOVED |
| 40/40/20 as Market Stim shop split | UNRELATED — Mission Stim **drop** table, not shop generation |
| Scrap Crate bundle stalls | REMOVED from generation (legacy buy path may still unwrap if present) |

Old Restoration 12A/12B/12C and Phase 15 shop docs are **HISTORICAL**. Live authority is this document + `productionMath`.
