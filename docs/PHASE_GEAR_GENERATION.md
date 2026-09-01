# Restoration 07 — Gear Generation & Item Persistence

> **Phase 2 update:** Live Legendary stat-budget multiplier is **1.50** via `productionMath`. Universal generator is `GenerateGearItem`. See `docs/PHASE2_GEAR_CALLER_MIGRATION_MAP.md`. Historical 1.35 text below is a prior-phase snapshot.

Architecture: Nakama = auth only. **Node owns all gear rolls and persistence.**
Godot displays committed items only.

## Audit verdict

The finalized gear pipeline was already present in
[`src/lib/itemGeneration.js`](../src/lib/itemGeneration.js) (re-exported by
`server/src/shared/itemGeneration.js`). Mission, dungeon, shop, admin, and daily
reward paths already called `randomItem` → `rollItemStats`. No parallel
source-specific stat math was found. Godot has no gear roller.

This restoration **named and wired** the canonical entry point, confirmed
source-independence, expanded tests, and documented favored-pool reconciliation.
It did **not** retune budgets, drop chances, shop pricing, or vendor formulas.

---

## 1. Authoritative generator

| Piece | Location |
|-------|----------|
| Stats engine | `rollItemStats` / `allocateStatBudget` / `selectItemAttributes` |
| Canonical entry | **`GenerateGearItem`** (new alias wrapper) |
| Named + shop/loot payload | `randomItem` in `server/src/shared/rewards.js` (now wraps `GenerateGearItem`) |
| Node re-export | `server/src/shared/itemGeneration.js` → `src/lib` |

## 2–4. Base budget / continuous curve / infinite scaling

- Single continuous formula (no anchors, PCHIP, Level-500 breakpoint, or cap):
  `BaseGearStatBudget(L) = ROUND(GEAR_BUDGET_LINEAR·L + GEAR_BUDGET_CURVE·√L + GEAR_BUDGET_FLOOR)`
- Constants (fit to intended targets L1=12 … L500=795, ≤~7% off mid-curve, L1 exact):
  `GEAR_BUDGET_LINEAR = 1.4079` (scale + permanent high-level slope),
  `GEAR_BUDGET_CURVE = 2.2988` (early/mid √L bend),
  `GEAR_BUDGET_FLOOR = 8.277` (Level-1 floor)
- The same expression evaluates at L50, L500, L2000, and beyond — monotonic, smooth slope, sub-explosive (linear tail).

## 5–7. Slot / rarity / minima

| Rule | Implementation |
|------|----------------|
| Slot mult | Weapon & ship_module **1.20×** stat budget (`SLOT_STAT_MULT`) |
| Rarity stat mult | 0.70 / 0.85 / 1.00 / 1.20 / **1.50** (Legendary; Phase 2 live) |
| Stat counts | 1 / 2 / 3 / 3 / 5 |
| Min shares | 100% / 30% / 20% / 20% / 10% |
| Legendary off-stat cap | Each class off-stat ≤ `floor(TotalStatBudget × LEGENDARY_OFF_STAT_CAP_SHARE)` (17.5%). Live Normal Legendary and directed pools. Remainder after floors + capped off extras goes to Primary / Vitality / Luck. Rounding/repair cannot exceed the cap. |
| Exact sum | `SUM(stats) === TotalStatPool` always |

Legendary **sale** 1.75× remains on historical `GearSaleValue` (shop markup until Phase 6). Player dissolve uses production `gearResaleValue`.

## 8. Favored pools — reconciled (keep)

Already finalized in live code:

- Common–Epic with class: **once per item** 60% favored pool / 40% full pool
- Legendary: always all five attrs (`poolMode: "legendary"`); 10% minimum per stat; each of the two class off-stats is hard-capped at `floor(T × 0.175)` (`LEGENDARY_OFF_STAT_CAP_SHARE`).
- Verified in tests

## 9. Source-specific generators

| Source | Stat path |
|--------|-----------|
| Mission claim | `randomItem` → `GenerateGearItem` |
| Dungeon / milestones | `randomItem` |
| Shop stock | `randomItemForClass` → `randomItem` |
| Admin give_item | `randomItem` |
| Dailies / promos | `randomItem` via `applyCharacterRewards` |
| Wormhole | uses dungeon gear path (same generator) |

No separate mission/dungeon/shop budget curves.

## 10–13. Files / functions

### Changed

- `src/lib/itemGeneration.js` — `GenerateGearItem` + conceptual aliases
- `server/src/shared/rewards.js` — `randomItem` wraps `GenerateGearItem`
- `server/src/shared/inventoryGrant.js` — `PersistGeneratedItem`
- `server/scripts/test-gear-stats.mjs` — expanded Prompt 07 coverage
- `docs/PHASE_GEAR_GENERATION.md`, `docs/ROADMAP.md`

### Godot / DB

- **No Godot changes** (already presentation-only)
- **No migrations** — existing player gear preserved; not regenerated

### Key APIs

`BaseGearStatBudget`, `getItemStatBudget`, `GenerateGearItem`, `randomItem`,
`PersistGeneratedItem` / `grantItemOrPending`, `serializeItem` (Prompt 06)

## 14–16. Duplicates / migration

- No duplicate generators removed (none active)
- Existing inventories **intentionally preserved** (no mass reroll)

## 17–19. Inventory / idempotency / transactions

- Insertion: `grantItemOrPending` / `PersistGeneratedItem` / Prompt 06 inventory
- Reward claim idempotency: existing reward claim ledger (not redesigned here)
- Shop purchase / mission claim remain inside existing `withTransactionAsync` paths

## 20–22. Tests

`npm run test:gear-stats` — continuous C4 curve, monotone + infinite scaling, no
Level-500 breakpoint, slots, rarity, floors, exact sum, favored once-per-item,
source-independence, randomItem parity, vendor≠stat.

Also green: `test:inventory`, `test:shared-foundation`, `test:mission-gear-drop`.

Statistical sample: 40 seeds × rarities × slots for exact-sum + floors; variety check on Legendary remainder; Legendary off-stat cap matrix + 10k stress.

## 23–25. Remaining / deferred / risks

| Deferred | Owner |
|----------|--------|
| Mission drop % / pity | Later mission prompt (unchanged; tested separately) |
| Shop listing authority / pricing | Pipeline 4 / shop restoration |
| Full sell economy | Economy prompt |
| Godot loot-reveal polish | Presentation only if needed |
| Admin `give_item` pending overflow | Optional parity with grantItemOrPending |

**Risks:** `randomItem` now goes through `GenerateGearItem` validation (invalid type/rarity throw). Existing callers already pass valid slots/rarities.

## 26–27. Diagrams

```mermaid
sequenceDiagram
  participant Src as Mission/Dungeon/Shop
  participant RI as randomItem
  participant Gen as GenerateGearItem
  participant Roll as rollItemStats
  participant Inv as grantItemOrPending
  Src->>RI: level, type, rarity, class, rng
  RI->>Gen: same inputs
  Gen->>Roll: budget + allocate
  Roll-->>Gen: stats (exact pool)
  Gen-->>RI: snapshot + sell_value
  RI->>Inv: named item payload
  Inv-->>Src: Item row or pending_loot
```

```mermaid
flowchart TB
  Params[ItemLevel + Type + Rarity]
  Base[BaseGearStatBudget continuous]
  Pool[ROUND Base x Slot x Rarity]
  Sel[Select unique attrs + favored once]
  Alloc[Min floors + remainder = exact sum]
  Snap[Persist stats on Item instance]
  Params --> Base --> Pool --> Sel --> Alloc --> Snap
```
