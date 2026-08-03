# Storage migrations (Nakama)

Schema history for Nakama storage collections introduced by backend phases.

| Phase | Collection | Key pattern | Owner | Notes |
|-------|------------|-------------|-------|-------|
| 3 | `player_profiles` | `profile` | account `user_id` | Profile document |
| 4 | `inventories` | character id | account | Read-only get |
| 5 | `wallets` / `wallet_transactions` | account-scoped | account | Mutations internal |
| 6 | `equipment` | character id | account | Read-only get |
| 7–8 | `mission_boards` / `active_missions` | character id | account | Authoritative missions |
| 10 | `remote_config` | namespace (`global`, `missions`, `client_ui`) | system UUID `00000000-0000-0000-0000-000000000000` | RPC read via `config_get` |
| 10 | `feature_flags` | `flag_id` | system UUID | Evaluated server-side |
| 11 | `equipment` / `inventories` | character id | account | Equip/unequip moves instances (model B) |
| 11 | `equipment_mutations` | `request_id` | account | Idempotency / replay |
| 12 | `reward_transactions` | `transaction_id` | recipient account | Reward apply status + applied steps |
| 13 | `loot_transactions` | `transaction_id` | recipient account | Loot generation receipt + grant status |
| 13 | `inventories` | character id | account | Internal `grant_item_instance` append (via RewardService) |

Permissions for Phase 10 system objects: read `0`, write `0` (runtime/RPC only).

Missing config records use **code defaults**; `config_get` does not auto-seed storage.

Equipment mutations require both inventory and equipment records (created empty if missing). Bag capacity for unequip uses server `BAG_CAP_DEFAULT = 10`.

Reward transactions: read `1`, write `0`. Statuses include `pending`, `applying`, `completed`, `failed`, `compensation_required`. Retention: keep indefinitely until a cleanup job is defined.

Loot transactions: read `1`, write `0`. Statuses include `pending`, `generated`, `granting`, `completed`, `failed`, `inventory_full`. Seed material is not stored in client-visible responses. Retention: keep indefinitely until a cleanup job is defined. On inventory full, the generated receipt is preserved without granting.
