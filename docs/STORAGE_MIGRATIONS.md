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

Permissions for Phase 10 system objects: read `0`, write `0` (runtime/RPC only).

Missing config records use **code defaults**; `config_get` does not auto-seed storage.
