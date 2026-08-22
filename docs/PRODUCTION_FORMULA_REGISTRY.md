# Loot & Lasers — Production Formula Registry v1

Status of this artifact: **CERTIFIED FOR PRODUCTION MATH**.

Implementation status of the module: **CERTIFIED FORMULA — PHASE 1 LIVE FOR CHARACTER PROGRESSION** (other primitives remain pending later-phase wiring).

Canonical code: `src/lib/productionMath/`  
Tests: `server/scripts/test-production-math.mjs`  
Fixtures: `src/lib/productionMath/fixtures/production-math-fixtures.json`  
Banner: **AUTHORITATIVE FORMULA MODULE — PHASE 1 LIVE FOR CHARACTER PROGRESSION**

**XP unit policy (post-Phase 0 user override):** XP is completely 1:1. Calculated = granted = stored = API = displayed. `PRODUCTION_XP_STORAGE_SCALE = 1` (identity sentinel, not a conversion). There is no XP ×10 or ÷10.

The production XP denomination was increased by rewriting the authoritative XP formulas and constants. This is NOT an XP scaling layer.

`XP_STARDUST_SCALE = 10` is **LEGACY ECONOMY IMPLEMENTATION — PENDING SYSTEM-SPECIFIC MIGRATION/RECONCILIATION**. It is not production XP policy and not production economy authority.

GES is not a production mechanic and is not registered.

Accessory is the production Gear slot name (Test 18 `Ring`).

---

## Primitive template

Each entry records: Formula ID, Name, Status, Classification (A–F), Authority, Equation/table, Inputs, Units, Domain, Constants, Rounding, Clamps, Operation order, RNG, Level-scaling, Reference values, L1000/L2500, Callers (future), Migration phase, Tests.

Classification key:

- **A** EXACT TEST18 MATCH — CENTRALIZE AND CERTIFY
- **B** TEST18 CONFLICT — EXTRACT AND REPLACE
- **C** FINITE / INTERPOLATED — DERIVE INFINITE PRODUCTION REPLACEMENT
- **D** INTENTIONAL DISCRETE RULE — PRESERVE EXACTLY
- **E** LATER PRODUCTION DECISION OVERRIDE
- **F** NOT A PRODUCTION MECHANIC

---

## PM-ROUND — Numeric helpers

| Field | Value |
|---|---|
| Status | CERTIFIED FOR PRODUCTION MATH |
| Classification | A / E where helpers differ |
| Authority | T18 `rround` / Python `round` in `scripts/test18_runner.py` |
| Equations | `roundHalfUp(x)=trunc(floor(x+0.5))`; `roundHalfEven` = Python 3 `round`; Fuel nearest 0.25; Nova nearest 0.5 |
| Internal precision | IEEE-754 Number until the named boundary |
| Tests | `test-production-math.mjs` rounding + quantization |

Combat HP / per-hit `round()` uses half-even. Economy/XP `rround` uses half-up. Do not homogenize.

---

## PM-XPF — Mission XP per Fuel

| Field | Value |
|---|---|
| Classification | **A** |
| Equation | `100 + 5*(L-1) + 0.32*(L^1.67 - 1)` |
| Units | canonical design XP / Fuel (no ×10). Denomination raised by rewriting coefficients, not a scale. |
| Rounding | none (full float) |
| Clamps | L≥1 |
| L1 / L1000 / L2500 | 100 / 37840.05575… / 163849.69841… |
| Migration | Phase 1+ (rewards) |
| Tests | exact equality vs T18 clone |

---

## PM-AVGFUEL — Average mission Fuel

| Field | Value |
|---|---|
| Classification | **D** |
| Table | L≤2:0.375; ≤3:0.5; ≤4:0.75; ≤5:0.875; ≤7:1; ≤8:1.5; ≤10:1.75; ≤12:3.75; ≤14:5; ≤15:6.25; ≤17:8.75; ≤18:10; ≤19:11.25; else **12.5** |
| Level-scaling | matures at 12.5; indefinitely valid |

---

## PM-XPNEXT — XP to next level

| Field | Value |
|---|---|
| Classification | **A** (architecture already indefinitely valid) |
| Equation | `max(1, rround(avgfuel(L) * mission_xpf(L) * 0.85 * empl(L) / 0.46))` |
| `empl(L)` | `1.67985 + 0.239507*L^0.662355 + 18.3178*(L/500)^4` |
| Units | design XP |
| Rounding | rround after full product |
| Clamps | max(1, ·); no level cap |
| L1 / L800 / L1000 / L2500 | 133 / 87284765 / 277950267 / 43495928775 |
| Monotone | yes L1→L2500 |

---

## PM-MISSION-XP — Mission XP reward

| Field | Value |
|---|---|
| Classification | **B** vs live mission-reward *product* (Phase 2); T18 math **A**. Live XP/Fuel unit is 1:1 as of Phase 1. |
| Equation | `rround(Fuel * mission_xpf(snapL) * xpVariance * 0.85 * 0.85)`; defeat `rround(win * 0.5)` |
| RNG | explicit `xpVariance` in [0.90, 1.10]; independent of Stardust |
| Level | snapshot at Mission acceptance |
| Fixtures L50 Fuel 12.5 | 0.90→4590; 1.00→5100; 1.10→5610; defeat@1.00→2550 |

---

## PM-SPF — Stardust per Fuel

| Field | Value |
|---|---|
| Classification | **A** |
| Equation | `rround(50 + 1.009*(L-1)^1.625 * (1+(L/166.66)^3.055))`; L=1 → 50 |
| Units | Stardust (not XP-scaled) |
| L1000 / L2500 | 18084617 / 1313360839 |

---

## PM-MISSION-SD — Mission Stardust reward

| Field | Value |
|---|---|
| Classification | **A** + **E** independent variance lock |
| Equation | `rround(Fuel * SPF(snapL) * stardustVariance)`; defeat `rround(win * 0.5)` |
| No 0.85 XP efficiency | certified absence |
| Fixtures L50 Fuel 12.5 | 0.90→7054; 1.00→7838; 1.10→8621; defeat@1.00→3919 |

---

## PM-EPA — Expected player attributes

| Field | Value |
|---|---|
| Classification | **C** |
| Equation | `c0 + c1*L + Σ_{k=2..7} c_k T_k(2*L/(L+80)-1) + Σ_i A_i exp(-((L-μ_i)/σ_i)^2)` |
| Gaussians | (μ,σ,A) = (150,40,−52.11245097289954), (200,40,58.1384690907907), (400,70,−97.90216324155018) |
| Max official-anchor error | **0.435%** at L25 (mean **0.211%**) |
| L1000 / L1500 / L2000 / L2500 | 42551.91 / 65105.50 / 87445.04 / 109635.49 |
| Slope L500 / L800 / L1000 / L1500 / L2000 | ~44.13 / 45.37 / 45.33 / 44.87 / 44.51 |

---

## PM-ATTR-START / PM-FREE-ATTR / PM-ATTRCOST

Starting Might 15/8/6/14/7, Reflex 7/15/7/11/10, Tech 6/8/15/13/8. **A**.

Free level: +2/L after L1; **35/35/20/5/5** largest-remainder. Classification **E** vs live 35/25/20/10/10.

`attrcost(n)=max(1,rround(exp(Horner(log(n+20)))))`. **B** vs live PCHIP. n=1→11; 650 and 2500 finite.

The certified `attrcost` curve itself is unchanged. The first five fixed-price purchases precede it; global purchase #6 is certified attrcost curve purchase #1.

---

## PM-ATTR-INTRO — Intentional discrete introductory attribute-price table

| Field | Value |
|---|---|
| Classification | **D** INTENTIONAL DISCRETE RULE |
| Status | PRODUCTION LIVE |
| Authority | `productionMath.permanentAttributePurchaseCost` |
| Intent | First five **total** permanent-attribute purchases (all stats share one global count) use a fixed Stardust table. They are a separate introductory sequence placed **before** the certified curve. |
| Table | 1→10; 2→20; 3→40; 4→60; 5→80 |
| Afterward | `globalPurchaseCost(n) = attrcost(n - 5)` for `n ≥ 6` |
| Mapping | `curvePurchaseIndex = globalPurchaseNumber - 5` for every global purchase ≥ 6 |
| Anchors | global #6 = attrcost(1) = 100; #15 = attrcost(10) = 112; #55 = attrcost(50) = 260; #655 = attrcost(650) = 111517 |
| Explicit | The certified attrcost curve itself is unchanged. Do not describe this as shifting or modifying the curve. Horner coefficients are untouched. |
| Persistence | Global count = sum of `attribute_purchases_by_stat` (per-stat ownership preserved) |
| Settlement | Server `BuyAttribute` via `getAttributePointCost` / `getNextAttributePointCost`. Godot preview mirrors the helper; it does not control settlement. |

---

## PM-HP / PM-ATK / PM-VAR

HP: `roundHalfEven(50+2.5*VIT+0.008*VIT^2)` — combat Python `round`. **A**.

Raw ATK: `15+0.0032*Primary^1.727` (no variance). **A**.

Variance: explicit Uniform(0.90,1.10) all archetypes. **E** (remove AGI extra U(0.80,1.05)).

---

## PM-DERIVED / PM-CRIT / PM-DODGE / PM-RESIST

Generic ForMax `700*(L/100)^0.95`; FromAttr/Early as certified. **A**. Tested to L2500.

Crit: ForMax×1.55, exp 1.80, cap 30%. **B** vs live generic 1.20.

Reflex AGI conversion: C1-smoothed 22.5%→32.5%, blend half-width 6, mature 32.5% forever. **C**. Max checkpoint error **0.381%**. Natural Dodge cap 25%.

Resists: three channels, cap 30%, no self-resist. **B** vs live Armor/Tech-only.

---

## PM-ENEMY-BUDGET / PM-ENEMY-RAMP / PM-ENEMY-OUT

Enemy total `max(5, rround(0.35*EPA(snapL)))`; hidden 1/3 archetypes; 35/25/20/10/10. **C/A**.

Base ramp: EL<25 → `5+10*(EL-1)/24` else 15. **A**. EL=25 is mature 15.

Outgoing: certified knots L1=0.30 … L200+=12.00, constant 12 thereafter. **C** classified as already-infinite certified architecture. Smooth 4-hill/sigmoid retry hits knots (≤0.06%) but distorts the L15–L20 cliff (L25 error ~67%); exact interpolation retained as a behavioral-fidelity exception.

Context: Mission player ×1.0; D/WH player ×2.5 enemy ×2.75; Arena ×2.5 symmetric.

---

## PM-GEAR-BASE / RARITY / SLOT / PVE-OFFSET

Base `rround(1.4079*L + 2.2988*sqrt(L) + 8.277)`. **A**.

Rarity budget 0.70/0.85/1.00/1.20/**1.50**. **B** for Legendary vs live 1.35.

Slot: Weapon and Ship Module ×1.20; Accessory normal.

PvE hidden offset discrete +5 (L≤150) … +10 (L>190). **D**. Stat budget only — not economic/resale/Market level.

---

## PM-RARITY-TABLES

Mission 60/30/10/0/0. Dungeon regular 85/10/5 Rare/Epic/Leg. Boss 80/20 Epic/Leg. **D**. Source-separated.

Mission item-level offsets weights `[.10,.15,.20,.20,.20,.15]` → `max(1, snapL-off)`. **D**.

---

## PM-MARKET

8 slots; 90% Gear / 10% Stim; if all Gear convert one random to Stim. **D**.

Normal rarity 20/35/30/12.5/2.5. Level 35/35/20/10 of L, L-1, L-2, L-3 never above player; `max(1,L-off)`. **D**.

Stim band: L<20 Uncommon, L<50 Rare, else Epic. **D/E**.

Stim shop 1.5/3.0/6.5 × SPF; sell 0.75/1.5/3.25 × SPF. T18 unrounded product; `*Resolved` helpers rround for integer wallets.

Price: `rround(SPF(il)*rarMult*slotPrem*priceVariance)` variance explicit 0.80/1.00/1.20.

Resale: `rround(pre-variance base * 0.60/0.60/0.40/0.35/0.30)`.

Nova surcharge: six-band tables exact. **D**.

---

## PM-STIM-DURATION

Uncommon +5% 6h/18h; Rare +10% 12h/36h; Epic +20% 24h/72h. Same-tier extend to cap; higher replaces; lower does not; max 3 actives. **D**.

---

## PM-DUNGEON / PM-WORMHOLE / PM-FRONTIER

DRU `[60,150,170,300,340,495,715,810,1060,1330]`. **D**. Unlock `[10,20,30,40,50,60,70,90,120,140]`.

XP: `rround(DRU*share*xpf(enemyL)*0.87*2.10)` then `rround(*1.25)`. **B** vs live DRU/`×2.0`.

Wormhole: `wormlevel(i)=202+2*i`; BandWeight vs xpnext_dru_reference share 0.60; `round5(1340*w(B)/w(1))`. Infinite. **B** vs live `185+25*depth`.

Frontier: `min(0.50, 0.05*max(0, EnemyL-PlayerLAtVictory))` on D/WH victory XP only. **E**. Not wired.

---

## PM-ARENA-XP / SD / ORDER

XP `rround(2.125 * mission_xpf(L))`. **B**.

SD `rround(2.25 * SPF(L))`. **A**.

Certified T18 daily-loop order: snapshot `arenaL=self.L`; grant XP; **then** Stardust at `self.L` after possible level-up. Product 10-wins/day wrapper is not Phase 0.

---

## PM-MINING

`0.03 * SPF(snapshotLevel)` per minute. **A**. No 720-minute product cap.

---

## PM-CLOCKS / FUEL-PRODUCT

Reset 19:00 UTC; Market 19:00 and 07:00 UTC; Contraband 19:00 UTC; no DST. **E**.

Free Fuel 100/day; paid 20 Fuel / 20 Nova; max 10 paid/day. **E**. Not wired.

No Stardust wallet cap in this module. **E**. Live `STARDUST_MAX` untouched.

---

## Side-system separation

Collection XP, Nexus, Casino, login, quests, promo, Ship/Hangar are **not** baked into these primitives. Ship/Hangar bonuses remain disabled in live flags.
