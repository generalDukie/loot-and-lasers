# Phase 7 — Mission service core

Authoritative Nakama mission **core** (Phase 7). Claim/rewards added in Phase 14 — see `docs/PHASE14_MISSION_REWARDS.md`.

## Audit summary

| Topic | Finding |
|-------|---------|
| Generation (pre-Phase 7) | Client-side (`MissionBoard.gd` / `gameData.js`); cached locally |
| Templates | Godot `MissionBoard.TEMPLATES` (10); web has a larger set |
| Duration | Level pools in `missionDuration.js` / `MissionBoard.DURATION_RULES` |
| Risk / difficulty | Legacy web fields; **not used** in live generation |
| Active mission SoT | Node `Mission` entity + `Character.active_mission_id` / `mission_end_time` |
| Completion | Timer (`end_time <= now`); claim is separate |
| Ownership | **Character-level** |
| Energy | Fuel (`fuel` / `max_fuel`) — unchanged this phase |

## Ownership decision

**Character-level.** Matches Node `Mission.character_id`. Nakama validates `character_id == profile.selected_character_id`. Account id always from `context.user_id`.

## Architecture

```
Cantina UI (live still Node for launch/claim/fuel)
  → MissionManager (Node path preserved)

Nakama core (Phase 7)
  → MissionManager.load_missions / refresh_missions / start_mission / refresh_mission_status
  → NakamaManager.invoke_rpc
  → modules/missions.lua
  → mission_boards / active_missions
  → MissionManager signals
```

Live Cantina **still uses** `ensure_board` / `launch_offer` / `claim_mission` on Node. Nakama APIs are independently testable and ready for a later cutover.

## RPCs

| RPC | Writes? | Behavior |
|-----|---------|----------|
| `missions_get` | Creates board if missing | Load board + active; may flip `active` → `complete` when timer elapsed |
| `missions_refresh` | Yes | Regenerate board; **15s cooldown**; blocked while mission `active` |
| `mission_start` | Yes | Start one available mission; server timestamps; reject duplicates |
| `mission_status` | Maybe | Report timer; transition `active` → `complete` when due; **no rewards** |

## Storage

| Collection | Key | Owner | Read | Write |
|------------|-----|-------|------|-------|
| `mission_boards` | `<character_id>` | Nakama user | 1 | 0 |
| `active_missions` | `<character_id>` | Nakama user | 1 | 0 |

Version strategy: OCC retries on write conflicts. Boards are **not** stored in the player profile.

## State transitions

```
available → active → complete
```

- No backward transitions.
- `expired` reserved; not used for timer completion (timer uses `complete`).
- After `complete`, claim via `mission_claim` (Phase 14). A new `mission_start` clears a `claimed` active record.

## Timer authority

- `started_at` / `completes_at` set **only** on the server from `os.time()`.
- Client must not submit timestamps, duration, difficulty, risk, or outcome.
- Godot may countdown locally from returned ISO times; authoritative checks use `mission_status` (rate-limited on client).

## Refresh rules

- Free refresh with **15 second** cooldown (`REFRESH_COOLDOWN_SEC`).
- Refresh rejected while a mission is `active`.
- Level / highest_sector are clamped hints from MissionManager (Node character snapshot) until progression is Nakama-authoritative.

## Mission schema

```json
{
  "mission_version": 1,
  "mission_id": "",
  "template_id": "",
  "owner_character_id": "",
  "title": "",
  "description": "",
  "difficulty": "",
  "risk": 0,
  "duration_seconds": 0,
  "status": "available",
  "generated_at": "",
  "started_at": "",
  "completes_at": "",
  "completed_at": "",
  "expires_at": "",
  "reward_reference": {},
  "metadata": {}
}
```

`reward_reference` may hold future claim inputs (`stardust_efficiency`, `xp_efficiency`) — **never granted** here.

## Future reward integration

A later phase should add claim/resolution that:

1. Requires `status == complete`
2. Grants XP / stardust / items via trusted server modules
3. Debits fuel at start (not in Phase 7)
4. Clears `active_missions` after payout

## Known limitations

- Cantina UI still on Node for launch/claim/fuel
- Level/sector hints are client-supplied with clamps
- Template catalog is the Godot subset (10), not full web list
- No fuel debit on Nakama `mission_start`
- No automatic migration of Node active missions into Nakama

## Non-goals

Rewards, XP, currency, items, energy, premium refresh, loot, claim, daily missions, achievements, admin tools, Phase 8.
