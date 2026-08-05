# Casino Replacement Completion Report (casino_v2)

Date: 2026-08-05  
Scope: Replace all Casino games with four Node-authoritative finalized games.

## 1. Existing Casino architecture found

- Node economy follow-on RPCs: `GetCasinoState`, `RecoverCasinoWager`, `CasinoSettle`
- Atomic settle via wallet operations + ledger debit/credit
- Resolvers previously lived in `casinoService.js` (dice/wheel; flip/jackpot sealed)
- Godot: code-built `casino.gd` + `CasinoManager` + `CasinoWheelDisc`
- Web: `CasinoPage.jsx` + StardustDice / StardustWheel / sealed Flip+Jackpot
- No multistep session table prior to this work

## 2. Existing games found

| Legacy ID | Status before |
|-----------|---------------|
| `dice` | Live (1d6 high/low) |
| `wheel` | Live (old tier table incl. 25×) |
| `flip` / `crystal_flip` | Sealed |
| `jackpot` / `crystal_jackpot` | Sealed |

## 3. Existing infrastructure preserved

- Nakama auth / sessions / JWT gameplay exchange (untouched)
- Public routing, TLS, Docker, installer, release config (untouched)
- Wallet operations + ledger categories (`casino_wager` / `casino_payout`)
- Request-ID / idempotency via `normalizeOperationKey` + `wallet_operations`
- `RecoverCasinoWager`
- Godot Casino nav entry, page shell, ClientUi styling
- Historical `wallet_operations` rows (not deleted)

## 4. Old games removed or disabled

- Legacy IDs return **410** `CASINO_GAME_RETIRED` via `normalizeCasinoGameId`
- Godot UI no longer exposes flip/jackpot/old dice
- Web page no longer mounts Flip/Jackpot; stubs show retired copy
- `StardustDice.jsx` re-exports `GalacticDice`

## 5. Final game registry

1. `galactic_dice` — Stardust  
2. `stardust_wheel` — Stardust  
3. `crystal_refining` — Nova (session)  
4. `smugglers_cache` — Nova (session)  

Rules version: `casino_v2`

## 6. Stardust wager implementation

- Min = `1 × StardustPerFuel(level)`  
- Max = `50 × StardustPerFuel(level)`  
- Validated in `validateStardustWager` / Node settle path  
- Godot + web display limits from `GetCasinoState.stardust_limits`

## 7. Nova wager implementation

- Static 100–1000 Nova Crystals  
- `validateNovaWager` + session start debit once  
- Presets 100/250/500/750/1000 on clients

## 8. Galactic Dice implementation

- 2d6; choices Low / Seven / High; payouts 2× / 5× / 2× (gross)  
- Node: `resolveGalacticDice` + `CasinoSettle`  
- Godot + web animate server dice only

## 9. Stardust Wheel implementation

- Tiers: Lose 60% / Shove 20% / 2× 10% / 3× 5% / 5× 3% / 10× 2% (RTP 90%)  
- Visual segments = probabilities (`wheelSegmentLayout`)  
- Clients land using server `tier_id` / `segment.mid`

## 10. Crystal Refining implementation

- Session start deducts once + attempt 1 at 40% (not guaranteed)  
- Attempts 2–5 via `refine`; collect stages 1–4; stage 5 auto-pays  
- Persisted in `casino_sessions`  
- RPCs: `CasinoSessionStart` / `CasinoSessionAction`

## 11. Smuggler’s Cache implementation

- Board: 4 scrap / 1 damaged 0.5× / 1 alluring 2.5×, shuffled + persisted before select  
- Select settles once; reconnect restores sealed board  
- Name: Smuggler’s Cache / Alluring Contraband

## 12. UI scenes added or changed

- `loot&lasers/Scenes/UI/casino.gd` (full rewrite)  
- `loot&lasers/Scenes/UI/casino.tscn` (unchanged shell)  
- Web: `CasinoPage.jsx` + new/updated casino components

## 13. Buttons added

Galactic Dice: Low / Seven / High / Roll / Skip  
Wheel: Spin + quick-bets  
Refining: Start Refining / Collect / Refine Again / Start New Session  
Cache: Start Round / 6 crates / Next Round  
Nav: 4 game tabs

## 14. Text fields added

Whole-number stardust + nova wager inputs (Godot labels + Spin/buttons; web number inputs)

## 15. Quick-bet controls added

Stardust: 10% / 25% / 50% / 100% (floor; disable invalid)  
Nova: 100 / 250 / 500 / 750 / 1000

## 16. Animation hooks added

- Dice tumble ~1.5s; seven-win emphasis  
- Wheel spin ~2s to authoritative segment; 5×/10× feedback  
- Refining events: `refinement_started`, `refinement_succeeded`, `crystal_shattered`, `payout_collected`, `final_refinement_completed`  
- Cache: selected crate first, then remaining

## 17. Node routes added or changed

| RPC | Role |
|-----|------|
| `GetCasinoState` | Registry, limits, active sessions |
| `CasinoSettle` | Dice + Wheel only |
| `CasinoSessionStart` | Refining + Cache (new) |
| `CasinoSessionAction` | refine / collect / select (new) |
| `RecoverCasinoWager` | Settle + action recovery |

## 18. Persistence changes

- New table `casino_sessions`  
- New table `casino_stats`  
- Existing `wallet_operations` for idempotency receipts

## 19. Economy and ledger integration

- Debit wager via `debitStardust` / `debitNova` (`casino_wager`)  
- Credit gross payout via `creditStardust` / `creditNova` (`casino_payout`)  
- Gross model: debit full wager, credit `FLOOR(wager × mult)`  
- No direct currency field mutation in Casino routes

## 20. Idempotency and recovery strategy

- Settle / session-start keys in `casino_settle`  
- Session actions in `casino_action`  
- Same request returns prior receipt  
- Godot keeps pending request id on transport status 0 for recover/retry  
- Conflicting reuse of a completed key returns replay (same result)

## 21. Session persistence strategy

- Active refining/cache rows survive reconnect / Node restart  
- `GetCasinoState.active_sessions` restores UI  
- Second start while active → 409 `CASINO_SESSION_ACTIVE`  
- No auto-refund on disconnect

## 22. Statistics integration

- `casinoStats.recordCasinoPlay` per account + global  
- Game-specific counters (choices, outcomes, stages, crate positions, streaks)  
- Rejected requests do not record

## 23. Legacy wager/session handling

- Completed historical settles retained  
- No unfinished pre-v2 session table existed → nothing to migrate  
- Legacy game IDs cannot settle under old rules (410)  
- Stats for legacy games remain in historical audit/wallet data under old IDs

## 24. Godot / GDScript files changed

- `Autoload/CasinoManager.gd`  
- `Scenes/UI/casino.gd`  
- `Scripts/UI/CasinoWheelDisc.gd`

## 25. Node files changed

- `server/src/shared/casinoGames.js` (new)  
- `server/src/shared/casinoSessions.js` (new)  
- `server/src/shared/casinoStats.js` (new)  
- `server/src/shared/casinoService.js` (rewritten registry)  
- `server/src/functions/economyFollowOn.js` (handlers)  
- `server/src/shared/economyFormulas.js` (limits / wheel tiers)  
- `server/scripts/test-casino.mjs` (rewritten)

## 26. Database / migration files changed

- Runtime `CREATE TABLE IF NOT EXISTS` for `casino_sessions` and `casino_stats` (no separate migration file; auto-ensured on import)

## 27. Assets added or changed

- No new texture assets; functional neon UI + wheel redraw with v2 segment sizes

## 28. Automated test results

```
npm run test:casino
21 passed, 0 failed
```

Covers limits, rounding, dice/wheel/refining/cache resolvers, settle idempotency, retired 410, sessions, reconnect board, and large statistical sims.

## 29. Statistical simulation results

| Game | Result |
|------|--------|
| Galactic Dice totals | ≈ 15/36, 6/36, 15/36 within 2% (N=36k) |
| Wheel segments + RTP | Segments within 1.5%; RTP ≈ 90% (N=100k) |
| Refining cumulative reach | ≈ 40/16/6.5/2.5/1% within 1.2% (N=80k) |
| Cache cargo + RTP | ≈ 4/6, 1/6, 1/6; RTP ≈ 50% (N=60k) |

## 30. Editor test results

Not run in this session (Godot editor manual pass still required on target machine).

## 31. Exported staging_client test results

Not run in this session.

## 32–33. Existing / new account test results

Not run against Hetzner in this session. Local Node integration covered by automated tests with temp DB.

## 34. Reconnect and timeout-recovery results

- Automated: cache active session visible via `GetCasinoState`; action idempotent replay  
- Automated: settle recover returns same dice  
- Godot: recover path wired for ambiguous status 0 (manual E2E pending)

## 35. Security test results

- Client seed / payout_mult rejected  
- Retired routes 410  
- Session ownership checks in `CasinoSessionAction`  
- Production debug seeds not accepted (`assertCasinoClientSafe`)  
- Full multi-device overspend stress: not separately load-tested here (ledger debit remains authoritative)

## 36. Windows installer / connectivity regression results

No installer, TLS, routing, or release config changes. Regression assumed preserved; confirm on next staging export.

## 37. Remaining visual-polish work

- Full set of 20+ refining volatility animations (hooks present; placeholders only)  
- Polished crate art / crystal VFX  
- Web dice skip control (Godot has Skip)  
- Optional shared quick-bet styling pass vs Godot

## 38. Remaining launch blockers

- Manual Godot editor + exported `staging_client` E2E on Hetzner  
- Deploy Node build with new session/stats tables to staging/production  
- Confirm no leftover admin/debug UI still calling legacy `dice`/`wheel`/`flip`/`jackpot` in tools outside Casino page  
- Optional: quarantine tooling if any pre-v2 unfinished wallet rows need review (none found in schema)

---

### Non-complete checklist (honest)

| Requirement | Status |
|-------------|--------|
| Old games inaccessible from Casino UI | Done |
| Node authoritative | Done |
| Godot cannot choose outcomes | Done |
| No double debit/payout (idempotent keys) | Done (automated) |
| Crystal sessions persist | Done |
| Attempt 1 not guaranteed | Done |
| Cache board before select | Done |
| Wheel visuals match probs | Done |
| Stardust max 50× SD/F | Done |
| Nova 100–1000 | Done |
| Floor payouts | Done |
| Required buttons present | Done (Godot + web) |
| Installer/auth untouched | Done |
| Manual editor / export / Hetzner E2E | **Pending** |
