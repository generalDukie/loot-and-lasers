# Phase 2 Gear Caller Migration Map

Phase 2 migrates the **universal Gear item**, Backpack, equip, and resale onto locked Phase 0 `src/lib/productionMath/`. Source drop/rarity/item-level tables stay later-phase.

GES is not a production mechanic and is not exported.

---

## Gear base budget

| | |
|---|---|
| **Old authoritative path** | `src/lib/itemGeneration.js` `BaseGearStatBudget` (`Math.round`) |
| **Old symbol** | `ROUND(1.4079·L + 2.2988·√L + 8.277)` |
| **New authoritative path** | `src/lib/productionMath/gear.js` `gearBaseStatBudget` (`roundHalfUp`) |
| **New symbol** | same coefficients, T18 `rround` |
| **Callers migrated** | `BaseGearStatBudget` / `getItemStatBudget` / `GenerateGearItem` / `rollItemStats` / `gameData.generateItem` |
| **Old code disposition** | Live wrapper delegates; coefficients kept as named aliases for tests |

## Rarity stat-budget multiplier

| | |
|---|---|
| **Old** | `RARITY_BUDGET_MULT.legendary = 1.35` |
| **New** | `GEAR_RARITY_BUDGET_MULT.legendary = 1.50` via `gearRarityBudgetMultiplier` |
| **Callers migrated** | `getRarityBudgetMultiplier`, `gearStatPool`, `GenerateGearItem` |
| **Disposition** | Live table is a copy of productionMath. Source *chance* tables unchanged |

## Slot multiplier

| | |
|---|---|
| **Old** | `SLOT_STAT_MULT` weapon/ship_module 1.20 |
| **New** | `gearSlotMultiplier` / `PREMIUM_GEAR_SLOTS` |
| **Callers migrated** | `getSlotMultiplier`, `gearStatPool`, resale slot premium |
| **Disposition** | Accessory is **not** premium. `ring` aliases to `accessory` |

## Stat allocation

| | |
|---|---|
| **Old / new** | `selectItemAttributes` + `allocateStatBudget` in `itemGeneration.js` |
| **Callers** | `rollItemStats` → `GenerateGearItem` (canonical generator) |
| **Disposition** | Reused (Phase 0: already exact). Favored 60/40 Common–Epic; Legendary all five stats; exact sum |

## Item / economic / stat-budget levels

| | |
|---|---|
| **New API** | `resolveGearLevelRefs` + `GenerateGearItem({ economicLevel, statBudgetLevel, applyPveHiddenBudgetOffset })` |
| **Default** | economic = display = stat budget |
| **PvE offset** | Discrete +5…+10 **opt-in**. Mission/Dungeon/Wormhole callers do **not** pass it in Phase 2 |
| **Resale / display** | Always economic `level` / `level_requirement` |

## Backpack capacity

| | |
|---|---|
| **Old** | `getInventoryCap` = 10 + cargo_hold mods + entitlement expansion |
| **New** | `BACKPACK_UNEQUIPPED_GEAR_CAP = 10` hard. Cargo/entitlements ignored |
| **Occupancy** | Unequipped **Gear** only (`countBagOccupancy`). Stims/junk do not consume the cap |
| **Callers** | `grantItemOrPending`, equip/unequip, `GetInventory` snapshot, Godot `InventoryRules.bag_cap` |
| **Disposition** | Hangar Cargo Hold UI/mod tree **preserved**, bonus **disabled** for backpack |

## Equip / unequip / swap

| | |
|---|---|
| **Path** | `EquipItem` / `UnequipItem` → `equipItemForCharacter` / `unequipItemForCharacter` |
| **Changes** | No item-level gate (none existed). `ring`→`accessory`. Optional `request_id` replay |
| **Full-bag swap** | Equip-first so occupied-slot swap stays legal at cap 10 |
| **Empty-slot from full bag** | Legal (occupancy 10→9) |
| **Unequip at cap** | `INVENTORY_FULL`, item stays equipped |

## Sell / resale

| | |
|---|---|
| **Old dissolve** | `GearSaleValue` = `ROUND(SPF(L)×2×raritySaleMult×slotMult)` (Legendary sale 1.75) |
| **New dissolve** | `gearResaleValue` = `rround(blackMarketBasePrice(economicL, slot, rarity) × 0.60/0.60/0.40/0.35/0.30)` |
| **Callers** | `computeItemVendorValue`, `computeStardustValue`, `DissolveItem`, Godot `StardustEconomy.gear_sale_value` |
| **Stale `sell_value`** | Cache only. Settlement recomputes. Client cannot submit payout |
| **Equipped Gear** | **Cannot be sold.** Unequip first. Server `DissolveItem` rejects `ITEM_EQUIPPED`. Not a full-Backpack safety valve. |
| **Shop buy markup** | Still uses historical `GearSaleValue` until Phase 6 Market |

## Item persistence / metadata

| Field | Phase 2 |
|---|---|
| `id` | `nanoid` at `Item.create` |
| `type` | Canonical slot (`ring` migrated → `accessory`) |
| `rarity` / `level` / `stats` | Immutable after create |
| `stat_budget_level` | Hidden budget used at generation (equals `level` unless PvE offset opted in) |
| `origin` | `mission` / `dungeon` / `wormhole` / `market` / `contraband` / `commission` / `unassigned` |
| `manufacturer` | `null` until Phase 9 |
| `shipment_eligible` | Set when origin is unambiguous; otherwise `null`. No Shipment UI |

Migration `phase2_gear_item_model_v1`: normalize `ring`, stamp missing origin/manufacturer/shipment fields. **Does not reroll stats.**

## Stale-authority classification

| Occurrence | Classification |
|---|---|
| Live Legendary **1.50** | Production. Old 1.35 removed from `itemGeneration` |
| Test asserts `!== 1.35` | Test-only guard |
| `GearSaleValue` / legendary sale **1.75** | **Later-phase (Phase 6)** shop *purchase* markup. Not player resale |
| `RARITY_SELL_FACTOR` / `ITEM_SELL_TYPE_WEIGHT` (incl. ship_module 1.35) | Unused historical; live dissolve uses `gearResaleValue` |
| `XP_REQUIREMENT_MULTIPLIER = 1.35` | Unrelated historical XP helper, not Gear |
| Godot tween/color `1.35` literals | Unrelated UI |
| `ring` → `accessory` | Compatibility alias + boot migration. No production `ring` slot |
| Cargo Hold `inventory_cap_bonus` | Hangar UI/data **preserved**; `getInventoryCap` **ignores** it |
| `__llResolveInventoryExpansion` | Entitlement hook still registered; **not** applied to cap |
| `fullLegendary` promo in `rewards.js` | Promo/test path still creates already-equipped items (bypasses bag). **Not** earned auto-equip |
| Arena bot `is_equipped: true` | Bot loadout, not player |
| GES / gearScore / autoEquip | Not in live production exports |
| Item `level_requirement` field | Compatibility name for **economic/display item level**. Not an equip gate |
| Equipped Gear sale | **Rejected** by server and Godot. Player must unequip before resale. |

## Later-phase dependencies

Mission pity/rarity/item-level · Market 90/10 and rarity/level tables · Contraband · Dungeon/Wormhole rarity tables · Companies/Shipments/Commissions · combat sheet (Phase 3).

## Source boundary

| Gear source | Universal item generation migrated? | Source rarity/drop logic migrated? | Later phase |
|---|---|---|---|
| Mission | Yes (`randomItem` → `GenerateGearItem`, origin=`mission`) | No | Phase 4 |
| Tutorial first helmet | Yes (shared generator + tutorial primary-stat overwrite) | No | Tutorial / Phase 4 |
| Dungeon | Yes (origin=`dungeon`) | No | Phase 7 |
| Wormhole | Yes (origin=`wormhole`) | No | Phase 7 |
| Market / shop stock | Yes (origin=`market`, shipment ineligible) | No (listing rarity/level/price still live shop tables) | Phase 6 |
| Contraband | Field staged; no live generator | No | Phase 6 |
| Commission | Field staged; no live generator | No | Phase 9 |
| Admin / dailies / promo | Yes (origin `unassigned` unless provided) | n/a | — |
| Promo `fullLegendary` | Uses generator; **still equips on create** (promo path, not earned auto-equip) | n/a | leave unless product retires promo |

## Existing development Gear

- **Preserved.** Stats are not regenerated.
- `ring` → `accessory`; equipped map `ring` key moved to `accessory`.
- Missing origin stamped `unassigned`; manufacturer/shipment_eligible null.
- Legendary items generated under 1.35 **keep old stats** until replaced.
- Dissolve payout uses **new** production resale from economic level (ignores stale `sell_value`).
- Fresh character optional for clean Legendary 1.50 samples; not required for play.
