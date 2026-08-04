# Phase 20 — Backend mail system

Server-authoritative in-game mail for Loot & Lasers.

Wallet repair update: currency attachments remain server-authored and idempotent,
but Stardust delivery now targets the selected Node Character through the private
wallet bridge. The claim response includes the normalized wallet for immediate UI
fan-out.

## Ownership decision

**Mail is account-level.** Inbox ownership is `recipient_user_id` (Nakama session user).

- Optional `target_character_id` applies when claiming **item** attachments (must be the account’s selected character).
- System mail may display against the selected character in UI only; storage remains account-owned.
- A player cannot read, delete, mark, or claim another user’s mail.
- Existing mail remains visible after a block; **new** player-text mail is rejected when either side has blocked the other.

## Mail types

| Type | Who creates | Attachments | Notes |
|------|-------------|-------------|-------|
| `player_text` | Authenticated players via `mail_send_player_text` | **None** | Text only |
| `system` | Internal `create_system_mail` | Optional trusted | No public create RPC |
| `reward` | Internal trusted callers | Soft currency / items | Via RewardService on claim |
| `moderation` | Internal | Typically none | No player reply tooling |
| `announcement` | Internal | Text only this phase | |

Players cannot create system/reward/moderation/announcement mail or forge attachments.

## Public RPCs

- `mail_get_inbox` — paginated summaries (`limit`, `cursor`, `folder`, filters)
- `mail_get_message` — full client-safe message (ownership enforced)
- `mail_mark_read` / `mail_mark_unread` — idempotent; unread index updated
- `mail_delete` — soft delete/archive; `restore: true` undeletes
- `mail_claim_attachments` — requires `request_id`; RewardService apply
- `mail_send_player_text` — requires `request_id`; server sender identity
- `mail_get_unread_count`

**Not registered:** `mail_send_system`, `mail_attach_*`, admin/force/mass send RPCs.

Gated dev helper: `dev_mail_create_fixture` (`LOOT_DEV_MAIL_TEST=1`) — fixed fixtures only (`system_text`, `soft_currency`, `item_attachment`).

## Schema (v1)

See implementation in `modules/mail.lua`. Summaries omit full body/attachment internals; detail returns safe attachment descriptors.

## Delete / archive policy

- Player delete is **soft** (`deleted=true`, `mailbox=deleted`, `archived=true`).
- Mail with **unclaimed attachments cannot be deleted** (422).
- Canonical claim transactions remain in `mail_transactions` / `reward_transactions`.

## Attachment claims

- **All-or-nothing** via RewardService (`source_type: mail`, `transaction_id: mail_reward:<mail_id>`).
- Client cannot submit amounts, item IDs, or claim status.
- Inventory full → claim fails; attachments stay unclaimed.
- Duplicate claims return `already_claimed` / original receipt — no double grant.

## Expiration

RemoteConfig retention days (long defaults for development). Expired mail rejects claims (`410`). Phase 20 does **not** auto-destroy unclaimed rewards; future cleanup job TBD.

## Realtime

`nk.notification_send` code `20` (`new_mail`) with client-safe summary + unread count.  
`RealtimeManager` owns the single Nakama socket and forwards `nakama_notification` to `MailManager`. Poll refresh remains as reconnect backup.

## Feature flags

`mail_enabled`, `player_mail_enabled`, `system_mail_enabled`, `mail_attachments_enabled`, `mail_claim_enabled` (default on in development).

## RemoteConfig `mail` namespace

Page sizes, subject/body max lengths, rate/daily limits, retention days, `attachments_claim_all_or_nothing`.

## Storage

| Collection | Key | Owner | Notes |
|------------|-----|-------|-------|
| `mail_messages` | `mail_id` | recipient | Inbox/system/deleted |
| `mail_sent` | `mail_id` | sender | Sent copies |
| `mail_indexes` | `meta` | account | `unread_count` |
| `mail_transactions` | `request_id` | account | Send/claim idempotency |
| `mail_rate_limits` | `send` | account | Player send limits |

Permissions: read `1`, write `0` (RPC only). Clients never write raw mail documents.

## Godot

`MailManager` autoload — inbox state, signals, claim wallet/inventory refresh.  
`mail.gd` uses MailManager (not direct RPCs). Guild invite mail may still touch Node via SocialManager handlers.

## Privacy / rate limits

Block checks both directions. Burst + daily send limits. Basic content filter (not comprehensive). No email addresses exposed.

## Known limitations

- Storage list filtering is post-fetch (bounded pages).
- Cross-object writes are not fully atomic; claim intent + RewardService status recover duplicates.
- Guild mail / marketplace delivery / admin dashboard / mass campaigns **not** implemented.
- Node legacy Mail entities are superseded for player/system mail paths; guild invite Node mail may still exist until guild migration.

## Verification

`scripts/verify_mail_service.mjs` (included in `npm run verify:backend`).
