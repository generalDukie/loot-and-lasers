# Phase 9 caller / authority migration map

Live authority is `docs/PHASE9_COMPANIES.md` plus `docs/PRODUCTION_FORMULA_REGISTRY.md` (PM-COMPANY-SHIPMENT / REP / TOKEN / COMMISSION). Do not infer live rules from Ship Hangar, placeholder Company names, or item-lock flags.

## Live production

| Symbol / path | Role |
| --- | --- |
| `src/lib/productionMath/constants.js` | Company IDs, slot matrix, Shipment/token/Commission constants |
| `src/lib/productionMath/companies.js` | Manufacturer roll, payout, reputation/level, token rotation, Rare/Epic allocation |
| `src/lib/productionMath/gear.js` `defaultShipmentEligible` | Deny-list eligibility (Market/Contraband false; else true) |
| `src/lib/itemGeneration.js` `GenerateGearItem` | Always stamps manufacturer, origin, eligibility; optional commission allocation |
| `server/src/shared/companyService.js` | Preview/settle Shipment, redeem Commission, overflow |
| `server/src/functions/companies.js` | `GetCompanyStatus`, `PreviewShipment`, `ConfirmShipment`, `RedeemCommission` |
| `server/src/entityAccess.js` `company_state` | Character-owned company JSON; Item lock updates rejected |
| Godot `CompanyManager.gd` / `corporate_offices.gd` | Presentation only. Sends item IDs, token id, slot, Rare weights, `request_id` |

## Client must not submit

Item Company, Shipment eligibility, sell values, payout, reputation, Company level, token rarity, Epic stat rolls, final stats, budget, pricing quality, or backpack capacity.

## Stale / dormant

| Path | Role |
| --- | --- |
| `loot&lasers/Scenes/UI/ship.gd` | Dormant hangar UI. Not in live nav |
| `ShipManager.gd` / `FEATURE_SHIP_HANGAR` | Still Coming Soon for hangar RPCs only |
| `modules/config.lua` `shipments_enabled` | Informational default true. Not a gameplay gate |
| Item `locked` | Ignored. PATCH `{locked:true}` returns `ITEM_LOCK_REMOVED` |

## RPCs

All four handlers are on `ECONOMY_HANDLERS` (Node invoke). Duplicate `request_id` replays `wallet_operations` without reroll or re-consume.
