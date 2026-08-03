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
| 14 | `active_missions` | character id | account | Claim fields: `claim_request_id`, `reward_transaction_id`, `loot_transaction_id`, `claimed_at`, `reward_status`, receipt summaries |
| 14 | `reward_transactions` / `loot_transactions` | `mission_reward:` / `mission_loot:` + mission id | recipient | Canonical grant records referenced by mission |
| 15 | `shops` | `<character_id>:<shop_id>` | account | Character shop offers + revision |
| 15 | `shop_transactions` | `request_id` | account | Buy/sell/refresh idempotency receipts |
| 17 | `combat_transactions` | `request_id` | account | Combat simulate idempotency + deterministic replay |
| 18 | `arena_states` | character id | account | Character Arena rating / streaks / cooldowns |
| 18 | `arena_index` | character id | system UUID | Public ranking index (server-written) |
| 18 | `arena_transactions` | `request_id` | account | Challenge/refresh idempotency |
| 18 | `arena_history` | `battle_id` | account | Per-account copies of battle receipts |
| 19 | `social_transactions` | `request_id` | account | Friend/block idempotency |
| 19 | `social_rate_limits` | `friend_requests` | account | Friend request rate tracking |
| 19 | `chat_transactions` | `request_id` | account | Chat send idempotency |
| 19 | `chat_rate_limits` | `global` / `dm` | account | Chat rate tracking |
| 19 | `chat_read_state` | conversation_id | account | Per-user DM read/unread |
| 20 | `mail_messages` | `mail_id` | recipient account | Inbox / system / soft-deleted mail documents |
| 20 | `mail_sent` | `mail_id` | sender account | Sent copies of player text mail |
| 20 | `mail_indexes` | `meta` | account | Unread count index |
| 20 | `mail_transactions` | `request_id` | account | Send/claim idempotency |
| 20 | `mail_rate_limits` | `send` | account | Player mail rate tracking |
| 20 | `reward_transactions` | `mail_reward:<mail_id>` | recipient | Attachment claim grants via RewardService |

Permissions for Phase 10 system objects: read `0`, write `0` (runtime/RPC only).

Missing config records use **code defaults**; `config_get` does not auto-seed storage.

Equipment mutations require both inventory and equipment records (created empty if missing). Bag capacity for unequip uses server `BAG_CAP_DEFAULT = 10`.

Reward transactions: read `1`, write `0`. Statuses include `pending`, `applying`, `completed`, `failed`, `compensation_required`. Retention: keep indefinitely until a cleanup job is defined.

Loot transactions: read `1`, write `0`. Statuses include `pending`, `generated`, `granting`, `completed`, `failed`, `inventory_full`. Seed material is not stored in client-visible responses. Retention: keep indefinitely until a cleanup job is defined. On inventory full, the generated receipt is preserved without granting.

Mission claim (Phase 14): active mission may remain `claimed` until the next `mission_start` clears it (idempotent replay). Large transaction bodies are not duplicated — summaries + foreign keys only.
