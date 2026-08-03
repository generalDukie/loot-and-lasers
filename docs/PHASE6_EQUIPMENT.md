# Phase 6 — Read-only equipment service

Nakama-backed **read-only** equipment snapshot. No equip, unequip, grants, inventory writes, shops, crafting, missions, arena, rewards, or admin tools.

## Audit summary

| Slot ID | UI label | Required `item.type` |
|---------|----------|----------------------|
| `weapon` | Weapon | `weapon` |
| `helmet` | Helmet | `helmet` |
| `armor` | Armor | `armor` |
| `legs` | Legs | `legs` |
| `boots` | Boots | `boots` |
| `neck` | Neck | `neck` |
| `accessory` | Ring | `accessory` |
| `ship_module` | Ship Module | `ship_module` |

**Source of truth (live):** Node `Item.is_equipped` + secondary `Character.equipped_items` map. UI filters Item rows; the map is a slot→id index.

**Godot today:** `AuthManager.equip_item` / `unequip_item`, Hero (`stats.gd`) + Inventory UI, `StatsManager.load_equipped`. No prior `EquipmentManager`.

**Nakama inventory (Phase 4):** bag snapshot only — separate from equipment.

## Safe migration plan

1. This phase: read-only `equipment_get`; missing → empty null slots; **no** copy from Node.
2. Keep Node as live SoT for Hero/Inventory rendering.
3. Later write phase (not now): dual-write then cut over; still no bag mutation from equipment RPCs alone.

## Architecture

```
Hero UI (unchanged rendering)
  → StatsManager.load_equipped (Node Items)
  → EquipmentManager.load_equipment (best-effort Nakama snapshot)
  → NakamaManager.invoke_rpc("equipment_get")
  → modules/equipment.lua
  → storage collection equipment / key <character_id>
  → equipment_changed / equipment_error
```

## Ownership

- Authenticated account = Nakama `context.user_id` (never from client).
- Requested `character_id` must equal profile `selected_character_id`.
- Arbitrary character ids → 403.
- Client `account_id` / `user_id` / `owner_id` → 400.

## Record shape

```json
{
  "equipment_version": 1,
  "owner_type": "character",
  "owner_id": "<character_id>",
  "slots": {
    "weapon": null,
    "helmet": null,
    "armor": null,
    "legs": null,
    "boots": null,
    "neck": null,
    "accessory": null,
    "ship_module": null
  },
  "updated_at": 0
}
```

Occupied slot (when written by a future trusted writer):

```json
{
  "instance_id": "<item instance id>",
  "item_id": "<catalog / base id>",
  "metadata": {}
}
```

Malformed / unknown slots → 422 (fail safely). Inventory collection is never touched.

## RPC

| RPC | Writes? | Behavior |
|-----|---------|----------|
| `equipment_get` | No | Resolve character → read storage or empty envelope |

## Non-goals

Equip/unequip, item grants, inventory writes, shops, crafting, missions, arena, rewards, admin tools, Phase 7+.
