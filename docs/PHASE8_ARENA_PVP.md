# Phase 8 — Arena / PvP production

Node Character and Arena services are the only gameplay authority. Nakama stays authentication-only. Godot is presentation and request initiation. There is no player-facing web Arena client.

Historical numbering collisions are not authority: `docs/PHASE8_MISSION_MIGRATION.md` (old Missions numbering), `docs/PHASE18_ARENA.md`, `modules/arena.lua`, and `modules/lib/arena_rating.lua` (obsolete Nakama Arena). `docs/PHASE_ARENA.md` is Node evidence superseded by this document on conflict.

## Player-visible rules

- Arena battles are unlimited. There is no daily attempt quota and no 15-Nova extra-battle purchase.
- Every completed fight, win or loss, starts one 10-minute cooldown. Skipping an **active** cooldown costs 10 Nova, charged during successful Prepare (atomically with the committed fight). Finish never charges that skip, even if the player waits out the original ten minutes. Expired or missing cooldowns never charge.
- The first 10 reward-eligible wins each production game day (19:00 UTC, no DST) grant XP and Stardust. Losses grant neither and do not consume a rewarded win. Further fights are rating-only.
- The reward cap never blocks matchmaking, combat, cooldown, statistics, history, quests, achievements, or rating.

## Combat authority

Every ladder, bot, and direct-challenge fight prepares through shared Phase 3 combat (`SimulateCombat`, Arena context ×1.0 both sides). The server freezes the attacker’s live snapshot and the offer/challenge opponent snapshot, commits the result, then settles from that committed combat only.

- Clients send identifiers and skip intent. They never send `won`, damage, events, stats, rewards, rating deltas, opponent snapshots, timestamps, or RNG.
- Direct-challenge `body.won` is removed. HTTP `POST /api/arena/challenges/:id/complete` routes to `FinishArenaBattle`.
- A pending fight blocks a different prepare. Recovery returns the same committed combat or the already-settled wallet replay.
- Duplicate Finish replays the original grant. Concurrent Finish settles once.
- Inline cooldown skip is paid at Prepare. Duplicate Prepare of the same fight does not charge again. Recovery before Finish returns the pending fight with `skip_paid`. Recovery after Finish returns the settled replay without a second debit.

## Rewards

Canonical formulas (unchanged):

- `arenaXpReward(L) = roundHalfUp(2.125 × missionXpPerFuel(L))`
- `arenaStardustReward(L) = roundHalfUp(2.25 × stardustPerFuel(L))`

Eligible-win order: snapshot `arenaRewardLevel` → canonical XP → collection XP bonus in one place → grant XP and level-ups → canonical Stardust at post-XP `character.level` → increment the rewarded-win counter once.

Direct-challenge rating-gap / practice reductions stay outside those formulas (`DIRECT_CHALLENGE_REDUCED_REWARD_MULTIPLIER`). Ladder Elo and direct-challenge rating policies remain separate.

## Matchmaking and rating preserved

Three stable opponent offers, real players preferred, bots as fallback, 2-hour TTL with remint after fight / level-up / expiry, no player-paid refresh. Current ladder Elo and current direct-challenge gap, repeat-opponent, practice, and anti-farm policies are unchanged. The daily reward cap does not alter either rating policy.

The Phase 7 Dungeon/Wormhole 4/3/3 archetype schedule is not used for Arena matchmaking.

## Client

Godot Arena lobby shows rating, rank, three offers, cooldown plus 10-Nova skip, rewarded wins used/remaining out of 10, and a rating-only state after the tenth win. Codex/help text matches these rules. Prepare/Finish send no winner and no free/paid-battle contract.

## Privacy

Player Arena responses continue through the role-aware public sanitizer. `pricing_quality_*` and `acquisition_stardust_paid` stay stripped for players. Admin inspection keeps approved internal-quality visibility. Offer debug payloads are admin-only.

## Removed live concepts

These symbols are gone from live code (not zeroed aliases):

- `ARENA_DAILY_FREE_BATTLES`
- `ARENA_PAID_BATTLE_COST`
- Godot `DAILY_FREE_BATTLES` / `PAID_BATTLE_COST`
- Arena `is_free` / `free` reward contracts
- Live admin, scheduler, serialization, and UI handling of `arena_attempts_left` / `arena_attempts_date`

The ten-win reward cap is `ARENA_REWARDED_WINS_PER_DAY` only. Leftover stored attempt fields may remain in old records; they are stripped from create/update payloads and are not inspected or adjusted.

## Tests

- `npm run test:phase8` — composed Phase 8 runner
- `npm run test:phase8-arena` — authority, rewards, game-day, cooldown, recovery
- `npm run test:phase8-pvp-matrix` — six-class combat evidence through L2000
