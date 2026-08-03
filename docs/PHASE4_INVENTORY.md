# Phase 4 — Read-only inventory service

Nakama-backed **read-only** inventory snapshot. No grants, equip, buy/sell, dissolve, or loot writes on Nakama.

## Ownership decision

**Character-level** — matches the existing Node architecture where every `Item` has `character_id`.

Validation (Phase 4):
- Authenticated account = Nakama `context.user_id` (never from client).
- Requested `character_id` must equal the Nakama profile `selected_character_id`.
- Arbitrary character ids are rejected (403). Full Node ownership binding is deferred.

## Architecture

```
Inventory UI
  → InventoryManager.list_character_items / load_inventory
  → NakamaManager.invoke_rpc("inventory_get")
  → modules/inventory.lua
  → storage collection inventories / key <character_id>
  → { success, data, error, status_code }
  → inventory_changed / inventory_error
```

Live gear rendering still uses Node `AuthManager.list_items` inside `list_character_items` until a later write/migration phase. Nakama missing records return an **empty** inventory (no auto-copy from Node).

## Record shape

```json
{
  "inventory_version": 1,
  "owner_type": "character",
  "owner_id": "<character_id>",
  "slots": [
    {
      "instance_id": "",
      "item_id": "",
      "quantity": 1,
      "slot_index": 0,
      "metadata": {}
    }
  ],
  "updated_at": 0
}
```

Static item definitions stay in game catalogs / Node Item documents — not duplicated into each slot.

## RPC

| RPC | Writes? | Behavior |
|-----|---------|----------|
| `inventory_get` | No | Resolve character → read storage or empty envelope |

## Non-goals

Item grants/removal, equip/unequip, buy/sell/dismantle, loot, currency, premium, mission rewards, admin tools, Phase 5 currency.
