# Phase 8 — Mission authority migration

Makes **Nakama the sole authoritative mission system** for the Godot Cantina / mission run flow.

## What changed

| Before (Phase 7) | After (Phase 8) |
|------------------|-----------------|
| Cantina used client `MissionBoard.build_board` + local cfg | Cantina loads via `missions_get` only |
| `launch_offer` → Node `LaunchMission` | `launch_offer` → Nakama `mission_start` |
| Resume via Node `active_mission_id` | Resume via Nakama `mission_status` |
| Local cfg could invent offers | Local cfg is **cache only**; never authoritative |

## Source of truth

1. **Nakama** wins for generation, ownership, timers, state, completion eligibility.
2. **Local board cache** (`user://godot_mission_board.cfg`) stores the last successful Nakama board for faster redisplay / offline messaging only.
3. If cache and Nakama disagree, **Nakama always wins** (`ensure_board` always calls Nakama first).
4. Client **never** generates authoritative missions.

## Preserved UI surface

- `MissionManager.ensure_board` / `launch_offer` / `fetch_active_mission` / timer helpers / signals still exist.
- Cantina / mission_run call the same functions; implementations now hit Nakama.
- Fuel chip / buy fuel remain Node economy (display + purchases); mission start does **not** debit fuel.
- Combat / claim rewards are deferred (soft acknowledge on complete).

## Non-goals

Rewards, XP, currency grants, item grants, fuel debit on start, Node mission dual-write, Phase 9+.
