# Phase 5 — Wallet and currency service

> Historical phase document. Phase 5 created an account-scoped Nakama wallet but
> deliberately did not migrate the live Character economy. The global wallet repair
> therefore designates Node Character balances as the compatibility authority for
> Fuel, Stardust, and Nova. Godot no longer uses `wallet_get` as its display ledger.
> See `docs/WALLET_ARCHITECTURE.md`.

Authoritative only within the legacy Nakama wallet subsystem. It does **not**
supersede live Character balances.

## Audit summary

| Currency ID | Type | Stored today | Spent / earned by |
|-------------|------|--------------|-------------------|
| `stardust` | soft | Character document | missions, arena, void, shop, ship mods, attributes, casino, guild |
| `nova_crystals` | premium | Character document | crystal store, skips, slots, rename, paid arena/dungeon |

No Godot `CurrencyManager` existed before this phase. UI reads `GameManager.active_character.stardust` / `nova_crystals`. There is no `credits` / `premium` id in the project — those names were **not** invented.

Fuel is a separate resource (not a wallet currency). `total_stardust_earned` is a lifetime counter, not spendable.

## Architecture

```
Currency UI (shell keeps Character display)
  → CurrencyManager (read-only)
  → NakamaManager.invoke_rpc("wallet_get")
  → modules/wallet.lua
  → wallets / wallet (+ wallet_transactions)
  → wallet_changed

Trusted server modules (future)
  → require("wallet").credit_currency / debit_currency
  → never trust Godot user_id / balances / results
```

## Currency registry

| id | type | client mutation | Future writers |
|----|------|-----------------|----------------|
| `stardust` | soft | **none** (get only) | mission, shop, arena, void, casino, admin |
| `nova_crystals` | premium | **none** (get only) | purchase verification, weekly quests, admin, promotion |

## Public RPC

- `wallet_get` — load or create zero wallet (read-only)

## Internal functions (not client-callable)

```lua
credit_currency(user_id, currency_id, amount, transaction_id, reason, source)
debit_currency(user_id, currency_id, amount, transaction_id, reason, source)
```

`user_id` must be supplied by a trusted server module (or session context in gated dev tests). Never taken from a Godot payload.

## Removed public RPCs

- `wallet_credit` — unregistered
- `wallet_debit` — unregistered

## Temporary development RPCs

Gated by Nakama runtime env `LOOT_DEV_WALLET_MUTATIONS=1` (set in local `docker-compose.yml`). Soft currency (`stardust`) only. Marked for removal before production.

- `dev_wallet_credit_test`
- `dev_wallet_debit_test`
- `dev_wallet_internal_selftest` — runs internal credit/debit + duplicate + insufficient checks

Without the flag, these return `RPC not found` (404).

## Storage

- `wallets` / `wallet` — balances
- `wallet_transactions` / `<transaction_id>` — audit + idempotency

## Security

- Account id from session / trusted module only
- Reject negative/zero amounts, unknown/disabled currencies, overflow, insufficient funds
- Duplicate `transaction_id` → 409
- OCC retries on wallet version conflicts
- Public Godot client cannot credit or debit any currency

## Non-goals

Shops, missions, arena, purchases, daily login, loot, crafting, trading, admin reward tools, balance migration from Character.
