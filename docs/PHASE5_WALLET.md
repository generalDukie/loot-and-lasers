# Phase 5 — Wallet and currency service

Authoritative Nakama wallet. Does **not** migrate Character balances or wire shops/missions/arena.

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
  → CurrencyManager
  → NakamaManager.invoke_rpc
  → modules/wallet.lua
  → wallets / wallet (+ wallet_transactions)
  → wallet_changed
```

## Currency registry

| id | type | client credit | client debit | Future writers |
|----|------|---------------|--------------|----------------|
| `stardust` | soft | yes (RPC) | yes | mission, shop, arena, void, casino, admin |
| `nova_crystals` | premium | **no** | yes | purchase verification, weekly quests, admin, promotion |

## RPCs

- `wallet_get` — load or create zero wallet
- `wallet_credit` — `{ currency_id, amount, transaction_id, reason, source? }`
- `wallet_debit` — same shape

## Storage

- `wallets` / `wallet` — balances
- `wallet_transactions` / `<transaction_id>` — audit + idempotency

## Security

- Account id from session only
- Reject negative/zero amounts, unknown/disabled currencies, overflow, insufficient funds
- Duplicate `transaction_id` → 409
- OCC retries on wallet version conflicts
- Premium credit rejected for session clients

## Non-goals

Shops, missions, arena, purchases, daily login, loot, crafting, trading, admin reward tools, balance migration from Character.
