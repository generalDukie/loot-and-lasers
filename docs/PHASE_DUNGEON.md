# Phase / Restoration 14 — Dungeon System

Architecture: Nakama = auth only. **Node owns dungeon unlocks, crawl progress,
cooldowns, continue fees, combat settlement, rewards, and persistence.**
Godot / web present the Galactic Frontier map and play back committed combat —
never decide outcomes, unlocks, or loot.

Builds on Prompt 08 (shared Combat Engine) and Prompt 06 (Inventory /
`grantItemOrPending`).

## Completion report

### 1. Dungeon architecture (recovered)

Authoritative product model is the **Galactic Frontier crawl**:

```
Select world / wormhole
  → Validate unlock (level table 1–10)
  → Validate crawl progress (active planet + enemy index)
  → Validate cooldown (dungeon_cooldown_until)
  → Validate continue credit (3 free deaths / ET day)
  → PrepareDungeonCombat → shared combatService.simulateDungeonCombat
  → Persist dungeon_pending_combat on Character
  → FinishDungeonBattle → settle once (wallet_operations)
  → XP / gear / consumable / cooldown
```

There is **no** separate dungeon-instance SQL table. The “instance” is
`Character.dungeon_pending_combat` (combat snapshot + encounter meta).

Handlers:

| RPC | Role |
|-----|------|
| `SyncDungeonState` | Daily death reset + status blob |
| `GetDungeonStatus` | Reconnect restore (cooldown, crawl, pending id) |
| `SkipDungeonCooldown` | Nova skip; requires active cooldown |
| `PayDungeonContinue` | Nova → `dungeon_continue_credit` when deaths exhausted |
| `PrepareDungeonCombat` | Shared combat engine; gates + pending commit |
| `FinishDungeonBattle` | Settle committed combat; never re-sim |

### 2. Unlock implementation

`DUNGEON_UNLOCK_LEVELS` / `isDungeonUnlockedByLevel` (economyFormulas +
dungeonEngine mirror). Story planets 1–10 level-gated on Prepare/Finish via
`assertDungeonProgressAllowed`. Wormhole (`planet > 10`) follows crawl
position after the planet-10 (World Zero) boss clear.

### 3. Cooldown implementation

- Written with `clock.nowMs()` → `dungeon_cooldown_at` / `_ms` / `_until`
- Win 10m / loss 25m (`dungeonCooldownMs`)
- **Prepare rejects** while `cooldown_remaining_ms > 0` (`DUNGEON_COOLDOWN`)
- Skip requires active cooldown (`DUNGEON_NO_COOLDOWN` otherwise)
- Clients display `_until` (Godot already preferred it; web fixed)

### 4. Enemy generation

Shared `generateDungeonEnemy` (deterministic seed per planet/index) via
`combatService.simulateDungeonCombat`. Difficulty from EPA budgets ×
1.20/1.30 + archetype — **not** alternate combat formulas.

### 5. Combat integration

```
Prepare → prepareDungeonCombatForCharacter
       → SimulateCombat (Prompt 08 + class passives Prompt 09)
Finish → read pending only (409 DUNGEON_NO_PENDING if missing)
       → ignore body.won
```

Finish **no longer auto-prepares** on mismatch (that path re-ran combat and
could double-reward).

### 6. Reward integration

| Reward | Path |
|--------|------|
| XP | `druToRewards` = `round(DRU × MissionXPPerFuel(enemyLevel) × 2.0)`, + collection XP bonus, then `applyXpToCharacter` |
| Stardust | `druToRewards` returns 0 (preserved) |
| Gear | dungeon rarity tables + shared `randomItem` / Gear Generator |
| Consumable (Stim) | same grant path |
| Inventory | `grantItemOrPending` (Prompt 06) |

**DRU → XP:** one authoritative balance constant,
`DUNGEON_XP_PER_DRU_MULTIPLIER = 2.0` (1 DRU = 2 fuel-equivalents of XP at the
enemy's level). Stardust and DRU budgets/shares are unchanged.

RNG at Finish uses `secureRandom`. Settle-once via
`wallet_operations` (`finish_dungeon`, key = `combat_id`).

### 7. Persistence / recovery

| Field | Role |
|-------|------|
| `dungeon_planet` / `dungeon_enemy` | Crawl cursor |
| `dungeon_deaths` / `_date` | Free lives (ET) |
| `dungeon_continue_credit` | Paid continue token |
| `dungeon_cooldown_*` | Availability |
| `dungeon_pending_combat` | Committed instance |
| `wallet_operations` | Finish receipt |

Reconnect: `GetDungeonStatus` / `SyncDungeonState` / character refresh.
Prepare replays matching pending without re-sim or re-charging continue.
Finish with same `combat_id` → idempotent replay.

### 8. Godot integration

`DungeonManager.gd` — Node-only invokes; passes `combat_id` on Finish;
applies `dungeon` status blob; `GetDungeonStatus` available for reconnect.
UI / `DungeonRules.gd` remain presentation mirrors.

### 9. Database changes

No new tables. Character fields: `dungeon_continue_credit` (plus existing
dungeon_*). Finish receipts in existing `wallet_operations`.

### 10. Files modified

- `server/src/shared/dungeonService.js` (new)
- `server/src/functions/economyFollowOn.js`
- `server/src/entityAccess.js`
- `server/scripts/test-dungeon.mjs` (new)
- `package.json` (`test:dungeon`)
- `loot&lasers/Autoload/DungeonManager.gd`
- `src/pages/GalaxyMapPage.jsx`
- `docs/PHASE_DUNGEON.md` (this file)

### 11. Regression / tests

```
npm run test:dungeon         # 19 passed
npm run test:dungeon-enemy   # enemy/unlock tables
npm run test:combat          # shared engine
npm run test:mining          # untouched
```

Coverage: tamper reject, unlock/progress, cooldown block/skip, continue
credit, prepare + replay, finish once, duplicate combat_id, no auto re-sim,
inventory grant path, GetDungeonStatus.

### 12. Outstanding issues

- Loot rolls at Finish (not snapshotted onto pending). Mitigated by
  settle-once + `secureRandom`; ideal follow-up is commit loot seed at Prepare.
- Formula tables still duplicated between `economyFormulas.js` and
  `dungeonEngine.js` (drift risk; not redesigned here).
- `dungeon_extra_lives` remains unused (legacy Sync reset only).
- Patrol/farm mode removed — dungeons are one-time story clears only; the active
  node (planet + enemy index) is Node-validated on Prepare and Finish.

### Completion gates

| Gate | Status |
|------|--------|
| Combat bypasses Combat Engine? | No |
| Rewards bypass Inventory Service? | No (`grantItemOrPending`) |
| Cooldowns client-authoritative? | No — Node enforce + clock |
| Rewards reroll after reconnect? | No — wallet replay |
| Combat reruns after reconnect? | No — pending replay; Finish never re-sims |
| Authority outside Node? | No |
| Shared systems duplicated? | No — reused combat / inventory / gear |
