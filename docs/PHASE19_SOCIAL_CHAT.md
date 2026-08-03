# Phase 19 — Friends, presence, and chat foundation

Account-level social graph and chat on Nakama. Guild chat and mail were **not** implemented.

## Ownership decision

**Friendships, blocks, and DMs are account-level** (Nakama `user_id`).  
Display may show the selected character name from `player_profiles`.  
Blocking is account-wide. The client cannot impersonate another user.

Legacy Node friends were character-scoped; Godot friends UI now targets Nakama user IDs. Mail/guild remain on Node until a later phase.

## Audit summary

Prior stack: character-scoped Node entities + `SendMessage`, Node WebSocket in `RealtimeManager`, unused Nakama socket. No Lua social modules. Phase 19 adds Nakama friends/chat RPCs and makes RealtimeManager own the Nakama socket.

## Native Nakama APIs used

- `nk.friends_add` / `friends_delete` / `friends_block` / `friends_list`
- `nk.channel_id_build` / `channel_message_send` / `channel_messages_list`
- `nk.users_get_id`
- Client socket: `connect_async`, `join_chat_async`, `update_status_async`, channel message signals

## Relationship states

| State | Meaning |
|-------|---------|
| `none` | No relation |
| `outgoing_request` | Invite sent |
| `incoming_request` | Invite received |
| `friends` | Mutual friends |
| `blocked` | Local block (Nakama state 3) |

Transitions enforced server-side (self-friend/block rejected; block clears friendship; unblock does not restore friendship).

## Public RPCs

**Social:** `social_get_state`, `friend_request_send`, `friend_request_accept`, `friend_request_decline`, `friend_remove`, `user_block`, `user_unblock`, `block_list_get`

**Chat:** `chat_send_global`, `chat_send_dm`, `chat_get_global_history`, `chat_get_dm_history`, `chat_mark_read`

## Block policy

- Account-level via `nk.friends_block`
- Blocks DMs both directions and new friend requests
- Unblock → `none` (no auto-friend)
- Global chat: blocked users may still see each other’s global messages (presence/DM suppressed). Documented limitation.

## Presence

- Nakama status updates when socket connected (`PresenceManager.ping`)
- Legacy `PlayerPresence` entity heartbeat retained for character UI until fully cut over
- Subscribe/follow friends is future polish; reconnect restores socket via RealtimeManager

## Global chat

Room name `global` (channel type Room). Sender profile resolved server-side. History paginated (default 50, max 100).

## Direct messages

Conversation ID: `min(userA,userB) + ":" + max(userA,userB)` (deterministic).  
Channel via `channel_id_build`. Unread in `chat_read_state` per owner. History persisted by Nakama.

## Rate limits / filter

RemoteConfig `chat` / `social` namespaces. Burst per 10s, duplicate window, min interval. Basic denylist filter (not comprehensive; evasion possible).

## Socket ownership

`RealtimeManager` owns **one** Nakama socket through `NakamaManager.connect_socket()`. Connect is not started from `_process()`. Legacy Node WS may still run for mail/guild fan-out only.

## Feature flags

`friends_enabled`, `presence_enabled`, `global_chat_enabled`, `direct_messages_enabled`, `user_blocking_enabled` — default on in development.

## Storage

| Collection | Key | Owner |
|------------|-----|-------|
| `social_transactions` | request_id | account |
| `social_rate_limits` | friend_requests | account |
| `chat_transactions` | request_id | account |
| `chat_rate_limits` | global / dm | account |
| `chat_read_state` | conversation_id | account |

Friends/messages themselves use Nakama native stores.

## Godot

- `SocialManager` — Nakama friends/blocks; mail/guild still Node
- `ChatManager` — Nakama send/history; realtime via RealtimeManager
- `RealtimeManager` — Nakama socket + optional Node mail poll
- Logout/clear: `clear_account_social_cache` / `clear_account_chat_cache`

## User search

Deferred — not invented in this phase.

## Known limitations

- No guild chat / mail attachments / group chat
- Content filter is minimal
- Friend UI must use account user IDs (character search deferred)
- Dual presence (Nakama + Node entity) during transition
- Global chat does not hide messages from blocked peers
- Web client still on Node social until cutover

## Verification

`scripts/verify_social_chat.mjs` via `npm run verify:backend`.
