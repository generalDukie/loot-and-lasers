# Phase 14 — Mission rewards integration

Connects authoritative missions to **RewardService** and **LootService** so completed missions can be claimed exactly once.

## Flow

```
Cantina / mission_run
→ MissionManager.claim_mission()
→ mission_claim RPC
→ validate ownership + complete status + request_id
→ complete → reward_pending
→ LootService.generate_loot_bundle (deterministic)
→ RewardService.apply_reward_bundle (stardust + items)
→ claimed
→ receipt returned
```

## Public RPC

| RPC | Payload |
|-----|---------|
| `mission_claim` | `{ character_id?, mission_id, request_id }` |
| `mission_skip` | `{ character_id?, mission_id, request_id }` — snap to `complete` |

Client must **not** submit amounts, currency, items, rarity, XP, loot table, seed, status, `won`, or skip cost.

Skip cost is computed client-side for display (`max(1, ceil(remaining_minutes * 5))`). Godot debits Character Nova via Node `DebitNovaCrystals`, then calls `mission_skip` to complete the timer. Wallet Nova debit lands when premium fully migrates.

## State transitions

| From | To | When |
|------|-----|------|
| `active` | `complete` | Server time ≥ `completes_at` |
| `complete` | `reward_pending` | Claim accepted |
| `reward_pending` | `claimed` | Reward apply succeeded |
| `reward_pending` / `reward_failed` | `reward_failed` | Apply failed (e.g. inventory full) |
| `reward_failed` | `claimed` | Successful retry with same `request_id` |
| `claimed` | *(cleared on next `mission_start`)* | New mission |

Forbidden: `claimed` → `complete`. Client cannot set status.

## Reward model (snapshot A)

At mission **generation**, `reward_reference` stores:

- `reward_formula_version`
- `character_level`, `fuel_cost` (from duration)
- `stardust_amount` (authoritative grant)
- `xp_amount` + `xp_grant: "unsupported"`
- `include_loot`, `loot_table_id` (`phase14_mission_basic`)
- efficiencies (legacy preview fields)

Claim uses the snapshot — later balance changes do not alter an already-generated mission.

Formula: `stardust = ROUND(SPF(level) * fuel)` with linear SPF anchors (approx of client PCHIP). Efficiency does **not** apply to stardust (matches Node).

## Integrations

| Service | Role |
|---------|------|
| RewardService | Apply currency + item instances; idempotent `mission_reward:<mission_id>` |
| LootService | Deterministic item roll; `mission_loot:<mission_id>`; no client seed |
| Wallet | Via RewardService only |
| Inventory | Via RewardService → `grant_item_instance` |
| Progression | **Not** available — XP in receipt as `status: "unsupported"` |

## Idempotency

- `request_id` required
- Stable reward/loot transaction IDs from `mission_id`
- Same `request_id` after `claimed` → replay receipt (no double grant, no loot reroll)
- Different `request_id` after claim → conflict

## Inventory full

Status `reward_failed` / `reward_status: inventory_full`. Generated loot receipt preserved. Retry with same `request_id` after freeing space (if reward tx not completed) — document compensation limits if currency partially applied (Phase 14 bundles apply currency then items in one RewardService call; mid-bundle failure → `compensation_required` on reward tx).

## Legacy paths

| Path | Status |
|------|--------|
| Godot local `rewards_deferred` dismiss | **Removed** — uses `mission_claim` |
| Node `ClaimMission` | Still exists for web; **not** used by Godot Cantina |
| Client wallet/inventory mutation on claim | **None** — managers reload after claim |

## Energy / fuel

Unchanged: Node fuel buy/sync; Nakama start still does **not** debit fuel. Claim does not deduct energy.

## Godot

`MissionManager.claim_mission` / `claim_mission_for` → `mission_claim`.
Signals: existing `claim_ready` plus `mission_claim_started`, `mission_claimed`, `mission_claim_failed`, `reward_received`.
`mission_run.gd` shows granted stardust; claim button disabled while busy; re-enabled on retryable failure.

## Verification

`scripts/verify_mission_rewards.mjs` via `npm run verify:backend`.

## Known limitations

- SPF uses linear interpolation, not full log-PCHIP
- XP not granted
- Fuel not debited on Nakama start
- Dual stack: web Node claim vs Godot Nakama claim
- No full multi-collection atomicity
- Combat win/lose not used (timer completion only)
