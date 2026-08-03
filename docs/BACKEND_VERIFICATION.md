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

## Phase scripts discovered

- `verify_wallet_security.mjs`
- `verify_equipment_readonly.mjs`
- `verify_missions_core.mjs`
- `verify_mission_authority.mjs`
- `verify_remote_config.mjs`
- `verify_equipment_mutations.mjs`
- `verify_reward_service.mjs`

## Phase 10 checks

`verify_remote_config.mjs` asserts `config_get`, absence of mutation RPCs, client-visible filtering, defaults (`board_size=3`, cooldown `15`), `RemoteConfigManager` autoload, and cache gitignore.

## Phase 11 checks

`verify_equipment_mutations.mjs` asserts equip/unequip registration, ownership, slot allowlist, request_id idempotency, swap preservation, legacy AuthManager path disabled, and UI routing via EquipmentManager.

## Phase 12 checks

`verify_reward_service.mjs` asserts no public grant RPCs, wallet integration, premium blocked, duplicate/conflict transaction handling, missions unwired, and gated `dev_reward_test` soft-currency behavior.

## Phase 13 checks

`verify_loot_service.mjs` asserts loot module + table data, no generic loot RPCs, RewardService grant path, inventory internal grant, deterministic transaction behavior, client outcome-field rejection, inventory-full safety, missions unwired, and gated `dev_loot_test`.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Phase script fails (404 RPC) | `docker compose restart nakama` after module changes |
| Shared lib require fails | Confirm `modules/lib/*.lua` mounted via compose `./:/nakama/data` |
| Docker skipped | Start compose if you need runtime log checks; static checks still run |
| Intentional fail test | Break a verify script, confirm non-zero exit, restore |

## Headless Godot

If Godot headless is not on PATH, Godot parse is limited to `project.godot` text checks. Report that limitation rather than inventing a binary path.
