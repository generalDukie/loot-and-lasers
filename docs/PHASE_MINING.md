# Phase / Restoration 13 — Mining System

Architecture: Nakama = auth only. **Node owns mining timers, reward snapshots,
completion, and persistence.** Godot / web present countdown and request
start/collect/cancel — never advance timers or generate rewards.

## Completion report

### 1. Mining architecture (recovered model)

Authoritative product model is **AFK duration mining** (1–24 hours), not a
location-unlock / tool-upgrade tree.

```
Select duration (hours)
  → Validate character + mission mutex
  → Snapshot MiningStardust = ROUND(SPF(L) × 0.03 × minutes)
  → Persist mining_start_time / mining_end_time / mining_hours / mining_reward
  → Timer advances via Node clock.nowMs()
  → Collect grants committed stardust exactly once
  → Clear session fields
```

Logical “node”: `stardust_afk` / “Stardust Node” (serialized for clients).
There are **no** separate world mining-node unlock tables in the recovered
codebase — duration + level SPF is the progression.

Handlers:

| RPC | Role |
|-----|------|
| `GetMiningStatus` | Reconnect restore (timer, reward, state) |
| `StartMining` | Begin session; snapshot reward |
| `CollectMining` | Finish when ready; wallet idempotency |
| `CancelMining` | Abort with no payout |

Auth path: Nakama session → Node gameplay JWT → middleware → account →
selected character → mining handlers.

### 2. Persistence

Stored on Character (JSON entity):

| Field | Purpose |
|-------|---------|
| `mining_start_time` | ISO start (server clock) |
| `mining_end_time` | ISO completion (server clock) |
| `mining_hours` | Duration 1–24 |
| `mining_reward` | **Committed** stardust snapshot |

Protected via `CHARACTER_ECONOMY_FIELDS` (clients cannot PATCH these).
Offline / logout / Godot close / Node restart: state survives in SQLite;
`GetMiningStatus` or character refresh restores progress.

### 3. Reward generation

- Formula: `computeMiningReward(level, hours)` → `src/lib/stardustEconomy.js`
  (`MINING_EFFICIENCY = 0.03`).
- Generated **once** at `StartMining`. Reconnect returns the same snapshot.
- Collect pays `mining_reward` only — no reroll.
- Reward type: **stardust currency** (wallet / Character fields + audit).
  No inventory crafting-resource drops exist in the recovered reward tables.

### 4. Timer implementation

- Start/end computed with `clock.nowMs()` (not raw `Date.now()`).
- Collect compares `mining_end_time` to `clock.nowMs()`.
- Clients display countdown from `mining_end_time` /
  `mining_end_time_unix`; UI clocks are presentation-only.

### 5. Recovery / idempotency

- Lost collect response: same `request_id` → `wallet_operations`
  (`collect_mining`) replay without double grant.
- Without key: second collect → `MINING_NOT_ACTIVE`.
- Mid-session reconnect → `GetMiningStatus` returns committed reward +
  remaining time.

### 6. Security

- Client `mining_reward`, `mining_end_time`, `stardust`, `level`, etc. →
  `400 MINING_CLIENT_TAMPER`.
- Ownership via `requireMyChar` / `resolveSelectedCharacter`.
- Mission mutex: cannot start while mission active (and LaunchMission
  blocks while mining busy).

### 7. Godot integration

- `MiningManager.gd`: Node-only invokes; `request_id` on collect;
  `GetMiningStatus` on page boot; flattens `mining_*_unix` for countdown.
- `mining.gd`: presentation; preview via shared `StardustEconomy` (display
  only).
- Web `SpaceMiningPage.jsx`: fixed stale `level × 12` copy → SPF × 0.03;
  progress uses `mining_hours` / `mining_start_time`.

### 8. Database changes

No new tables. Character document fields:
`mining_start_time`, `mining_hours` (added alongside existing
`mining_end_time`, `mining_reward`). Collect receipts use existing
`wallet_operations`.

### 9. Files modified

- `server/src/shared/miningService.js` (new)
- `server/src/functions/economyFollowOn.js`
- `server/src/entityAccess.js`
- `server/scripts/test-mining.mjs` (new)
- `package.json` (`test:mining`)
- `loot&lasers/Autoload/MiningManager.gd`
- `loot&lasers/Scenes/UI/mining.gd`
- `src/pages/SpaceMiningPage.jsx`
- `docs/PHASE_MINING.md` (this file)

### 10. Regression / tests

```
npm run test:mining   # 15 passed
```

Coverage: start, status/reconnect, early collect reject, no reward reroll,
collect once, duplicate `request_id`, tamper reject, mission mutex, cancel,
foreign ownership.

### 11. Outstanding issues

- **No crafting-resource mining tables** in repo — stardust-only AFK loop is
  what existed; do not invent inventory ore drops without design.
- **No tool / tech / location unlock progression** in recovered code —
  progression is character level → SPF yield.
- Client countdown still uses local wall clock against server ISO/unix end
  (same pattern as missions). Authority for completion remains Node.
- Manual checklist: Auth → Load character → Start mining → Close Godot →
  Reconnect → Verify timer → Wait → Collect → Reconnect → Verify no
  duplicate grant.

### Completion gates

| Gate | Status |
|------|--------|
| Timers client-authoritative? | No — Node `clock` + persisted end |
| Rewards reroll? | No — snapshot at start |
| Collection duplicates? | No — clear + wallet replay |
| Godot generates rewards? | No — preview only |
| Bypasses inventory for items? | N/A — stardust currency path |
| State lost on reconnect? | No — Character persistence |
| Mining authority outside Node? | No |
