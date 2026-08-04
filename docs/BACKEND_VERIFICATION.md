# Backend verification

## Command

```bash
npm run verify:backend
```

Runs `scripts/verify_backend.mjs` and exits `0` only when all required checks pass.

Optional pre-commit helper (does **not** commit or push):

```bash
npm run checkpoint:backend
```

## Commit gate

Before any future backend commit:

1. Run `npm run verify:backend`
2. Fix failures
3. Only then stage/commit when asked
4. Push only when explicitly instructed

Do not install Git hooks unless the user asks.

## What it checks

1. Repository safety (secret filenames, SDK presence)
2. Godot autoload integrity / no client wallet mutation RPCs
3. Nakama module + shared lib discovery
4. RPC registration (expected public set; forbidden wallet_credit/debit)
5. Wallet security strings / internal mutations
6. Documentation consistency
7. Git working-tree secret filename scan
8. Docker Nakama logs (skipped if Docker unavailable)
9. All `scripts/verify_*.mjs` except `verify_backend.mjs`

## Authentication foundation checks

`scripts/verify_nakama_node_bridge.mjs` verifies Nakama email auth, stable
Nakama-user → Node-account mapping, concurrent first-exchange convergence,
password-free exchange, and gameplay JWT claims. Gameplay tokens must use the
Nakama user id as `sub`, include issuer/audience/`iat`/`exp`/`jti`, expire within
15 minutes, and never outlive the Nakama session.

`npm run test:godot-auth-flow` verifies two isolated accounts, authoritative
Character creation/selection/loading, server-authored starter currency,
idempotent create replay/conflict behavior, JWT re-exchange, and denial of
cross-account Character reads.

The Godot headless audit verifies environment-scoped token code, startup,
selection, and logout scripts compile. Staging validation additionally requires
the shared Node API health endpoint to be externally reachable.

`res://Scripts/test_auth_foundation.tscn` is the local GDScript integration test.
It registers through Nakama, exchanges a Node token, creates/replays/selects/loads
a Character, then proves logout clears both sessions and shared client caches.

## Phase scripts discovered

- `verify_wallet_integration.mjs`
- `verify_wallet_security.mjs`
- `verify_equipment_readonly.mjs`
- `verify_missions_core.mjs`
- `verify_mission_authority.mjs`
- `verify_remote_config.mjs`
- `verify_equipment_mutations.mjs`
- `verify_reward_service.mjs`
- `verify_social_chat.mjs`
- `verify_mail_service.mjs`

## Global wallet checks

`npm run verify:wallet` asserts one CurrencyManager autoload; normalized Fuel,
Stardust, and Nova state; manager-to-CurrencyManager routing; wallet subscriptions
for active-player currency surfaces; no UI-authored balance mutation; logout
clearing; reconnect reconciliation; Node operation receipts; and mission/Fuel/Nova
idempotency markers. It returns non-zero on any failure and is also discovered by
`npm run verify:backend`.

## Phase 10 checks

`verify_remote_config.mjs` asserts `config_get`, absence of mutation RPCs, client-visible filtering, defaults (`board_size=3`, cooldown `15`), `RemoteConfigManager` autoload, and cache gitignore.

## Phase 11 checks

`verify_equipment_mutations.mjs` asserts equip/unequip registration, ownership, slot
allowlist, request_id idempotency, swap preservation, Nakama EquipmentManager APIs,
and the documented AuthManager Node-Item compatibility path used by Hero/Inventory.

## Phase 12 checks

`verify_reward_service.mjs` asserts no public grant RPCs, trusted wallet-bridge
integration, premium blocked, duplicate/conflict transaction handling, mission
wiring, and gated `dev_reward_test` soft-currency behavior.

## Phase 13 checks

`verify_loot_service.mjs` asserts loot module + table data, no generic loot RPCs, RewardService grant path, inventory internal grant, deterministic transaction behavior, client outcome-field rejection, inventory-full safety, and gated `dev_loot_test`.

## Phase 14 checks

`verify_mission_rewards.mjs` asserts `mission_claim`, snapshot rewards, RewardService/LootService wiring, single-grant idempotency, no loot reroll, client reward rejection, and XP unsupported handling.

## Phase 15 checks

`verify_shop_service.mjs` asserts shop RPCs, server prices/sale values, buy/sell/refresh idempotency, capacity-before-charge, equipped sell rejection, Nakama ShopManager, and no premium shop currency.

## Phase 17 checks

`verify_combat_engine.mjs` asserts `combat.lua` / `combat_simulate`, rejection of client damage/RNG/stats, server-side equipment load, deterministic replay, opponent template allowlist, loop/draw prevention, and healing/crit/dodge/tank template paths.

## Phase 18 checks

`verify_arena_service.mjs` asserts Arena RPCs, CombatService wiring, server rating + lower-rank penalty, idempotent challenges, anti-farm/cooldown, rankings bounds, ArenaManager Nakama path, and disabled local combat settlement.

## Phase 19 checks

`verify_social_chat.mjs` asserts social/chat modules and RPCs, self-friend/block rejection, DM block enforcement, rate/history bounds, deterministic conversation IDs, RealtimeManager single Nakama socket, and manager wiring.

## Phase 20 checks

`verify_mail_service.mjs` asserts `mail.lua` RPCs, no public system/attach RPCs, ownership/sender authority, player text-only, block checks, pagination bounds, RewardService claims, MailManager autoload, and gated `dev_mail_create_fixture`.

## Wallet repair checks

`verify_wallet_integration.mjs` checks the normalized Character authority, manager
and UI subscriptions, logout clearing, request IDs, realtime reconciliation, Node
idempotency schema, trusted bridge integration, and architecture docs.

- `npm --prefix server run test:wallet-bridge` covers secret rejection, ownership,
  insufficient funds, exact-once replay/conflicts, compensation, non-negative
  balances, and hundredth-unit Fuel.
- Godot `res://Scripts/test_wallet_client.tscn` covers three-currency hydration,
  fractional Fuel formatting, stale revision rejection, logout clearing, and
  account/character isolation.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Phase script fails (404 RPC) | `docker compose restart nakama` after module changes |
| Shared lib require fails | Confirm `modules/lib/*.lua` mounted via compose `./:/nakama/data` |
| Docker skipped | Start compose if you need runtime log checks; static checks still run |
| Intentional fail test | Break a verify script, confirm non-zero exit, restore |

## Headless Godot

If Godot headless is not on PATH, Godot parse is limited to `project.godot` text checks. Report that limitation rather than inventing a binary path.
