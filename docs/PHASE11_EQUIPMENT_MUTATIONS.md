# Phase 11 — Equipment mutations

Server-authoritative equip / unequip. No item grants, deletes, loot, shops, or crafting.

## Public RPCs

| RPC | Purpose |
|-----|---------|
| `equipment_get` | Read equipment slots |
| `equipment_equip` | Move inventory instance → equipment slot |
| `equipment_unequip` | Move equipped piece → inventory bag |

Payloads:

```json
// equipment_equip
{ "character_id": "", "item_instance_id": "", "target_slot": "", "request_id": "" }

// equipment_unequip
{ "character_id": "", "target_slot": "", "request_id": "" }
```

Client must not submit stats, rarity, ownership, or resulting bags.

## Consistency model (representation B)

- Equipped items live in `equipment/<character_id>.slots[slot]`
- Bag items live in `inventories/<character_id>.slots[]`
- Equip **removes** the instance from inventory and places it in the slot
- Swap: previous slot occupant returns to inventory
- Unequip requires a free bag slot (`BAG_CAP_DEFAULT = 10` on server)

Category rule: `metadata.type` must equal `target_slot` (1:1 allowlist).

## Idempotency

Collection `equipment_mutations` / key = `request_id` (account-owned).
Duplicate `request_id` returns the prior result (`replayed: true`) without re-applying.

## Storage writes

Writes use OCC versions with retries. Equipment and inventory are **two separate** Nakama writes — not fully atomic. On conflict the mutation is recomputed and retried. Partial failure (equipment written, inventory failed) is mitigated by retries; document recovery as re-run with a new request only if the prior request_id was never recorded.

## Slot allowlist

```
weapon, helmet, armor, legs, boots, neck, accessory, ship_module
```
Each slot accepts only its own type. No two-hand / offhand rules.

## Godot

- `EquipmentManager.equip_item` / `unequip_item` / `equip_from_bag` / `unequip_by_instance`
- Signals: `equipment_loaded`, `item_equipped`, `item_unequipped`, `equipment_changed`, `equipment_error`, `loading_changed`, `mutation_state_changed`
- Hero / Inventory UI call EquipmentManager (not AuthManager)
- `AuthManager.equip_item` / `unequip_item` return legacy-disabled errors

## Legacy path

Node `Item.is_equipped` mutations via AuthManager are **disabled** for Godot.
Live Hero/Inventory equip now requires the item instance to exist in **Nakama inventory** with `metadata.type`. Items that exist only on the Node API will fail equip until inventory seeding/migration.

## Character stats

Local `StatsManager.refresh()` may run after mutation for presentation.
Server-authoritative derived stats remain future work.

## Verification

```bash
npm run verify:backend
# includes scripts/verify_equipment_mutations.mjs
```

## Rollback

1. Revert `modules/equipment.lua` mutation RPCs / unregister equip+unequip
2. Restore AuthManager Node equip path if needed
3. Restart Nakama
