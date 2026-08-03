# Phase 15 — Secure shop service

Server-authoritative Black Market (`shop_id = general`) for offer load, buy, sell, and free refresh.

## Ownership

**Character-level** generated offers. Authenticated `user_id` from session; `character_id` must match `selected_character_id`.

## Public RPCs

| RPC | Purpose |
|-----|---------|
| `shop_get` | Load or generate shop; no wallet/inventory mutation |
| `shop_buy` | Debit stardust, grant persisted offer instance |
| `shop_sell` | Remove bag item, credit stardust (equipped rejected) |
| `shop_refresh` | Free cooldown refresh; new revision |

Payloads never accept client prices, sale values, seeds, or item outcomes. Mutations require `request_id`.

## Currencies

**Stardust only.** No Nova restock, no legendary Nova surcharge, no premium store in this phase. Fuel packs remain on Node `BuyFuel`.

## Offer generation

Server picks from `modules/data/item_definitions.lua`, rolls rarity weights, persists `item_instance_preview` (including `instance_id`) on the offer. Purchase grants that exact instance — no reroll at buy time.

## Pricing

- Buy: `ROUND(SPF(level) × 2 × rarity_markup × buy_mult)`
- Sell: `ROUND(SPF(item_level) × 2 × sale_mult × type_mult × sell_ratio)`

## Refresh

Free only. Cooldown from Remote Config `shops.refresh_cooldown_seconds` (default 60). First board is immediately refresh-eligible; after refresh, cooldown applies. Duplicate `request_id` returns same revision.

## Sell restrictions

- Equipped items: **rejected** (prefer over silent unequip)
- `metadata.locked == true`: rejected
- No bound/quest flags in catalog yet

## Inventory capacity

Buy checks bag capacity **before** debit. Full bag → reject, no charge.

## Storage

| Collection | Key | Notes |
|------------|-----|-------|
| `shops` | `<character_id>:<shop_id>` | Offers + revision |
| `shop_transactions` | `request_id` | Buy/sell/refresh receipts |

## Feature flags

`shops_enabled`, `shop_buy_enabled`, `shop_sell_enabled`, `shop_refresh_enabled` — default **on** when missing/`enabled=true`.

## Remote Config (`shops` namespace)

- `offer_count` (default 4, client-visible)
- `refresh_cooldown_seconds` (default 60, client-visible)
- `sell_value_ratio` / `buy_price_multiplier_percent` (server-only)

## Godot

`ShopManager` uses Nakama only for stalls. Legacy `EnsureShop` / `BuyShop*` / `RefreshShop` Node calls removed. Fuel still Node.

## Known limitations

- Not a full port of 8-slot Node Black Market / Hot Deal / haggle
- SPF linear approx (same as mission Phase 14)
- Dual stack: web may still use Node EnsureShop
- Partial failure: buy refunds on grant failure; sell credit failure → `compensation_required`
- No mail/pending-loot overflow on buy (reject if full)

## Verification

`scripts/verify_shop_service.mjs` via `npm run verify:backend`.
