# Phase 1 Live Caller Migration Map

Phase 1 migrates the live **character progression foundation** onto locked Phase 0 `src/lib/productionMath/`. Formulas were not refit.

XP unit policy (latest user decision, overrides Phase 1 prompt §9): **completely 1:1**. Calculated = granted = stored = API = displayed. `PRODUCTION_XP_STORAGE_SCALE = 1` (identity sentinel, not a conversion). There is no XP ×10 / ÷10.

`XP_STARDUST_SCALE = 10` is **LEGACY ECONOMY IMPLEMENTATION — PENDING SYSTEM-SPECIFIC MIGRATION/RECONCILIATION**. It is not production XP policy and not production economy authority. Remaining casino / guild / ship / vendor ×10 usages keep today's live numbers until those systems' assigned phases. It is not applied to any XP calculation, grant, storage, requirement, or display path.

`MAX_LEVELS_PER_XP_GRANT = 100000` is a runaway-loop safety guard in `grantCharacterXp`, not a gameplay level cap. L2000 is a validation horizon only.

Combat event resolution still uses `src/lib/statEngine.js` / `MissionCombat.gd` (Phase 3). Character-sheet derived stats use productionMath.

---

## XPToNext

| | |
|---|---|
| **Old authoritative path** | `server/src/shared/rewards.js` `expForLevel` |
| **Old symbol** | polynomial × Post200 × 1.5 × early-game × `XP_STARDUST_SCALE` |
| **New authoritative path** | `src/lib/productionMath/progression.js` |
| **New symbol** | `xpToNext` |
| **Callers migrated** | `expForLevel` (thin wrapper), `getExpForLevel` / `xpToNextBase` in `src/lib/gameData.js`, creation (`entityAccess.js`), admin reset, `grantCharacterXp`, `applyXpToCharacter`, integrity/reconstruction, tests |
| **Old code disposition** | Live polynomial body **removed**. Historical `post200Growth` / `earlyGameXpModifier` retained as unused helpers for the fit script only — not live XP authority. |

## XP unit / MissionXPPerFuel (unit only)

| | |
|---|---|
| **Old** | `round(design) * 10` in `getMissionXpPerFuel` |
| **New** | `max(1, roundHalfUp(missionXpPerFuel(L)))` — no ×10 |
| **Callers** | Arena/Dungeon/Mission XP **amounts** still use existing later-phase formulas; they now consume canonical XP/Fuel. Reward *formulas* themselves were not rewritten. |
| **Godot** | `MissionBoard.xp_per_fuel` preview (Arena estimate) — 1:1, preview-only |

## XP grant loop

| | |
|---|---|
| **Old** | `grantCharacterXp` trusted stored `experience_to_next_level`; RNG `pickLevelUpAttribute` 35/25/20/10/10 |
| **New** | always `xpToNext(level)`; leftover preserved; compose stats; deterministic 35/35/20/5/5 |
| **Callers migrated** | `applyXpToCharacter`, `applyCharacterRewards` (daily login / promo / reward pipeline), Arena/Dungeon/Mission settlement (`economyFollowOn.js`), admin XP grant |
| **Sources not migrated (amount formulas)** | Mission XP, Arena XP, Dungeon/Wormhole XP, daily-login/promo tables, collection XP bonus. They already pass a resolved integer into the common grant primitive. |

## Free attribute allocation

| | |
|---|---|
| **Old** | 35/25/20/10/10 random per point |
| **New** | `freeLevelAttributes` / `allocateByWeights` 35/35/20/5/5 largest remainder |
| **Disposition** | RNG picker **removed** from live grant path |

## Starting attributes

| | |
|---|---|
| **Old** | duplicated `CLASS_BASE_STATS` / `CLASS_TYPE_BASE_STATS` (values already matched production) |
| **New** | `productionMath.STARTING_ATTRIBUTES` → `startingAttributesForClass` → `CLASS_BASE_STATS` / `CLASS_TYPE_BASE_STATS` |
| **Godot** | `StatsRules.CLASS_BASE_STATS` kept as presentation copy; values match production; class flavor/UI unchanged |

## Permanent attribute cost

| | |
|---|---|
| **Old** | `AttributePurchaseCost` log-PCHIP anchors |
| **New** | `attributePurchaseCost` Horner (`attrcost`) |
| **Callers** | `getAttributePointCost` / `getNextAttributePointCost`, `BuyAttribute` (server authority + optional `request_id` replay) |
| **Godot** | `StardustEconomy.attribute_purchase_cost` Horner preview-only |
| **PCHIP** | unused by live attrcost; historical leftover |

## Character creation defaults

| Field | Value |
|---|---|
| Level | 1 |
| XP / leftover | 0 |
| XP-to-next | `xpToNext(1)` = 13 |
| Stats | class starting attributes |
| Nova | 500 (ledger grant) |
| Stardust | 0 |
| Fuel | 100 (`FUEL_MAX` / `FREE_FUEL_PER_GAME_DAY`) |

## Derived character-sheet stats

| Primitive | Live sheet | Combat (unchanged, Phase 3) |
|---|---|---|
| HP | `maxHp` round-half-even | `statEngine.getMaxHP` / `MissionCombat.max_hp` |
| Raw attack | `rawStandardAttack` (no variance) | `computeDerivedStats` / `MissionCombat.base_damage` (+ AGI 0.925 on old sheet) |
| Crit / Dodge / Resist | production Crit×1.55 exp 1.80 caps; Reflex dodge; 3-channel resist mapped to existing `armor`/`techResist` UI | `softCapPercent` |

## Persistence

- `experience_to_next_level` is a **cache**: always regenerated from `xpToNext(level)`.
- Permanent stats are **composed**: starting + free-from-level + `attribute_purchases_by_stat`. Gear/Stim/Ship are not baked in.
- Startup migration `phase1_production_progression_v1` clamps leftover XP (does **not** convert obsolete ×10 leftover into extra levels) and recomposes attributes.

## Stardust wallet

Gameplay wallet cap `5e12 * 10` removed. `STARDUST_MAX` is now `Number.MAX_SAFE_INTEGER` (JS safety only). Casino wager caps unchanged.

## Daily clocks

`todayET` (America/New_York) still used by Arena, dungeon, daily login, and other side systems. Production game day is 19:00 UTC. **Not migrated in Phase 1** — flagged for global timer work.

## Intentionally not migrated (later phases)

Gear generation, backpack, companies/shipments/commissions/frontier, combat engine, mission generation, mission enemy scaling, market/contraband, stims, mining, dungeons/wormholes **reward formulas**, Arena **reward formulas**, GES, Ship/Hangar bonuses (remain disabled), UI redesign.
