# Phase 18 — Arena matchmaking and rankings

Server-authoritative Arena: rating, matchmaking, direct challenges, battle history. Combat is resolved exclusively by Phase 17 CombatService. **No Arena rewards** in this phase.

## Audit summary (pre-implementation)

Legacy Arena was Node + client-simulated combat (`MissionCombat` / `FinishArenaBattle`). Elo lived on Character; matchmaking was client-side; direct challenges used gap/repeat policy in `server/src/arena/`. No named UI tiers (raw rating). Nakama had no ArenaService. Phase 18 replaces Godot authority with Nakama while preserving ArenaManager function names for UI.

## Ownership

Character-owned Arena state. Session `user_id` only; `character_id` must match `selected_character_id`.

## Public RPCs

| RPC | Purpose |
|-----|---------|
| `arena_get_state` | Ensure/load Arena state (default rating once) |
| `arena_get_opponents` | Up to 3 nearby opponents by rating |
| `arena_refresh_opponents` | Removed — boards remint on fight / 2h TTL / level-up |
| `arena_get_rankings` | Bounded paginated rankings |
| `arena_challenge` | Direct/matchmaking challenge → combat + rating |
| `arena_get_history` | Paginated battle history |

Forbidden: `arena_set_rating`, `arena_force_win`, `arena_submit_result`, etc.

## Rating formula (Elo-like)

```
expected = 1 / (1 + 10 ^ ((opponent - player) / rating_divisor))
base = K × (actual - expected)   # actual = 1 win / 0 loss
```

Defaults (RemoteConfig `arena`): `K=28`, `rating_divisor=400`, `default_rating=1000`, clamp `[0, 3000]`, max gain/loss `32`.

**Rounding:** truncate toward zero. Hard zero stays 0. Tiny positive win → `minimum_nonzero_gain` (1). Tiny loss → `-1`.

## Lower-ranked gain penalty (wins only)

| Rating gap (attacker − defender) | Gain multiplier |
|----------------------------------|-----------------|
| ≤ 100 | 100% |
| 101–250 | 50% |
| 251–400 | 20% |
| > 400 | **0** |

Losses never use this table (upset losses keep full Elo risk). Repeat-opponent scaling: 1st win full, 2nd ×0.4, after 2 wins in window → 0 gain.

## Matchmaking

1. Start at `matchmaking_initial_window` (120).
2. Expand by `window_step` until 3 candidates or `max_window`.
3. Exclude self, same account, over-farmed pairs.
4. Sort by `|Δrating|` (stable by character id).
5. Sparse population may return fewer than 3 — no bots in this phase.

## Direct challenge

Payload: `{ character_id?, opponent_character_id, request_id, class?, level?, display_name? }`.

Server validates ownership, cooldown, attempts, anti-farm, loads live equipment for both sides, calls `combat.simulate_combat`, applies rating to **both** characters, writes history + index, returns combat log + rating receipt.

Client must not submit winner, damage, RNG, stats, or rating deltas.

## Defense snapshot decision

**Live load** from Nakama `equipment` via CombatService `build_character_combatant`. No separate snapshot store. Equipment changes apply on the next challenge. Documented trade-off: opponent offline is fine; staleness is bounded by last equip write.

## Leaderboard design

**Custom `arena_index`** on system owner (not Nakama leaderboard API). Reason: Arena is **character-scoped**; Nakama leaderboard records are per `user_id` and would collide for multi-character accounts. Index is server-written only on state ensure/challenge.

## Battle transactions

Collection `arena_transactions` / `request_id`. States: `pending` → `combat_resolved` → `ratings_pending` → `completed`. Retry with same `request_id` returns stored result (no re-sim, no double rating). Conflicting reuse → 409.

Not fully atomic across users; recovery limitation: if process dies after combat but before both writes, retry returns incomplete tx without result until a future compensation job (not in this phase). Successful path writes challenger result before returning.

## Cooldowns / attempts

- `battle_cooldown_seconds` (default 300) after each challenge
- `daily_attempt_limit` (default 10), UTC day key
- `opponent_refresh_cooldown_seconds` (default 300)
- No premium skips / paid attempts

## Anti-farming

- `max_rated_battles_per_opponent` (default 3) per `repeat_opponent_window_seconds` (86400)
- Repeat win gain multipliers as above
- Same-account challenges rejected

## Tiers / seasons

Configurable foundation tiers by rating: bronze / silver / gold / platinum / diamond (thresholds in code defaults). Season id = RemoteConfig `active_season_id` or `YYYY-MM`. **No seasonal resets or reward payouts.**

## Feature flags

`arena_enabled`, `arena_matchmaking_enabled`, `arena_direct_challenge_enabled`, `arena_rankings_enabled` — default on.

## Godot

`ArenaManager` uses Nakama only for Arena. Local `MissionCombat.simulate_battle` and `FinishArenaBattle` disabled. UI keeps calling manager methods; combat UI animates server `combat_log`.

## Rewards

**Not implemented.** Future: RewardService after anti-abuse soak.

## Known limitations

- No bot ladder / bot raids
- No Nova paid battles or cooldown skip
- Web/Node Arena still exists for the web client until a later cutover
- Live gap-penalty coverage is formula-verified; rating gaps for live E2E need organic rating drift
- Custom index scan capped (~500) — fine for early population
- Multi-write consistency not transactional

## Verification

`scripts/verify_arena_service.mjs` via `npm run verify:backend`.
