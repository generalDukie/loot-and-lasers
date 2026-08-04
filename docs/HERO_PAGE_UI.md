# Hero Page UI

Godot character sheet (`stats.tscn` / `stats.gd`), opened from Operative Console and side-nav **Hero**.

## Responsibilities

| Area | Owner |
|------|--------|
| Layout / doll / backpack / attrs | `Scenes/UI/stats.gd` |
| Stim / mount rail | `Scripts/UI/ActiveEffectsBar.gd` (`side_sections`) |
| Portrait draw | `AvatarRenderer` / `AvatarPortrait` (presentation only) |
| Console portrait ↔ class icon | `Scenes/Main/game_shell.gd` |
| Equip / unequip (Hero-listed Node items) | `AuthManager.equip_item` / `unequip_item` → Node Item PATCH |
| Use stim | `AuthManager.use_consumable` → Node `UseConsumable` |
| Nakama equipment RPCs | `EquipmentManager` (shop-migrated / Phase 11; not used by Hero list path) |
| Derived combat math | `StatsRules` / `MissionCombat` (local) |

## Backpack layout

- Capacity display remains `mini(10, bag_cap)` — visual only; backend caps unchanged.
- Slot height stretches with pane size (`48–96px`), 5 columns.
- Title is `BACKPACK` (no emoji).

## Item inspect popup

- One `_bag_inspect` panel at a time.
- Hide delay `0.22s`; cancelled while pointer is over source slot or popup (14px pad).
- Sized to content (min width ~168, max ~280).
- Positioned beside the source slot (prefer right, flip left / above / below); avoids covering the source when space allows.

## Authoritative flows

```
UI → AuthManager.equip_item / unequip_item / use_consumable
   → Node :8787 (Item PATCH or UseConsumable)
   → StatsManager.refresh()
   → Hero _populate / _refresh_values
```

Do not flip `is_equipped` or consume items in the UI before the manager response.

## Drag-and-drop routing

Drop on Hero doll / portrait area (`_doll_wrap`):

| Payload | Action |
|---------|--------|
| Bag consumable | `_on_use_stim` → `AuthManager.use_consumable` |
| Bag equippable (`item.type` slot) | `_on_equip` → `AuthManager.equip_item` |
| Other | Reject with status message |

Direct drop onto an equip chip still requires matching `type`. Consumables are valid drag sources. Double-click bag slot: use if consumable, else equip.

## Attribute tooltips

`StatsRules.attribute_tooltip(stat, character, equipped)` — current derived contributions (crit %, HP, dodge, tech resist, damage, Might Resistance). Updated on `_refresh_values`.

## Might Resistance

Player-facing combat label for derived `armor` only. Internal keys (`armor`, formulas, RPCs, Item `type: armor` chest slot) unchanged. Equipment slot label remains **Armor** (chest piece).

## Animated character

Center doll cell uses `AvatarPortrait` idle breathe/blink. Not a second authoritative Character node. Console hides the full portrait while Hero is open and shows the class emoji from `GameData.class_info`; portrait restores on any other page.

## Dual-stack notes

- Hero inventory **render** SoT: Node `Item` rows via `StatsManager`.
- Hero equip/unequip/use: Node paths above.
- `EquipmentManager` / Nakama `equipment_*` remain for migrated shop inventory; do not point Hero bag IDs at them until Item↔Nakama instance sync exists.

## Known limitations

- No dedicated FailMission-style stim rollback beyond server errors.
- Class “icon” in console is the class emoji glyph (no separate SVG asset).
- Secondary `inventory.gd` list page shares Node equip/use paths but not the Hero inspect popup UX.
