# Phase 3 — Player profile service

Slim Nakama-backed account profile. Does **not** migrate inventory, currency, missions, arena, guilds, chat, mail, shops, combat, admin, or premium currency.

## Architecture

```
Profile UI / AuthManager
  → ProfileManager
  → NakamaManager.invoke_rpc / call_authenticated_rpc
  → Nakama RPCs (modules/profile.lua)
  → storage collection player_profiles / key profile
  → { success, data, error, status_code }
  → ProfileManager.profile_changed
```

## DTO

| Field | Owner |
|-------|--------|
| `account_id` | Nakama `context.user_id` (forced; client value ignored) |
| `display_name` | Player (validated 2–24 chars, no digits) |
| `selected_character_id` | Player (string ref; Node character id) |
| `appearance` | Player (cosmetic keys only) |
| `avatar_portrait` | Player (optional string) |
| `created_at` / `updated_at` | Server |

Appearance allowlist: `skin_color`, `eye_style`, `ears`, `mouth`, `nose`, `eyebrows`, `marking`.

## RPCs

- `profile_get` — idempotent load-or-create (one object per user)
- `profile_update` — reject unknown fields; write only the session user’s object

## Godot

- Autoload: `ProfileManager`
- Hooks: `AuthManager.ensure_nakama_session` → `ensure_profile`; `select_character` syncs `selected_character_id` best-effort
- Node JWT auth, character CRUD, rename/legacy/slots stay on `GameApiClient` / `AccountManager`

## Non-goals

Character economy documents, inventory, stats/XP, missions, arena, entitlements, bio/titles, legacy surname writes.
