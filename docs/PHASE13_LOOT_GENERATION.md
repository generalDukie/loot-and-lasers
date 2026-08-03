# Phase 13 — Server-authoritative loot generation

Loot engine only. Generates item instances on the server and grants them through **RewardService → inventory.grant_item_instance**.

Missions, arena, shipments, shops, bosses, daily login, events, mail, achievements, admin tools, and premium purchases are **not** connected.

## Responsibility

`modules/loot.lua` (LootService):

1. Load and validate server-side loot tables / item pools
2. Deterministic weighted selection (non-cryptographic LCG)
3. Resolve rarity and minimal item level from trusted config
4. Build a versioned item instance (server `instance_id`)
5. Persist a `loot_transactions` receipt
6. Hand off to `rewards.apply_reward_bundle` for the inventory grant

The normal Godot client must **not** choose table, item ID, rarity, item level, affixes, quantity, seed, or recipient.

## Trusted callers

| Caller | Status |
|--------|--------|
| `dev_loot_test` (flag-gated) | Authorized — fixed table allowlist |
| MissionService (`source_type` `mission`) | Authorized — Phase 14 |
| Arena / shipment / event / shop / daily / admin | **Not wired** |

Authorized loot `source_type` values: `loot_dev`, `system`.
Reward bundle `source_type` for grants: `loot` (authorized in RewardService).

## Item-definition source of truth

Phase 13 sample catalog: `modules/data/item_definitions.lua`.

| Field | Notes |
|-------|-------|
| Categories | `weapon`, `armor` (sample) |
| Rarities | `common`, `uncommon`, `rare`, `epic`, `legendary` (registry); **test tables only use common–rare** |
| IDs | Static `item_id` + server-generated `instance_id` |
| Affixes | Extension stub — `roll_affixes` returns `[]` (no affix DB in project) |
| Item level | Minimal clamp from pool `minimum_level` / `maximum_level` |

Live Node/`GameData` catalogs remain the product source for the web stack; Nakama catalog is intentionally small for this phase.

## Loot tables and pools

Location: `modules/data/loot_tables.lua` (server-only; clients cannot upload).

Development sample table: `phase13_basic_test`  
Pools: `phase13_basic_weapons`, `phase13_basic_armor`  
Item IDs: `laser_pistol`, `plasma_rifle`, `scrap_vest`

No premium currency. No legendary/unique unrestricted entries.

## RNG and determinism

- Algorithm: FNV-style hash → LCG (`state = state * 1664525 + 1013904223`)
- Seed inputs: transaction ID, source type/id, user ID, character ID, roll index, constant `:v1` salt
- **Not** cryptographically secure — suitable for gameplay replay and anti-duplication
- Client-supplied seeds are ignored / rejected on the dev RPC
- Raw seed material is never returned to clients

## Generated instance schema

```json
{
  "instance_version": 1,
  "instance_id": "loot-<uuid>",
  "item_id": "laser_pistol",
  "owner_user_id": "",
  "owner_character_id": "",
  "quantity": 1,
  "rarity": "common",
  "item_level": 1,
  "rolled_affixes": [],
  "source_type": "loot_dev",
  "source_id": "phase13_basic_test",
  "loot_transaction_id": "",
  "generated_at": "",
  "metadata": { "type": "weapon", "rarity": "common", "name": "...", "stats": {} }
}
```

## RewardService integration

```
LootService → generated item reward (with instance_id) → apply_reward_bundle → inventory.grant_item_instance
```

Loot does **not** write `inventories` directly.

## Transaction storage

| Field | Value |
|-------|--------|
| Collection | `loot_transactions` |
| Key | `transaction_id` |
| Owner | recipient `user_id` |
| Read / write | `1` / `0` |

Statuses: `pending`, `generated`, `granting`, `completed`, `failed`, `inventory_full`.

Idempotency: same `transaction_id` + same request hash → return prior receipt (no reroll). Conflicting reuse rejected.

## Inventory full

Bag capacity (`BAG_CAP_DEFAULT = 10`) is enforced in `inventory.grant_item_instance`.  
On full bag: loot status `inventory_full`, generated receipt preserved, **no** duplicate grant on retry.  
Pending-loot inbox / mail fallback is future work.

## Public RPCs

| RPC | Status |
|-----|--------|
| Generic `loot_generate` / `roll_loot` / etc. | **Not registered** |
| `dev_loot_test` | Temporary; `LOOT_DEV_LOOT_TEST=1` and **not** staging/production |

Payload: `{ "test_table_id": "phase13_basic_test", "transaction_id"?, "character_id"? }`  
Rejects `item_id`, `rarity`, `seed`, `affixes`, `item_level`, and client identity fields.

## Remote config

Phase 13 uses code defaults for tables/pools. Future balancing (weights, enablement) may move to server-only remote config — never expose full tables to clients.

## Known limitations

- Dual stack: Node still owns much live economy loot
- No affix rolls; metadata `stats` often empty
- Failed / `inventory_full` txs do not auto-retry grants (claim queue later)
- No atomic multi-collection transaction across loot + reward + inventory
- Missions claim via LootService (`phase14_mission_basic`) — see Phase 14

## Verification

`scripts/verify_loot_service.mjs` via `npm run verify:backend`.
