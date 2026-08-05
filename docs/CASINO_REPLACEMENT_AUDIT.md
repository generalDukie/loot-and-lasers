# Casino Replacement Audit

Date: 2026-08-05  
Scope: Replace Nebula Casino with four finalized Node-authoritative games.

## Existing architecture

| Layer | Finding |
|-------|---------|
| Authority | Node (`CasinoSettle` / `GetCasinoState` / `RecoverCasinoWager`) — Nakama auth only |
| Registry | `dice`, `wheel` (live); `flip`, `jackpot` (sealed Nova) |
| Settlement | Atomic single-shot net-delta via `wallet_operations` |
| Sessions | **None** — no unfinished multistep model |
| Stats | No lifetime casino counters |
| Godot | Side-by-side Stardust Dice + Wheel; no tabs; `GetCasinoState`/`Recover` unused |
| Web | Parity SoT UI; same four remnant games |

## Preserve

- HTTP `/api/functions/*` + JWT gameplay path
- `wallet_operations` idempotency + currencyService ledger
- `secureRandom` / injectable RNG
- Casino page chrome, currency chips, wheel disc visual shell
- Installer / Hetzner / auth / character loading (untouched)

## Conflicts / retire

| Old | Action |
|-----|--------|
| Stardust Dice high/low even-money | Replace with Galactic Dice (2d6 Low/Seven/High) |
| Stardust Wheel (109% RTP tiers incl. 25×) | Replace odds + labels (90% RTP; Shove) |
| Crystal Flip / Jackpot | Disable permanently; remove UI access |
| Net-delta payout model | Switch to gross `FLOOR(wager×mult)` |
| Max SD bet 25× SD/F | Change to min 1× / max 50× SD/F |
| Nova max 100 + sealed | Open Nova games at 100–1000 |

## New persistence required

- `casino_sessions` table for Crystal Refining + Smuggler's Cache
- Per-character casino stats document (or JSON on Character)

## Unresolved legacy wagers

None — prior model was atomic. Historical `casino_settle` receipts retained; not reinterpreted.

---

**Implementation status:** See [`CASINO_REPLACEMENT_REPORT.md`](./CASINO_REPLACEMENT_REPORT.md). casino_v2 is implemented with automated tests green; manual editor / export / Hetzner E2E still pending.
