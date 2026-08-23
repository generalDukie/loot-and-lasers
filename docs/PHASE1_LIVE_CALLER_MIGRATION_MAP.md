# Phase 1 Live Caller Migration Map

Phase 1 migrates the live **character progression foundation** onto locked Phase 0 `src/lib/productionMath/`. Formulas were not refit.

XP unit policy (latest user decision, overrides Phase 1 prompt §9): **completely 1:1**. Calculated = granted = stored = API = displayed. `PRODUCTION_XP_STORAGE_SCALE = 1` (identity sentinel, not a conversion). There is no XP ×10 / ÷10.

The production XP denomination was increased by rewriting the authoritative XP formulas and constants. This is NOT an XP scaling layer.

`XP_STARDUST_SCALE = 10` is **LEGACY ECONOMY IMPLEMENTATION — PENDING SYSTEM-SPECIFIC MIGRATION/RECONCILIATION**. It is not production XP policy and not production economy authority. Remaining casino / guild / ship / vendor ×10 usages keep today's live numbers until those systems' assigned phases. It is not applied to any XP calculation, grant, storage, requirement, or display path.

`MAX_LEVELS_PER_XP_GRANT = 100000` is a runaway-loop safety guard in `grantCharacterXp`, not a gameplay level cap. L2000 is a validation horizon only.

Combat event resolution uses `src/lib/arenaEngine.js` + `src/lib/combatMath.js` (Phase 3). Character-sheet derived stats use productionMath.

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
| **Callers** | Live Mission XP product: `computeMissionXpFromFuel` → `missionXpReward` (`ROUND(Fuel * xpf * variance * 0.85 * 0.85)`). Arena/Dungeon **amount** formulas remain later-phase; they consume canonical XP/Fuel. |
| **Godot** | Mission board displays server `preview_xp` / `final_xp` (not a client formula). `MissionBoard.xp_per_fuel` is Arena estimate only. |

## XP grant loop

| | |
|---|---|
| **Old** | `grantCharacterXp` trusted stored `experience_to_next_level`; RNG `pickLevelUpAttribute` 35/25/20/10/10 |
| **New** | always `xpToNext(level)`; leftover preserved; compose stats; deterministic 35/35/20/5/5 |
| **Callers migrated** | `applyXpToCharacter`, `applyCharacterRewards` (daily login / promo / reward pipeline), Arena/Dungeon/Mission settlement (`economyFollowOn.js`), admin XP grant |
| **Sources not migrated (amount formulas)** | Arena XP, Dungeon/Wormhole XP, daily-login/promo tables. They already pass a resolved integer into the common grant primitive. Mission XP **product** now uses certified `missionXpReward` (both 0.85 factors) before Collection/ship bonuses. Collection bonus still applies once in `computeMissionGains`, not inside `grantCharacterXp`. |

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
| **New** | Certified Horner `attributePurchaseCost` (`attrcost`) **unchanged** |
| **Live mapping** | `permanentAttributePurchaseCost(n)` — **INTENTIONAL DISCRETE INTRODUCTORY ATTRIBUTE-PRICE TABLE** |
| **Intro table** | 1→10; 2→20; 3→40; 4→60; 5→80 **per attribute** (independent counters) |
| **After intro** | That stat's purchase #n ≥ 6 costs `attrcost(n - 5)`. That stat's #6 is certified curve purchase #1. |
| **Callers** | `getAttributePointCost` / `getNextAttributePointCost`, `BuyAttribute` (server authority + optional `request_id` replay) |
| **Godot** | `StardustEconomy.permanent_attribute_purchase_cost` preview-only (Horner clone remains for attrcost) |
| **PCHIP** | unused by live attrcost; historical leftover |

The certified attrcost curve itself is unchanged. Each attribute's first five fixed-price purchases precede **that attribute's** certified curve; that attribute's purchase #6 is certified attrcost curve purchase #1. Buying Strength does not raise Vitality's next price.

## Character creation defaults

| Field | Value |
|---|---|
| Level | 1 |
| XP / leftover | 0 |
| XP-to-next | `xpToNext(1)` = 133 |
| Stats | class starting attributes |
| Nova | 500 (ledger grant) |
| Stardust | 0 |
| Fuel | 100 (`FUEL_MAX` / `FREE_FUEL_PER_GAME_DAY`) |

## Derived character-sheet stats

| Primitive | Live sheet | Combat (unchanged, Phase 3) |
|---|---|---|
| HP | `maxHp` round-half-even | `statEngine.getMaxHP` / `MissionCombat.max_hp` |
| Raw attack | `rawStandardAttack` (no variance) | `computeDerivedStats` / `MissionCombat.base_damage` (+ AGI 0.925 on old sheet) |
| Crit / Dodge / Resist | production Crit×1.55 exp 1.80; PCHIP natural level caps (`naturalDodgeLevelCap` / `naturalCritResistLevelCap`); Reflex dodge conversion unchanged; 3-channel resist mapped to existing `armor`/`techResist` UI | Retired `(L/100)^0.65` early factor (`GENERIC_EARLY_EXPONENT`, historical). `softCapPercent` now scales the same PCHIP caps. |

## Persistence

- `experience_to_next_level` is a **cache**: always regenerated from `xpToNext(level)`.
- Permanent stats are **composed**: starting + free-from-level + `attribute_purchases_by_stat`. Gear/Stim/Ship are not baked in.
- Each attribute's next Stardust price uses **that stat's** `attribute_purchases_by_stat` count. Counters stay independent through the intro table and the certified curve.
- Startup migration `phase1_production_progression_v1` clamps leftover XP (does **not** convert obsolete ×10 leftover into extra levels) and recomposes attributes.

## Stardust wallet

Gameplay wallet cap `5e12 * 10` removed. `STARDUST_MAX` is now `Number.MAX_SAFE_INTEGER` (JS safety only). Casino wager caps unchanged.

## Daily clocks

`todayET` (America/New_York) still used by Arena, dungeon, daily login, and other side systems. Production game day is 19:00 UTC. **Not migrated in Phase 1** — flagged for global timer work.

## Intentionally not migrated (later phases)

Gear generation, backpack, companies/shipments/commissions/frontier, combat engine, mission generation, mission enemy scaling, market/contraband, stims, mining, dungeons/wormholes **reward formulas**, Arena **reward formulas**, GES, Ship/Hangar bonuses (remain disabled), UI redesign.

## Known deferred baseline — `test-mission-reward-finalization.mjs`

Classified 2026-08-22 while locking Phase 1 after the L1 Mission XP product fix. **Do not treat these as Phase 1 regressions.** Both failures reproduce on `main` HEAD (`83489ca`) with the XP working-tree files reverted. Production pin / pity / item-chain code was not changed in this pass.

### Pity streak (`WIN increments pity streak on a Nothing outcome`)

- **Cause:** The assertion treats `(claim.body.items || []).length > 0` as a gear drop. Live settlement is exclusive GEAR → STIM → JUNK → NONE. Stim/Junk grant an item but increment pity (`gearDropped === false`). Expected fail rate ≈ 65% (`0.80 × 0.25` Stim + `0.80 × 0.75 × 0.75` Junk).
- **Not tutorial helmet:** `entities.Character.create` in this fixture does not run `sanitizeCreatePayload`, so `onboarding_tutorial` is missing. `shouldReserveFirstMissionBonusLaunch` reads **raw** onboarding and does not grant the helmet. Observed outcomes are GEAR/STIM/JUNK/NONE from `settleMissionItemChain`.
- **Classification:** Test encoding of obsolete “any item = gear” behavior. Introduced with the finalization suite (`634317c`, 2026-08-09), **before** Phase 1 XP work.
- **Later Mission phase:** Assert `item_outcome === "GEAR"` (or `gearDropped`), not bag length.

### Low-fuel board (`Low-fuel board is served when no normal offer is affordable`)

- **Cause:** The test assumes L8’s cheapest **normal pool** offer is 60s / 1 Fuel, so 0.5 Fuel must receive `low_fuel` offers. `shouldPinTutorialOnboardingMissionDurations` uses `onboardingForCharacter` → `normalizeOnboarding(missing)` → **pending tutorial**. Missing `missions_completed` counts as 0. All three daily offers pin to `TUTORIAL_ONBOARDING_MISSION_DURATION_SECONDS` (30) → Fuel 0.5 → `boardCanAffordAny` is true → **normal** 30s offers, not `low_fuel`.
- **Split onboarding helpers:** `getOnboardingFromCharacter` treats missing `onboarding_tutorial` as **completed**; pin uses `normalizeOnboarding` and treats missing as **pending**. Fixture characters therefore pin like a fresh tutorial operative.
- **Classification:** Pre-existing tutorial duration pin (`37adce3`, 2026-08-11) vs a test written two days earlier (`634317c`) that never disables tutorial. Not from Mission XP / Phase 1. Live pin for real onboarding is intentional.
- **Later Mission phase:** Fixture should opt out of tutorial (`onboarding_tutorial.status = "completed"` and/or `missions_completed > 0`) if the intent is post-tutorial L8 low-fuel. Do not change the 30s pin in Phase 1.

Phase 1 lock is **not blocked** by these two cases. The file remains red until Mission-phase test hygiene.
