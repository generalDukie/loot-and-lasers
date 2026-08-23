# Phase 0 Formula Extraction Report

Authority used: Test 18 runner `scripts/test18_runner.py` (Analysis Package), Production Implementation Authority via Phase -1, and explicit Phase 0 locks (independent Mission variances; Accessory; no GES; no live caller migration).

Module: `src/lib/productionMath/` — **AUTHORITATIVE FORMULA MODULE — PHASE 1 LIVE FOR CHARACTER PROGRESSION** (other primitives still pending later-phase wiring).

## Amendment — XP unit policy (post-Phase 0 user override)

Certified formulas remain in **design units** and were **not** refit except for the later XP denomination amendment (coefficients only).

`PRODUCTION_XP_STORAGE_SCALE = 1` (identity). There is no XP ×10 / ÷10 conversion.

The production XP denomination was increased by rewriting the authoritative XP formulas and constants. This is NOT an XP scaling layer.

Historical extraction notes below that describe live `getMissionXpPerFuel` as `round(design)×10` or applying `XP_STARDUST_SCALE` to XP are **obsolete**. Live Phase 1 XP uses canonical design units.

**Player Base Damage (native formula):** Live player combat uses `37.5 + 0.008 × Primary^1.727`. There is no live `PLAYER_BASE_DAMAGE_SCALE`. Player context is ×1.0 everywhere. Dungeon/Wormhole enemies use the same native polynomial then ×1.10 (preserving former unscaled ×2.75). The Phase 0 “Context mults … 2.5 / 2.75 / 2.5” row is extraction-era, not live authority. Mission enemies still use historical `15 + 0.0032 × Primary^1.727` until Phase 4.

`XP_STARDUST_SCALE = 10` is **LEGACY ECONOMY IMPLEMENTATION — PENDING SYSTEM-SPECIFIC MIGRATION/RECONCILIATION**. It is not production XP policy and not production economy authority.

Phase 1 later wired progression callers (`xpToNext`, live `missionXpPerFuel` units, starting/free attrs, attrcost, sheet derived). Other rows remain later-phase.

---

## Per-primitive extraction

### Mission XP per Fuel
- T18: `mission_xpf` in `test18_runner.py`
- Repo (Phase 0 snapshot): `getMissionXpPerFuel` then applied a ×10 storage step. **Superseded:** live is 1:1 via `max(1, roundHalfUp(missionXpPerFuel(L)))`.
- Production eq (denomination amendment): `100+5*(L-1)+0.32*(L^1.67-1)`
- Historical T18 eq: `10+0.5*(L-1)+0.032*(L^1.67-1)`
- Classification: **A** for the polynomial; denomination raised by rewriting coefficients. XP storage scale is identity 1, not part of the primitive
- Action: centralized design-unit primitive; no runtime ×10 inside
- Rounding: none

### avgfuel / XPToNext
- T18: `avgfuel`, `empl`, `xpnext`
- Repo: different closed form in `rewards.js` (`2.106 * L^1.532 * …` × 1.35 × post-200 × 1.5 × early)
- Classification: **B** (live XPToNext) / **A** (certified architecture, indefinitely valid)
- Action: centralized exact T18 `xpnext`; no replacement curve
- Evidence: exact equality L1–L2500 vs production clone; monotone; L2500=43_495_928_775

### Mission XP reward
- T18 `mission_block`: `mx=rround(F*mission_xpf(snapL)*eff*.85*.85)`; defeat `mx=rround(mx*.5)`
- Repo (Phase 0 snapshot): different mission XP *product* plus a now-obsolete ×10 unit step. Live XP/Fuel unit is 1:1; mission XP *formula* remains later-phase.
- Classification: **B**
- Action: pure `missionXpReward({fuel, snapshotLevel, xpVariance, defeated})`
- Independent `xpVariance` (new production lock)

### Mission Stardust
- T18: `ms=rround(F*sdpf(snapL)*U(.9,1.1))`; defeat `rround(ms*.5)`
- Classification: **A** + **E** independent variance
- No 0.85 copied from XP

### StardustPerFuel
- T18 `sdpf` ≡ repo `StardustPerFuel`
- Classification: **A**
- L2500=1_313_360_839; monotone

### EPA
- T18: `make_epa` linear interpolation of reconverged Light checkpoints; post-L800 last-segment slope (forbidden as production)
- Repo: PCHIP to L500=11054 then slope 23.9
- Classification: **C**
- Action: linear + Chebyshev on compactified L (λ=80, degree 7) plus three compact Gaussians
- Max official error **0.435%** (was 0.677% before the targeted retry)

### Starting attributes / free attrs / attr cost
- Starting: T18 `BASE` ≡ repo class bases. **A**
- Free attrs: T18 35/35/20/5/5 largest-remainder vs repo 35/25/20/10/10 random. **E**
- Attr cost: T18 Horner-exp vs repo log-PCHIP through 650. **B** → closed form centralized

### HP / raw ATK / variance
- HP T18 combat `round(...)` (half-even). Repo `Math.round`. **A** with explicit helper
- Raw ATK identical. **A**
- Variance T18 `.90+.20*U` all archetypes; repo extra AGI U(0.80,1.05). **E**

### Derived / Crit / Dodge / Resist
- Generic curve T18 `nsoft` FromAttr ≡ repo FromAttr (`ForMax=700*(L/100)^0.95`, exp 1.20). **A**
- Live Dodge/Crit/Resistance **level ceiling** is PCHIP through named anchors (`naturalDodgeLevelCap` / `naturalCritResistLevelCap`). The T18/repo `(L/100)^0.65` early factor is **retired** for these stats (historical `GENERIC_EARLY_EXPONENT` only).
- Crit T18 `ncrit` ForMax×1.55 exp 1.80 vs repo generic 1.20. **B** (attribute conversion unchanged; only the level ceiling retuned)
- Reflex coeff T18 piecewise 0.225→0.325. **C** → C1-smoothed ramp, max error 0.381%
- Resists T18 three-channel vs repo two-channel. **B**

### Mission enemy
- Budget 0.35×EPA, 35/25/20/10/10. **C/A**
- Base ramp T18 `5+10*(EL-1)/24 if mission and EL<25 else 15`. Repo matches. **A**
- Outgoing `nmission_damage_mult`. Repo missing. **C** → certified knots retained (already infinite at ×12)

### Gear
- Base T18 `gearbase` ≡ repo. **A**
- Legendary 1.50 vs repo 1.35. **B**
- Slot ×1.20 for indices ≥6 (Weapon, Ship Module). Accessory not premium. **A**
- PvE offset discrete. **D**. Stat budget only

### Discrete loot / market / stim / nova / dungeon / wormhole
- Extracted verbatim from T18. Classification **D** or **B** where repo differs (Mission rarity, DRU, wormlevel, stim 40/40/20, Legendary price, etc.)
- Wormhole formula already infinite; preserved, not refit

### Arena
- XP T18 `rround(2.125*mission_xpf(L))` vs repo `XPF×5/7`. **B**
- SD T18 ≡ repo `rround(2.25*SPF)`. **A**
- Order: XP at pre-grant L; SD at post-grant L

### Mining
- T18 `0.03*sdpf*minutes` snapshot. Repo matches. **A**. No 720 cap

### GES
- Classification **F**. Not implemented, not registered

### Clocks / Fuel product / no SD cap
- Classification **E**. Recorded as constants only; live timers/caps untouched

---

## Formula classification matrix

Phase 1 amendment to the “Live callers migrated?” column: XPToNext, live mission_xpf **units**, starting/free attrs, attrcost, and sheet HP/derived are **LIVE**. Remaining rows still later-phase. Historical “Repo state” ×10 notes below describe the Phase 0-era live tree, not current XP policy.

| Primitive | Repo state | Test18 state | Classification | Final Phase0 action | Live callers migrated? | Test status |
|---|---|---|---|---|---|---|
| roundHalfUp / Fuel / Nova | JS Math.round mix | rround + Python round | A/E | Centralized both helpers | NO — LATER PHASE | PASS |
| mission_xpf | polynomial (Phase 0-era live ×10 superseded) | polynomial | A | Design-unit primitive | **PHASE 1 LIVE** (units) | PASS exact |
| avgfuel | duration table (aligned) | discrete mature 12.5 | D | Exact table | NO — LATER PHASE | PASS |
| xpToNext | different curve (Phase 0-era ×10 superseded) | avgfuel×xpf×0.85×empl/0.46 | B | Exact T18 | **PHASE 1 LIVE** | PASS exact+stress |
| Mission XP | different product (unit ×10 superseded; formula later) | rround(F×xpf×var×0.85×0.85) | B | Pure + independent var | NO — PHASE 2 | PASS 0.90/1/1.10/defeat |
| Mission SD | SPF×var path mixed | rround(F×SPF×var) | A+E | Pure independent var | NO — LATER PHASE | PASS |
| SPF | exact match | exact | A | Centralize | NO — LATER PHASE | PASS |
| EPA | PCHIP+L500 slope | interpolated anchors | C | Chebyshev+linear+3 Gaussians | NO — LATER PHASE | PASS 0.435% max |
| Starting attrs | match | match | A | Centralize | **PHASE 1 LIVE** | PASS |
| Free attrs | 35/25/20/10/10 | 35/35/20/5/5 | E | Production 35/35/20/5/5 | **PHASE 1 LIVE** | PASS |
| attrcost | PCHIP-650 | Horner-exp | B | Closed form | **PHASE 1 LIVE** | PASS 1..2500 |
| HP | Math.round | Python round | A | half-even | **PHASE 1 LIVE** (sheet) | PASS |
| Raw ATK | match | match | A | Centralize | NO — LATER PHASE | PASS |
| Attack variance | AGI extra | U(0.90,1.10) all | E | Universal explicit var | NO — LATER PHASE | PASS |
| Generic derived | match | match | A | Centralize | NO — LATER PHASE | PASS L2500 |
| Crit | generic exp 1.20 | 1.55 / 1.80 / 30% | B | Specialized Crit | NO — LATER PHASE | PASS |
| Reflex conversion | none/flat | 22.5→32.5 piecewise | C | C1-smoothed | NO — LATER PHASE | PASS 0.381% |
| Resists | 2-channel | 3-channel | B | Three-channel | NO — LATER PHASE | PASS |
| Enemy budget | 0.35×wrong EPA | 0.35×T18 EPA | C | New EPA+weights | NO — LATER PHASE | PASS |
| Enemy base ramp | match | match | A | Centralize | NO — LATER PHASE | PASS |
| Enemy outgoing | missing | piecewise → ×12 | C | Certified knots | NO — LATER PHASE | PASS exact knots |
| Context mults | incomplete | 1 / f(L) / 2.5 / 2.75 / 2.5 | A/B | Constants+function | NO — LATER PHASE | PASS |
| Gear base | match | match | A | Centralize | NO — LATER PHASE | PASS |
| Legendary budget | 1.35 | 1.50 | B | 1.50 | NO — LATER PHASE | PASS |
| Slot premium | weapon/module 1.2 | slot≥6 → 1.2 | A | Accessory not premium | NO — LATER PHASE | PASS |
| PvE offset | missing/wrong | discrete +5…+10 | D | Exact table, stat-only | NO — LATER PHASE | PASS |
| Mission rarity | 50/25/15/8/2 | 60/30/10 | D | Exact | NO — LATER PHASE | PASS |
| Dungeon rarity | mixed | 85/10/5 & 80/20 | D | Exact | NO — LATER PHASE | PASS |
| Market offers/rarity/level | mixed | 8-slot 90/10 + tables | D | Exact | NO — LATER PHASE | PASS |
| Stim bands | 40/40/20 | L<20 / <50 / else | D/E | T18 bands | NO — LATER PHASE | PASS |
| Stim price/duration | 2/4/10 shop | 1.5/3/6.5; T18 hours | D | Exact | NO — LATER PHASE | PASS |
| Market price/resale | mixed | SPF×rar×slot×var; resale % | B/A | Pure + fixtures | NO — LATER PHASE | PASS 0.8/1/1.2 |
| Nova surcharge | missing/wrong | 6-band ladders | D | Exhaustive tables | NO — LATER PHASE | PASS |
| Dungeon DRU/XP | DRU 40…185, ×2.0 | authored DRU + 0.87×2.10×1.25 | D+B | Exact | NO — LATER PHASE | PASS |
| Wormhole | 185+25×depth | 202+2×idx + BandWeight | B | Exact infinite | NO — LATER PHASE | PASS L2500 |
| Frontier | missing | min(0.50, 0.05×ΔL) | E | Formula only | NO — LATER PHASE | PASS |
| Arena XP | XPF×5/7 | 2.125×xpf | B | Replace | NO — LATER PHASE | PASS |
| Arena SD | match | 2.25×SPF | A | Centralize | NO — LATER PHASE | PASS |
| Arena order | unspecified | XP then possibly level then SD | A | Registered | NO — LATER PHASE | documented |
| Mining | match | 0.03×SPF/min | A | Centralize; no 720 cap | NO — LATER PHASE | PASS |
| Clocks/Fuel product | ET midnight; 120 T18 | 19:00 UTC; 100 free | E | Constants only | NO — LATER PHASE | registered |
| STARDUST_MAX | live cap | none | E | Safety report only | NO — LATER PHASE | PASS L2500 |
| GES | n/a | simulation score | F | Not implemented | NO | N/A |

---

## Fitted-formula analysis

### 1. EPA

Certified official anchors (Production prompt / T18 Light reconvergence):

L10=402.6504 … L800=33389.725 (14 checkpoints). T18 `make_epa` interpolates those plus L1=50 and uses last-segment linear extrapolation after L800 — forbidden as production.

Candidates evaluated:

| Candidate | Max official % | Mean % | L1000 | L2500 | Notes |
|---|---|---|---|---|---|
| `a+bL+cL^p` | ~5.7 | ~3.4 | ~39570 | ~98566 | undershoots mid anchors |
| SPF-like 5-param | ~6.6 | ~2.0 | ~43740 | ~145283 | unstable exponent |
| Two-power | ~5.4 | ~2.0 | ~45438 | ~212151 | overfit high L |
| Chebyshev deg8 λ=250, official only | **0.26** | 0.09 | 41170 | 73561 | slope collapses to ~15/level at L2500 |
| **Chebyshev deg7 λ=80 + L1=50** | 0.677 | 0.344 | 42552 | 109635 | prior Phase 0 selection; slope ~45.4→44.3 |
| **Same + 3 compact Gaussians (SELECTED retry)** | **0.435** | **0.211** | **42552** | **109635** | meets ≤0.5%; high-L slope unchanged |

Selected equation:

`EPA(L) = c0 + c1 L + Σ_{k=2}^{7} c_k T_k( 2L/(L+80) - 1 ) + Σ_i A_i exp(-((L-μ_i)/σ_i)^2)`

`c = [-159.31392924564, 43.613870937224, 572.90450494445, 879.5810746474, 795.69577089403, 441.88660880886, 154.3014043182, 72.952149350431]`

Gaussians `(μ, σ, A)`: `(150, 40, -52.11245097289954)`, `(200, 40, 58.1384690907907)`, `(400, 70, -97.90216324155018)`.

Per-anchor % error (retry):

10:−0.393 25:+0.435 50:−0.104 75:−0.386 100:−0.075 150:−0.004 200:+0.083 250:−0.313 300:−0.123 400:−0.004 500:+0.107 600:−0.350 700:−0.304 800:+0.263

Monotone L1→L2500: **yes**. Finite: **yes**. No L800 clamp. Gaussians are ~0 by L1000, so L1000/L1500/L2000 match the Chebyshev tail (slopes 45.33 / 44.87 / 44.51).

Why this one: the 0.26% curve violates mature-trend slope. Unconstrained Chebyshev could not meet 0.5% without that collapse. Three localized Gaussians correct the remaining mid-level residuals and die out, so extrapolation stays the same sane linear+Chebyshev tail.

### 2. Reflex AGI → Dodge conversion

Certified: 0.225 through L400; linear to 0.325 at L750; 0.325 thereafter.

| Candidate | Max % vs T18 checkpoints | Why rejected/selected |
|---|---|---|
| Logistic k=0.025 | 6.02 | undershoots linear mid |
| Logistic k=0.018 | 3.15 | still mid-ramp error |
| Smootherstep 400–750 | 5.56 | zero end-derivatives bend the mid |
| Cosine-kink w=20 | 1.27 | over-blends knots |
| **Cosine-kink w=6 (SELECTED)** | **0.381** | C1, plateaus exact, mature 0.325 forever |
| Exact piecewise | 0 | C0 kink at 400/750; replaced for smoothness |

L1000=L2500=0.325. No indefinite growth. Natural Dodge cap remains 25% on the derived-stat output.

### 3. Mission enemy outgoing multiplier

Certified knots: 0.30 / 0.35 / 0.50 / 2.50 / 6 / 10 / 12 at L1 / 10 / 15 / 20 / 50 / 100 / 200+. Already constant ×12 for all L≥200 (indefinitely valid; no L800 cap).

Hill / 3-sigmoid / 4-hill closed forms: a refined 4-hill hit certified **knots** at ≤0.06% and asymptoted at 12, but **failed the rise itself** (L17 −34%, L25 +67%, L75 −21% vs T18 linear segments). That sacrifices behavioral accuracy for knot cosmetics.

**Selected:** certified piecewise-linear knots, asymptote 12. Exact at every required validation level including L1000/L2000/L2500=12. Documented as an intentional production exception for behavioral fidelity.

---

## Remaining Decisions After Phase 0

NONE for formula certification after the targeted retry (EPA now ≤0.5%; outgoing retains certified knots by design).
