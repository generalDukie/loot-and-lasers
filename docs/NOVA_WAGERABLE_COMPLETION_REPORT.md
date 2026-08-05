# Nova Wagerable vs Promotional — Completion Report

Date: 2026-08-05

## 1. Economy model changes

- Nova is still stored as integer **half-units** (`1 Nova = 2`).
- New Character fields:
  - `nova_wagerable_half` — Purchased / Casino-eligible
  - `nova_promotional_half` — Bonus / non-wagerable
  - `nova_crystals` — sum (compat)
  - `nova_dual_balance_v1` — migration flag
  - `nova_migration_classification` — audit tag
- `getBalances()` exposes `nova_wagerable`, `nova_promotional`, totals.
- `creditNova` / `debitNova` require balance class (or category default).
- Casino debits **wagerable only**; casino credits **wagerable**.
- Non-casino sinks: promotional-first, then wagerable.

## 2. Database changes

- Runtime migration `nova_dual_balance_v1` in `server/src/db.js`
- No new tables; Character JSON + existing `wallet_operations` receipts

## 3. Migration strategy

See [NOVA_DUAL_BALANCE_MIGRATION.md](./NOVA_DUAL_BALANCE_MIGRATION.md).

Evidence-based: pack grants tied to character → wagerable; remainder → promotional. Uncertain balances are **not** silently all-purchased.

## 4. Wallet UI changes

- Godot Casino header: total Nova + `(Wagerable X)`
- Godot CurrencyManager stores `nova_wagerable` / `nova_promotional` from balances
- Web CasinoPage shows wagerable beside total
- Casino Nova games validate against wagerable only

## 5. Casino validation changes

- `validateNovaWager(bet, wagerableBalance)` — promotional ignored
- Half-crystal wagers (`.0` / `.5`) accepted
- Debit with `debitPolicy: wagerable`
- Payouts: `floorNovaCasinoPayout` → floor to nearest 0.5
- Error: “Not enough Wagerable Nova…”

## 6. Ledger changes

Nova receipts now include: `currency_type`, `balance_type`, `source`, `destination`, `amount`, `rounded_amount`, `request_id`, `character_id`, `reason` / `reason_code`, wagerable/promotional before/after, timestamp.

## 7. Admin changes

- `adjust_currency` accepts `nova_wagerable` / `nova_purchased` and `nova_promotional` / `nova_bonus`
- Legacy `nova_crystals` delta → promotional (safe default)
- Web `CurrencyAdjustForm` lists Purchased + Bonus rows
- Reset player clears both buckets

## 8. API changes

- All `creditNova`/`debitNova` paths respect balance type
- `PurchaseCrystalPack` → wagerable + character-linked receipt
- `ClaimWeeklyNovaQuest` → promotional via `creditNova`
- `applyCharacterRewards` Nova → promotional via `creditNova`
- Character creation → 500 promotional
- `GetCasinoState.nova_limits` includes `wagerable` / `wagerable_balance` / `promotional`

## 9. Files modified

**Server:** `currencyService.js`, `novaBalances.js` (new), `casinoGames.js`, `casinoService.js`, `economyFollowOn.js`, `rewards.js`, `functions/index.js`, `db.js`, `test-nova-balances.mjs` (new), `test-casino.mjs`, `package.json`

**Godot:** `CurrencyManager.gd`, `CasinoManager.gd`, `casino.gd`

**Web:** `CasinoPage.jsx`, `CrystalRefining.jsx`, `SmugglersCache.jsx`, `CurrencyAdjustForm.jsx`

**Docs:** `NOVA_DUAL_BALANCE_MIGRATION.md`, this report

## 10. Test results

```
npm run test:nova-balances  → 9 passed, 0 failed
npm run test:casino         → (re-run after stub fix)
```

Covered: creation grant, promo-only casino reject, wagerable debit, payout floor-to-0.5, .5 wagers, ledger balance_type, session start with 100.5.

## 11. Remaining compatibility concerns

- Web shell / operative panel may still show raw Character half-units for total Nova unless they prefer `balances` from RPCs (pre-existing half-unit display drift).
- Historical pack receipts without character id were **not** attributed — support may need manual Purchased grants.
- Godot non-Casino wallet chrome may not yet show Purchased vs Bonus everywhere (Casino does).
- Hetzner deploy required for migration to run on staging DB.
- Auth / installer / routing untouched.

### Casino payout audit note

Prior pipeline credited `casino_payout` into the single Nova pool. Spec requires winnings → Purchased/Wagerable so players are not trapped with unwagerable wins. **Implemented: casino payouts credit wagerable.** No conflicting intentional rule found.
