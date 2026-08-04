# Phase / Restoration 18 — Casino System

Architecture: **Nakama = auth only.** Node owns wagers, RNG, payouts, and
Stardust settlement via the shared economy ledger. Godot is presentation +
`CasinoSettle` / `GetCasinoState` only.

## Completion report

### 1–3. Authoritative implementation & games

| Piece | Location |
|-------|----------|
| Settlement | `CasinoSettle` in `economyFollowOn.js` |
| Registry / resolvers | `server/src/shared/casinoService.js` |
| Limits / tiers | `economyFormulas.js` (`CASINO_*`, `CASINO_WHEEL_TIERS`) |
| State | `GetCasinoState` |
| Recovery | `RecoverCasinoWager` |

| Game | Enabled | Currency | Notes |
|------|---------|----------|-------|
| `dice` / `stardust_dice` | **Yes** | Stardust | High/Low d6, even money |
| `wheel` / `stardust_wheel` | **Yes** | Stardust | Weighted multiplier wheel |
| `flip` / `crystal_flip` | **No** (`NOVA_CASINO_OPEN=false`) | Nova | Sealed — resolver preserved |
| `jackpot` / `crystal_jackpot` | **No** | Nova | Sealed — resolver preserved |

No roulette / extra games invented.

### 4–9. Rules, limits, payouts, house edge

**Stardust max bet:** `clamp(StardustPerFuel(L)×25, 1000, 2_500_000)`  
**Stardust min bet:** 1 (validated)  
**Nova max:** 100 (when open)  
**Daily Casino limits:** **none recovered** — `daily_limits: null` in state; not invented.

**Dice:** fair 50/50 → house edge **~0%** (even money).  
**Wheel tiers (preserved):**

| p | mult | label |
|--:|-----:|-------|
| 0.50 | 0 | Bust |
| 0.22 | 1 | Push |
| 0.15 | 2 | 2× |
| 0.08 | 3 | 3× |
| 0.04 | 5 | 5× |
| 0.008 | 10 | 10× |
| 0.002 | 25 | 25× |

E[mult] = **1.09** → RTP ≈ **109%**, house edge ≈ **−9%** (player-favoring). **Not rebalanced.**

**Flip (sealed):** 25% double → house edge 50%.  
**Jackpot (sealed):** 1% at 25× net credit `(25−1)×bet` → house edge 75%.

### 10–12. RNG

- Production: `secureRandom` / `secureRandomInt` (`rewards/rng.js`)
- Tests: injectable `rng` / `randomInt` on `resolveCasinoOutcome`
- Client seeds rejected (`assertCasinoClientSafe`)

### 13–17. Economy, ledger, idempotency, recovery

- Wins: `creditStardust` / `creditNova` (net profit model unchanged)
- Losses: `debitStardust` / `debitNova`
- Push: no balance mutation; outcome still receipted
- Categories: `casino_wager` / `casino_payout`, reason `casino_settle`
- Idempotency: `wallet_operations` key `casino_settle` + `request_id`
- Recovery: `RecoverCasinoWager` returns same outcome/payout
- Audit: `auditCasinoSettle` retained

### 18. Godot

`CasinoManager.gd`: `load_state` → `GetCasinoState`; settle with `request_id`; `recover`; no local outcomes.  
`max_bet()` prefers server state, local formula is display fallback only.

### 19–25. Files / disabled / retained

**Changed:** `casinoService.js` (new), `economyFollowOn.js`, `CasinoManager.gd`, `test-casino.mjs`, `package.json`, this doc.  
**Disabled:** flip, jackpot (existing seal).  
**Retained:** wheel odds, bet scaling, net delta formulas, sealed Nova policy.

### 26–28. Locking / concurrency / security

- Settlement inside existing `withTransactionAsync` wrap
- Balance checked before roll; re-checked before debit
- Client `payout_mult` / `currency` / `wager` / seeds rejected
- No duplicate Stardust balance

### 29–33. Tests & regressions

```
npm run test:casino     # registry, validation, dice/wheel, sealed nova, stats, settle+idempotency
```

Wheel frequency grid (100k) matches configured `p` within 0.2%.

Regressions: run `test:economy`, `test:stims`, `test:arena-authority` as needed.

### 34–38. Unresolved / deferred

- **No daily wager/play caps** in codebase — not invented
- Wheel RTP > 100% is intentional recovered table; product may revisit later
- Dedicated Casino history table (receipts via wallet_ops + audit only)
- Web dice settle-after-animation timing (cosmetic; server still authoritative)
- Stress multi-worker harness deferred

### 39–43. Diagrams

**Ownership:** Godot → JWT → `GetCasinoState` / `CasinoSettle` → `casinoService` + `currencyService` → Character + wallet_operations  

**Settlement:** validate → afford check → secure RNG outcome → debit/credit → save receipt → return  

**RNG:** `secureRandom` → dice/wheel resolver → committed `outcome` in receipt  

**Recovery:** same `request_id` → wallet replay → identical outcome/balances  

**Daily limits:** none — state exposes `daily_limits: null`
