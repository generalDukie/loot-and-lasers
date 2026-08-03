# Phase 12 — Central reward service

Server-authoritative reward orchestrator for **trusted backend modules**.
This phase does **not** connect missions, arena, shops, mail, daily login, or admin grants.

## Responsibility

`modules/rewards.lua` validates and applies reward bundles, records idempotent transactions, and delegates currency credits to `wallet.credit_currency`.

The normal Godot client must **not** submit reward bundles.

## Public RPCs

| RPC | Status |
|-----|--------|
| Generic `reward_grant` / `grant_reward` / `reward_apply` | **Not registered** |
| `dev_reward_test` | Temporary; gated by `LOOT_DEV_REWARD_TEST=1` |

`dev_reward_test` accepts only `{ test_reward_id, transaction_id?, character_id? }`.
The server chooses the bundle from `modules/data/reward_tables.lua`. Soft currency only (`stardust`). No premium.

## Internal API

- `validate_reward_bundle(bundle)`
- `apply_reward_bundle(bundle)`
- `apply_currency_reward(...)`
- `apply_item_reward(...)` — grants via `inventory.grant_item_instance` when `instance_id` + metadata are present (LootService)
- `apply_xp_reward(...)` — returns unsupported (501)
- `apply_entitlement_reward(...)` — returns unsupported (501)
- `build_reward_result(...)`
- `record_reward_transaction(...)` / `get_reward_transaction(...)`

## Trusted callers (Phase 12+)

| Caller | Authorized? |
|--------|-------------|
| `dev_reward_test` (flag-gated) | Yes — fixed allowlist |
| LootService (`source_type` `loot`) | Yes — Phase 13 |
| Missions / arena / shipments / mail / daily / admin | **Not wired** |

Authorized `source_type` values today: `dev_test`, `system`, `loot`, `loot_dev`.
Future: `mission`, `arena`, `shipment`, `daily_login`, `event`, `achievement`, `mail`, `admin`, `purchase`.

## Supported reward types

| Type | Status |
|------|--------|
| `currency` (`stardust`) | **Supported** via wallet |
| `premium_currency` / `nova_crystals` | **Rejected** |
| `item` / `consumable` | **Supported** only with server-generated `instance_id` + metadata (LootService) |
| `xp` | **Rejected** until ProgressionService |
| `entitlement` / `cosmetic` / `title` | **Rejected** |

## Bundle schema (internal)

```json
{
  "reward_version": 1,
  "source_type": "dev_test",
  "source_id": "stardust_10",
  "user_id": "<trusted>",
  "character_id": "",
  "transaction_id": "",
  "reason": "",
  "rewards": [{ "type": "currency", "currency_id": "stardust", "amount": 10 }],
  "metadata": {}
}
```

## Transaction storage

| Field | Value |
|-------|--------|
| Collection | `reward_transactions` |
| Key | `transaction_id` |
| Owner | recipient `user_id` |
| Read / write | `1` / `0` (runtime writes) |

Statuses: `pending` → `applying` → `completed` | `failed` | `compensation_required`.

Idempotency: same `transaction_id` + same fingerprint → replay prior result.
Same `transaction_id` + different recipient/source/rewards → **conflict**.

Per-step wallet credits use `transaction_id:step:N` so wallet idempotency is independent.

## Partial failure

Multi-object writes are **not** fully atomic. On mid-bundle failure after some applied steps, status becomes `compensation_required`. Phase 12 bundles are single soft-currency steps in practice; compensation is manual/future.

## Wallet / inventory / XP

- Wallet: `require("wallet").credit_currency` — do not duplicate mutation logic.
- Inventory grants: extension stub only.
- XP: extension stub only.

## Development test

```bash
# docker-compose sets LOOT_DEV_REWARD_TEST=1 locally
# RPC: dev_reward_test { "test_reward_id": "stardust_10", "transaction_id": "..." }
```

## Future mission integration

Missions must call `apply_reward_bundle` with server-built bundles after claim/completion design exists.
Do **not** let clients choose amounts.

## Rollback

1. Unregister `dev_reward_test` / remove `rewards.lua`
2. Leave `reward_transactions` records (harmless)
3. Restart Nakama
