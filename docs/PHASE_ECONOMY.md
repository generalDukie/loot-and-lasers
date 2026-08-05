# Phase / Restoration 15 — Economy, Stardust, Nova Crystals & Ledgers

Architecture: Nakama = auth only. **Node Character balances are authoritative.**
Godot presents balances and initiates requests — never mutates currency.

## Completion report

### 1–3. Storage & ownership

| Currency | Scope | Authority |
|----------|--------|-----------|
| Stardust | Character | Node `Character.stardust` (integer) |
| Nova | Character | Node `Character.nova_crystals` as **half-units** |
| Fuel | Character | Node `Character.fuel` |

Nakama `wallets/wallet` remains a parallel legacy ledger via `walletBridge`
(display Nova conversion applied). Godot does **not** sum Nakama + Node.

### 4–5. Precision

- Stardust: integer (`clampStardust`)
- Nova: integer half-units (`1 Nova = 2 units`); display `.0` / `.5` only
- Migration `nova_half_units_v1`: existing balances ×2 + `economy_nova_scale: 2`
- Starting Nova: **500 display** (1000 half-units) on **every** new character
- Starting Stardust: **0**
- Grant path: `applyCharacterCreationStartingGrant` → `creditNova` ledger
  (`character_creation_starting_nova`); Stardust init audited at 0
- Idempotent per `character.id` — creation retries do not double-grant
- Not account-wide; second/third characters each receive their own 500 Nova

### 6–8. Ledger & mutation API

`server/src/shared/currencyService.js`:

- `creditNova` / `debitNova` / `creditStardust` / `debitStardust`
- `novaDebitPatch` / `novaCreditPatch` / `getBalances` / `recoverTransaction`
- Each mutation → `wallet_operations` receipt (when idempotency key present) +
  `recordCurrencyChange` audit

### 9. Shared StardustPerFuel

Unchanged single source: `src/lib/stardustEconomy.js` (re-exported).

### 10–17. Costs restored (superseded prices removed)

| Sink | Cost |
|------|------|
| Fuel +20 | **20 Nova** (flat, max 10/day) |
| Mission skip | **Fuel × 0.10**, ceil to 0.5 Nova min |
| Shop refresh | **20 Nova** |
| Arena paid battle | **15 Nova** |
| Dungeon cooldown skip | **25 Nova** |

Mission skip ignores elapsed time; naturally complete → 0 charge.

### 18–22. Premium packages

Finalized grants: 275 / 850 / 1950 / 4500 / 12750 / 30000  
Prices: $1.99 / $4.99 / $9.99 / $19.99 / $49.99 / $99.99  
(`pack_2`…`pack_100`; legacy pouch/cluster aliases map to finalized packs).

`PurchaseCrystalPack`: catalog grant + idempotent receipt key; production still
501 without Stripe (`CRYSTAL_PACK_DEV_GRANT` / non-prod for local).

Refund/revocation: audit trail via ledger; full Stripe revocation deferred.

### 23–25. Daily counters / free Nova / admin

- Fuel purchases: existing `fuel_purchases` + `fuel_reset_at` cycle
- Arena rewarded wins: existing ET day fields (Prompt 16 owns matchmaking)
- Free Nova sources: weekly quests, casino (bounded) — not invented
- Admin adjust: existing audit path retained

### 26–30. Files

**Node:** `currencyService.js` (new), `economyFormulas.js`, `economy.js`,
`economyFollowOn.js`, `entityAccess.js`, `db.js` (migration), `walletBridge.js`,
`test-economy.mjs`

**Godot:** `CurrencyManager.gd`, `ShopManager.gd`, `GameData.gd`, `mission_run.gd`

**Web:** `gameData.js`, `arenaEngine.js`, `dungeonEngine.js`, `useMissionManager.js`

### 31–33. Strategy

- Atomic patches inside `withTransactionAsync`
- Idempotent debit/credit via `wallet_operations`
- Cooldown-skip replay peeks receipt before cooldown gate

### 34–37. Tests

```
npm run test:economy   # 11 passed
npm run test:dungeon   # 19 passed
npm run test:shops     # 13 passed
npm run test:mining    # 15 passed
```

### 38–41. Outstanding / deferred

- Stripe receipt validation against Apple/Google/Stripe APIs not wired
- Not every legacy sink fully routed through `credit/debit` helpers (casino,
  some shop stardust paths still patch + audit; Nova sinks updated)
- Arena full matchmaking = Prompt 16
- Ship purchase still uses `ship.cost` against Nova field (pre-existing quirk)
- Stress/concurrency suite not added this phase
- Godot auth foundation test expects starter display Nova **500** (1000 half-units)
  asserting raw storage

### Completion gates

| Gate | Status |
|------|--------|
| Nakama authoritative balances? | No |
| Godot mutates balances? | No |
| Nova float authority? | No — half-units |
| Duplicate grants/spends? | Guarded via wallet_operations |
| Old Nova prices? | Replaced |
| Fuel escalate / >10/day? | No |
| Client callback grants Nova? | No |

### Diagrams (summary)

```
Nakama session → Node JWT → resolve account/character
  → currencyService credit/debit
  → Character balance + wallet_operations + audit
  → authoritative balances → Godot CurrencyManager
```

```
Platform purchase → receipt_id → PurchaseCrystalPack
  → validate product map → creditNova(idempotent) → display balance
```
