# Server-Authoritative Rewards

Loot & Lasers grants currency, XP, items, and unlocks **only** through trusted backend services. The client may request an action (`ClaimMission`, `ClaimDailyLogin`, …) but must never submit the final reward contents.

## Why

Client-calculated rewards can be forged via request bodies, DevTools, or modified clients. The server independently decides eligibility, reward tables, quantities, random rolls, delivery destination, and claim uniqueness.

## Architecture

| Piece | Location |
|--------|----------|
| Sources / forbidden fields | `server/src/rewards/sources.js` |
| Definitions + versions | `server/src/rewards/definitions.js` |
| Claim ledger + pending loot | `server/src/rewards/store.js` |
| Orchestration | `server/src/rewards/service.js` |
| Overflow accept/dissolve | `server/src/rewards/pending.js` |
| HTTP admin / player routes | `server/src/routes/rewards.js` |
| Applicator (currency/XP/items) | `server/src/shared/rewards.js` (`applyCharacterRewards`) |

All production reward sources must be registered in `RewardSources`. Unregistered strings fail closed.

## Client may submit

- Action identifiers: `mission_id`, `mail_id`, `code`, `character` context via auth
- Optional `idempotencyKey` / `correlationId`
- For casino: named `game` + `bet` (+ `choice` for dice) — **not** `payout_mult`
- For pending loot: `pending_loot_id` only

## Client must not submit (ignored or rejected)

Currency amounts, XP, item lists, rarity, seeds, `nexus_bonus`, `species_id`, `reward_stardust`, `payout_mult`, reward-definition version, completion booleans as authority.

Suspicious fields are audited as `suspicious_client_payload`.

## Claim lifecycle

`eligible → generated → delivering → completed`

Failed delivery → `failed_retryable` (persisted `generated_payload` kept; admin retry never rerolls).

Domain uniqueness uses `claim_key` (e.g. `mission:{id}`, `daily:{characterId}:{period}`, `mail:{id}`, `promo:{account}:{code}`). A second idempotency key cannot claim the same domain key twice.

## Versioning

- **Missions**: snapshot `reward_definition_key/version` + loot rolls on `LaunchMission` (`resolvePolicy: start`). Claim uses the snapshotted version.
- **Daily / mail / promo**: resolve definition at claim time.

## Overflow policy

When the bag is full, item templates are stored in `reward_pending_loot`. The player accepts or dissolves by **server id**. Client-forged item bodies are rejected.

## Admin

- UI: Admin → **Rewards**
- `GET /api/rewards/admin/search`
- `GET /api/rewards/admin/:id`
- `POST /api/rewards/admin/grant` (reason + idempotency required)
- `POST /api/rewards/admin/:id/retry-delivery` (uses persisted payload only)

## Adding a reward source

1. Add constant to `RewardSources`.
2. Register a definition in `definitions.js`.
3. Call `executeRewardClaim` inside a `withTransactionAsync` block with `generate` + `deliver`.
4. Never grant currency/items outside that path (or `applyCharacterRewards` called only from `deliver`).

## Tests

```bash
npm run test:rewards
```

## Migrations

Schema is created on import of `server/src/rewards/store.js` (same pattern as entitlements/schedules). No separate migration CLI step.

## Rollout notes

Migrated first: mission claim, daily login, mail attachments, promo codes, pending loot, casino legacy payout path (removed), guild war client stardust (ignored).

Still using older direct patches (follow-up): arena/dungeon finish, shop purchase internals, weekly quests, mining collect, `AdminModeration.give_item` / `adjust_currency`. Prefer routing those through `executeRewardClaim` next.
