/**
 * Shared scheduler façade (Restoration 21).
 * Authoritative clock = shared/time/clock. Recurring jobs = scheduling/*.
 * Gameplay daily/weekly eligibility remains claim-time via todayET / getWeekKey —
 * midnight markers do not mass-mutate Characters (would duplicate claim-time resets).
 */
import { clock } from "./time/clock.js";
import {
  todayET,
  getWeekKey,
  dailyPeriodInfo,
  weeklyPeriodId,
  weekEndUtc,
  msUntilNextETMidnight,
  DEFAULT_GAME_ZONE,
  zonedShortName,
} from "./time/index.js";
import { getShopWindow } from "./economyFormulas.js";

/** Registry of period-aware systems (documentation + optional marker hooks). */
const DAILY_HOOKS = new Map();
const WEEKLY_HOOKS = new Map();

/**
 * Register an idempotent daily period hook.
 * Hooks receive { periodId, periodKey, nowMs, scheduledAtUtc } and must NOT
 * invent new gameplay counters — prefer claim-time rollover.
 */
export function registerDailyHook(key, fn) {
  DAILY_HOOKS.set(key, fn);
}

export function registerWeeklyHook(key, fn) {
  WEEKLY_HOOKS.set(key, fn);
}

export function listDailyHooks() {
  return [...DAILY_HOOKS.keys()];
}

export function listWeeklyHooks() {
  return [...WEEKLY_HOOKS.keys()];
}

/** Authoritative game time payload (same shape as GET /api/time/now). */
export function getGameTime(nowMs = clock.nowMs()) {
  const now = new Date(nowMs);
  const daily = dailyPeriodInfo({ region: "na", now });
  const shop = getShopWindow(nowMs);
  return {
    serverTimeUtc: new Date(nowMs).toISOString(),
    gameTimeZoneId: DEFAULT_GAME_ZONE,
    gameTimeZoneLabel: zonedShortName(now, DEFAULT_GAME_ZONE),
    todayET: todayET(now),
    dailyPeriodId: daily.periodId,
    dailyPeriodKey: daily.periodKey,
    nextDailyResetAtUtc: daily.nextResetAtUtc,
    msUntilDailyReset: daily.remainingMs,
    msUntilNextETMidnight: msUntilNextETMidnight(now),
    weeklyPeriodId: weeklyPeriodId({ region: "na", now }),
    weekKey: getWeekKey(now),
    weekEndsAtUtc: weekEndUtc(now).toISOString(),
    shopWindow: {
      idx: shop.idx,
      startsAtUtc: new Date(shop.startsAt).toISOString(),
      endsAtUtc: new Date(shop.endsAt).toISOString(),
      secondsLeft: shop.secondsLeft,
      rotationPeriodId: `shop-rotation:global:${shop.idx}`,
    },
    /** Systems that consume this clock (claim-time / absolute). */
    consumers: RECURRING_CONSUMERS,
  };
}

/**
 * Catalog of existing recurring gameplay consumers.
 * Does not invent casino daily limits or stats warehouses when absent.
 */
export const RECURRING_CONSUMERS = Object.freeze([
  {
    id: "fuel_cycle",
    kind: "rolling_24h",
    boundary: "fuel_reset_at + FUEL_CYCLE_MS",
    note: "Not ET midnight — preserve Prompt 15",
  },
  {
    id: "arena_daily",
    kind: "production_game_day",
    boundary: "productionGameDayId 19:00 UTC",
    fields: ["arena_rewarded_wins_date"],
  },
  {
    id: "dungeon_lives",
    kind: "daily_et",
    boundary: "todayET",
    fields: ["dungeon_deaths_date"],
  },
  {
    id: "daily_login",
    kind: "daily_et",
    boundary: "todayET",
    handler: "ClaimDailyLogin",
  },
  {
    id: "shop_window",
    kind: "absolute_window",
    boundary: "getShopWindow 12h ET anchors",
  },
  {
    id: "weekly_nova",
    kind: "weekly_et_monday",
    boundary: "getWeekKey",
    handler: "ClaimWeeklyNovaQuest",
  },
  {
    id: "mining",
    kind: "absolute",
    boundary: "mining_end_time",
  },
  {
    id: "dungeon_cooldown",
    kind: "absolute",
    boundary: "dungeon_cooldown_until",
  },
  {
    id: "arena_cooldown",
    kind: "absolute",
    boundary: "arena_cooldown_at + ARENA_BATTLE_COOLDOWN_MS",
  },
  {
    id: "stims",
    kind: "absolute",
    boundary: "active_buffs.expires_at",
  },
  {
    id: "casino_daily_limits",
    kind: "absent",
    note: "R18 — daily_limits null; not invented",
  },
  {
    id: "statistics_daily_warehouse",
    kind: "absent",
    note: "R19 — Arena rewarded wins only; no daily_stats table",
  },
  {
    id: "achievement_daily_weekly",
    kind: "absent",
    note: "R20 — lifetime thresholds only",
  },
]);

/**
 * Daily reset orchestrator — runs registered hooks + returns period metadata.
 * Does not wipe Character counters (claim-time systems own that).
 */
export async function executeDailyReset({
  scheduledAtUtc = null,
  nowMs = clock.nowMs(),
} = {}) {
  const info = dailyPeriodInfo({ region: "na", now: new Date(nowMs) });
  const ctx = {
    periodId: info.periodId,
    periodKey: info.periodKey,
    nowMs,
    scheduledAtUtc,
    markedAtUtc: clock.nowIso(),
  };
  const hookResults = {};
  for (const [key, fn] of DAILY_HOOKS) {
    try {
      hookResults[key] = await fn(ctx);
    } catch (err) {
      hookResults[key] = { error: err?.message || String(err) };
    }
  }
  return {
    type: "daily_reset",
    ...ctx,
    hooks: hookResults,
    consumers: RECURRING_CONSUMERS.filter((c) => c.kind === "daily_et" || c.kind === "absent"),
  };
}

export async function executeWeeklyReset({
  scheduledAtUtc = null,
  nowMs = clock.nowMs(),
} = {}) {
  const now = new Date(nowMs);
  const ctx = {
    periodId: weeklyPeriodId({ region: "na", now }),
    weekKey: getWeekKey(now),
    nowMs,
    scheduledAtUtc,
    markedAtUtc: clock.nowIso(),
  };
  const hookResults = {};
  for (const [key, fn] of WEEKLY_HOOKS) {
    try {
      hookResults[key] = await fn(ctx);
    } catch (err) {
      hookResults[key] = { error: err?.message || String(err) };
    }
  }
  return {
    type: "weekly_reset",
    ...ctx,
    hooks: hookResults,
    consumers: RECURRING_CONSUMERS.filter((c) => c.kind === "weekly_et_monday" || c.kind === "absent"),
  };
}

/** Alias — durable catch-up lives in scheduling/worker.js. */
export async function recoverMissedSchedules(opts = {}) {
  const { tickScheduler } = await import("../scheduling/worker.js");
  return tickScheduler(opts);
}

/**
 * Serialize a cooldown for Godot/web display.
 * @param {number} endsAtMs absolute end instant
 * @param {number} [nowMs]
 */
export function serializeCooldown(endsAtMs, nowMs = clock.nowMs()) {
  const ends = Number(endsAtMs) || 0;
  const now = Number(nowMs) || clock.nowMs();
  const remainingMs = Math.max(0, ends - now);
  return {
    ends_at_utc: ends > 0 ? new Date(ends).toISOString() : null,
    remaining_ms: remainingMs,
    active: remainingMs > 0,
    server_now_utc: new Date(now).toISOString(),
  };
}

export function getCooldownRemainingMs(endsAtMs, nowMs = clock.nowMs()) {
  return serializeCooldown(endsAtMs, nowMs).remaining_ms;
}

// ── Built-in marker hooks (audit / observability only) ─────────
registerDailyHook("period_marker", async (ctx) => ({
  ok: true,
  note: "Claim-time systems (arena rewarded wins use productionGameDayId; dungeon lives, daily login use todayET) on next request",
  periodId: ctx.periodId,
}));

registerWeeklyHook("period_marker", async (ctx) => ({
  ok: true,
  note: "Weekly Nova quests roll via getWeekKey on ensureWeeklyNovaState",
  weekKey: ctx.weekKey,
}));

registerDailyHook("fuel_note", async () => ({
  ok: true,
  note: "Fuel uses rolling 24h from fuel_reset_at — not ET midnight",
}));
