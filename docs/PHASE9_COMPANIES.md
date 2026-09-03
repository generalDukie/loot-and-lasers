# Phase 9 — Companies, Shipments, Reputation, Commissions, Corporate Offices

Live authority is this document plus the Phase 9 prompt rules, locked Phase 0–8 production math, and `docs/PRODUCTION_FORMULA_REGISTRY.md` (PM-COMPANY-SHIPMENT / REP / TOKEN / COMMISSION). Historical Ship Hangar, placeholder Company1–4 names, automatic Shipments, and item locking are not gameplay authority.

Node Character / Item / wallet_operations are the only gameplay authority. Nakama stays authentication-only. Godot Corporate Offices is presentation for reputation, tokens, overflow, and Commissions. Return Shipments are initiated from the Black Market Shipping Dock.

Phase 10 economy reconciliation and Phase 11 production stress were not started.

## Player-visible rules

Four Companies manufacture Gear:

| Company | Internal ID | Public short / prefix | Slots | Epic-token levels |
| --- | --- | --- | --- | --- |
| Crown & Carapace | CNC | C&C | Helmet, Armor, Legs, Ship Module | 1, 5, 9… |
| Ballistics & Jewelry Services | BJS | BJ Services | Helmet, Weapon, Neck, Accessory | 2, 6, 10… |
| Duct-Tape Dynamics | DTD | DTD / Duct Tape | Legs, Boots, Accessory, Ship Module | 3, 7, 11… |
| GORPTEK | GORP | GORP / GORPTEK | Armor, Boots, Weapon, Neck | 4, 8, 12… |

Every company manufactures exactly four slots. Every slot has exactly two legal manufacturers. Each company has exactly one premium slot (Weapon or Ship Module). Ordinary sources pick the slot first, then choose between the two legal Companies with an even server roll. Commission Gear uses the token's Company. Manufacturer, origin, and Shipment eligibility are permanent. TTT and RDR are retired and have no live aliases.

Shipment eligibility defaults true for generated Gear. Market and Contraband Gear are permanently ineligible and cannot become eligible later. Commission Gear is eligible.

The Black Market Shipping Dock is where players send return Shipments. Filling all five dock slots with the same live Company's unequipped, shipment-eligible Gear replaces the normal sale with a Deliver Shipment action. Fewer than five items, mixed manufacturers, and same-company ineligible crates remain ordinary sales. Market and Contraband Gear stay permanently ineligible.

Each preview request is bound to the dock generation that started it. Replacing shipment A with shipment B discards A's response and automatically previews B when B still qualifies. A temporary preview failure does not sell the crate; the player uses RETRY PREVIEW. Overflow still blocks delivery with no sale fallback. Confirmation remains mandatory. After delivery the player stays on the Black Market. The success line uses the confirmation payload, including the actual company level reached when a level was awarded.

Corporate Offices (Explore side nav, formerly the Ship Coming Soon entry) is where players:

1. Review company reputation, level, and next token.
2. Redeem a waiting Rare or Epic Commission token into one backpack Gear item.
3. Resolve token overflow if a level-up arrives while a token is already waiting.

There is no Shipment cooldown or daily limit. Equipped Gear cannot be shipped. Item locking/favoriting is removed; leftover stored lock flags do nothing.

## Shipment math

`ShipmentBaseValue = sum of the five items' current persisted sell_value`

`ShipmentPayout = roundHalfUp(ShipmentBaseValue × 1.10)`

A successful Shipment atomically consumes the five items, credits the payout, adds 100 reputation, increments that Company's shipment count, applies any level-up, and records token/overflow state. Duplicate `request_id` replays the original result.

Company level = `floor(CompanyReputation / 1500)`. New characters start at 0. Shipments are currently the only reputation source.

## Tokens

Every Company level awards one Company-specific Commission token (staggered 3 Rare / 1 Epic; CNC Epic on levels 1, 5, 9…; BJS 2, 6, 10…; DTD 3, 7, 11…; GORP 4, 8, 12…). One waiting token per Company. Tokens do not use backpack space.

If a waiting token exists when another is earned, the Shipment still settles and the new token is stored as overflow. The player must later spend one of the two by creating a Commission. Same-Company Shipments are blocked until then. Other Companies remain available. Overflow persists across disconnects.

## Commissions

Backpack space is checked before any token is consumed or randomness is rolled. A full backpack rejects the request and keeps tokens/overflow.

Rare: player chooses a legal slot, three distinct stats, and whole percents 20–60 totaling 100%. Server allocates the rolled Rare budget with largest remainder in canonical stat order.

Epic: player chooses only a legal slot. Stats are Class Primary, Vitality, and Luck with 30/30/20 floors plus a server-rolled remainder among those three. Off-stats are zero.

The delivered item is unequipped, Shipment-eligible, uses normal quality-based sell value, and has origin `rare_commission` or `epic_commission`.

## Feature flag

`shipments_enabled` remains in remote-config / admin flag storage so the flag architecture is intact. **Phase 9 production default is enabled.** Corporate Offices RPCs do not consult this flag. It is informational, not a gameplay gate.

## Stale-path disposition

| Path | Disposition |
| --- | --- |
| Placeholder Company1–4 and retired TTT/RDR | Replaced by CNC/BJS/DTD/GORP in `productionMath/constants.js`. No live aliases. |
| Allow-list shipment eligibility | Replaced by Market/Contraband deny-list |
| Item `locked` / `favorited` | Removed from live sell/dissolve/update/UI. Stored values ignored |
| Ship Hangar Coming Soon nav | Replaced by Corporate Offices. `ship.gd` / ShipManager remain dormant behind `FEATURE_SHIP_HANGAR` |
| Automatic Shipment / auto-spend / auto-equip Commission | Not implemented. Manual only |
| Old 10-Shipment token cadence | Not used. Tokens come from Company levels |
| `shipments_enabled` default false | Default true; not a live gate |

## Tests

`npm run test:phase9`
