# Phase / Restoration 16 — Arena and PvP

Architecture: **Nakama = auth only.** Node Character + Arena services are
authoritative for matchmaking, combat, rating, rewards, and cooldowns.
Godot is presentation + request initiation via `GameApiClient`.

## Completion report

### 1. Existing authoritative Arena implementation found

| Layer | Role |
|-------|------|
| `server/src/functions/economyFollowOn.js` | Ladder Prepare/Finish, day sync, skip, offers |
| `server/src/shared/arenaService.js` | Cooldown, offers, rank, serialization |
| `server/src/shared/combatService.js` | Shared `SimulateCombat(mode: "arena")` |
| `server/src/arena/*` | Direct-challenge rating policy + bot ladder DB |
| `src/lib/arenaEngine.js` | Elo, matchmaking helpers, combat loop |
| `src/lib/arenaBotGenerator.js` | Bot level/EPA/templates |

### 2–4. Real-player matchmaking / preference / offers

Recovered and preserved:

- Prefer up to `ARENA_MAX_REAL_OPPONENTS` (2) reals; optional 3rd if within wide band
- Rating bands: tight ±120, wide ±280; level band ±8
- `rankArenaCandidates` → `pickRankedCandidates` (weighted top-of-list)
- Same-account excluded; self-match blocked
- **Stable offers**: `arena_opponent_offers` on Character with `offer_id` (**2 hour TTL**; remint on fight, player/foe level-up, or expiry — no manual refresh)
- Bots fill remaining slots via persistent `arena_bots` ladder (+ ephemeral EPA bots if empty)

### 5–6. Cooldown & skip (Phase 8)

| Rule | Value |
|------|-------|
| Battles | Unlimited. No daily attempt quota. No 15-Nova extra-battle purchase. |
| Normal cooldown | **10 minutes** (`ARENA_BATTLE_COOLDOWN_MS`) after every completed win or loss |
| Storage | `arena_cooldown_at` = battle commit time; available = start + 10m (server clock) |
| Skip cooldown | **10 Nova** (`ARENA_COOLDOWN_SKIP_NOVA`) while cooldown is active; unlimited if the player can pay |
| Paid battle | **Removed.** No extra-battle purchase exists. |

Skip of an active cooldown is charged during successful `PrepareArenaCombat`, atomically with the committed fight. Finish never re-evaluates or charges that skip. An expired or missing cooldown never charges Nova. Duplicate Prepare/Finish cannot double-charge. See `docs/PHASE8_ARENA_PVP.md`.

### 7. Player snapshot policy

- Attacker: live owned character + equipped items at Prepare
- Defender (real): **offer-captured** character + equipped snapshot stored on offer
- Bot: ladder stats / EPA generation committed on offer — no reroll on Finish/retry

### 8–10. Rating / ranking / leaderboard

- Elo-style delta: `eloRatingDelta` K=28, clamp ±6…±36 (`economyFormulas` / `arenaEngine`)
- Starting rating 1000
- Rank = sort all characters by rating desc, wins, id
- `GetArenaLeaderboard` reads Node Character ratings (not Nakama leaderboards)
- Bot ladder ratings mirror player delta via `settleBotAsOpponent` (presentation ladder only)

### 11–14. Bot fallback / weighting / rating policy

- Bots only when real slots insufficient
- Level: player ±5, min 1; budget: `ROUND(EPA(L) × U(0.85,1.15))`
- Classes: uniform over six real classes; templates damage/balanced/durable (uniform roll in generator)
- Passives: real class passives; normal PvP caps (not dungeon 75%)
- Bots are **not** Nakama users

### 15–17. Stims / combat / passives

- Attacker uses shared attribute layer (equipment + active Stims via character load)
- Arena uses `simulateBattle` / `SimulateCombat` — no Arena-specific damage formulas
- Class passives from Prompt 09 apply to players and bots

### 18–19. Daily rewarded wins & 2.25×

- Cap: **10** rewarded wins / production game day (`productionGameDayId`, 19:00 UTC)
- `arenaStardustReward = roundHalfUp(2.25 × stardustPerFuel(level))` after XP / level-ups
- **1.5× path inactive** (`ARENA_WIN_FUEL_EQUIVALENT = 2.25`)
- Losses: 0 XP / 0 Stardust and do not consume a rewarded win; wins after 10: rating only

### 20–21. Paid economy & history

- Paid cost via `novaDebitPatch` / currency half-units (Prompt 15)
- Match settle idempotency: `wallet_operations` key `finish_arena` + `combat_id`
- Personal revenge history still client/web-side for ladder; direct-challenge store unchanged

### 22–25. Files changed

**Node:** `arenaService.js` (new), `combatService.js`, `economyFollowOn.js`, `entityAccess.js`, `arenaEngine.js` (cooldown 10m), `economyFormulas.js` (export), tests, `package.json`

**Godot:** `ArenaManager.gd` → `GameApiClient`; `ArenaRules.gd` PAID=15, COOLDOWN=10m

**Web:** `ArenaPage.jsx` Prepare/Finish + `GetArenaOpponents`

### 26–27. Removed / retained

- Removed production authority of client `body.won` on ladder Finish (stripped)
- Direct-challenge path still accepts legacy `won` until challenge Prepare is unified (**deferred**)
- Nakama Arena RPCs no longer used by Godot ArenaManager

### 28–31. Transaction / settlement / idempotency / recovery

- Prepare commits `arena_pending_combat`; Finish never re-sims
- Duplicate Finish → wallet replay
- `RecoverArenaMatch` returns pending combat or settled receipt
- Rating + cooldown + attempts + rewards applied in one Character update

### 32. Security

- Strip client won/rating/stardust; hard-reject RNG seeds
- Offer_id required; self/same-account rejected
- Client bot stats ignored

### 33–36. Tests

```
npm run test:arena-authority   # 10 passed
npm run test:arena-bot         # 9 passed
npm run test:arena             # direct-challenge (alias fixed)
npm run test:economy           # 11 passed (regression)
npm run test:dungeon           # 19 passed (regression)
```

### 37. Regression (01–15)

Economy + dungeon green. Auth/JWT/combat/passives not rewritten.

### 38–41. Open / deferred

- Direct-challenge still client-`won` until PrepareCombat wired
- Persistent Arena match-history table for Godot (ladder) not restored
- Full Stim balance simulation (bot vs stimmed player) deferred
- Concurrent multi-worker stress not fully automated
- Web legacy path without `offer_id` still client-sims playback only

### 42–47. Diagrams

**Request / settlement**

```
Nakama session → Node JWT → GetArenaStatus / GetArenaOpponents
  → PrepareArenaCombat(offer_id) → SimulateCombat → arena_pending_combat
  → FinishArenaBattle(combat_id) → rating/rank/cooldown/rewards → wallet_operations
  → Godot playback of committed events
```

**Matchmaking**

```
rank real candidates (rating/level bands) → prefer ≤2 reals
  → fill with arena_bots near rating → ephemeral EPA bot if needed
  → store offers with offer_id
```

**Bot generation**

```
ShouldUseBot (slot fill) → generateArenaBot / ladder row
  → level ±5, EPA×[0.85,1.15], class+template → commit on offer
```

**Rating**

```
committed winner → eloRatingDelta(pre ratings) → Character.arena_rating once
  → optional bot mirror → leaderboard sort
```

**Rewards / skip**

```
won && rewarded_wins < 10 → canonical arenaXpReward then arenaStardustReward(post-XP level)
losses and wins after the cap → 0 XP / 0 Stardust; rating and cooldown still process
skip active cooldown −10 Nova; no 15-Nova battle purchase
```

**Recovery**

```
timeout → Finish/Recover by combat_id → same pending or wallet receipt
  → no reroll opponent / combat / rating
```
