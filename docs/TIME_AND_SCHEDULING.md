# Time & Scheduling

## Why UTC

Authoritative game moments (mission end, mail expiry, shop windows, claim eligibility) are absolute instants. Store and compare them as UTC ISO-8601 strings ending in `Z` (or with an explicit numeric offset on write APIs). Device clocks and browser time zones never decide eligibility.

## When to use an IANA time zone

Use a named zone (`America/New_York`, `Europe/London`, …) only when a schedule is tied to **local wall-clock** time:

- Daily reset at midnight Eastern
- Weekly reset Monday 00:00 Eastern
- Admin-configured recurring maintenance at 2:00 a.m. Chicago

Do **not** store `EST`/`CST`/`PST` or fixed offsets like `UTC-5` as the schedule identity — those break across DST.

## Absolute time vs wall-clock time

| Concept | Storage | Example |
|--------|---------|---------|
| Absolute | UTC ISO on the row | `mission.end_time = 2026-08-01T18:30:00.000Z` |
| Wall-clock recurrence | local time + IANA zone + recurrence | daily `00:00` + `America/New_York` |

Durations (mission length, fuel mounts) are elapsed milliseconds from a server start instant — not “same local time tomorrow.”

## Clock policy

- Primary authority: application `clock` in `server/src/shared/time/clock.js`
- Prefer `clock.nowIso()` / `clock.nowMs()` in business logic
- SQLite stores TEXT ISO UTC from `nowIso()` (`server/src/db.js`)
- Keep host OS clocks NTP-synced; do not mix unsynchronized DB `CURRENT_TIMESTAMP` with app clock for claims

Fake clock for tests: `installFakeClock(ms)` / `resetClockState()`.

## Daily / weekly periods

- Daily quotas: `America/New_York` calendar date → `daily:na:YYYY-MM-DD`
- Weekly: Monday 00:00 America/New_York → `weekly:na:{mondayDate}` and display `YYYY-Www`
- Clients may show ET countdowns via `/api/time/now`; server revalidates on claim

## Shop rotations

Absolute UTC epoch windows of 6 hours (`getShopWindow`). Period id: `shop-rotation:global:{idx}`. Delayed workers do not redefine the window — request-time math uses `clock.nowMs()`.

## Missions

1. Server clamps duration (30–7200s) and applies server-side reductions  
2. Stores `start_time` / `end_time` UTC  
3. Claim requires `clock.nowMs() >= end_time`  
4. Client countdown from server timestamps is display-only  

## Mail

`expires_at` is UTC. Claim path rejects after expiry even if the sweep worker is late. Sweep schedule: `mail-expiry-sweep` (03:15 ET daily).

## DST policies (defaults)

- Ambiguous local time (fall back): **earlier** occurrence  
- Nonexistent local time (spring forward): **next_valid**  
- Missed runs: **latest_only** with `maximumCatchUpRuns` (default 3)

## Occurrence idempotency

`occurrence_id = schedule:{scheduleId}:{scheduledAtUtc}` is unique. Duplicate workers / redelivery complete once.

## APIs

- `GET /api/time/now` — serverTimeUtc, daily/weekly/shop period ids  
- `GET /api/time/zones` — known IANA list  
- Admin ` /api/schedules/*` — list, preview, create, pause, resume, tick, audit  

## Worker

In-process durable scanner (no Redis required):

```bash
npm run server
# SCHEDULE_TICK_MS=15000 (default)
```

Tables auto-create in SQLite: `schedules`, `schedule_occurrences`, `schedule_audit`.

## Frontend display

`src/lib/gameTime.js` stores a server offset from `/api/time/now` (synced in `GameLayout`). Use `estimateServerNowMs()` for countdowns only. Never submit client “now” as completion proof.

## Adding a schedule

1. Register a handler in `server/src/scheduling/handlers.js`  
2. Create via admin Schedules tab or `createSchedule({ key, localTime, timeZoneId, recurrence, handlerKey, ... })`  
3. Preview occurrences before enabling  

## Time-zone database

Zone rules come from the Node/ICU `Intl` data bundled with the runtime. Upgrade Node to pick up IANA updates. Do not hard-code future offsets.

## Tests

```bash
npm run test:time
```

## Legacy notes

- Existing entity timestamps were already ISO UTC TEXT — treated as absolute  
- Weekly keys previously used pure UTC ISO weeks; game systems now use ET Monday weeks  
- No player trade system / feature-flag store in repo yet — `eventWindows.js` is ready for UTC windows when those land  
- Crafting timers not present — use mission pattern (server start + absolute end) when added  
