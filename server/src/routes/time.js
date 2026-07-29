/**
 * Time + schedule HTTP routes.
 */

import { requireAuth } from "../auth.js";
import { isAdmin } from "../entityAccess.js";
import {
  clock,
  todayET,
  msUntilNextETMidnight,
  dailyPeriodInfo,
  weeklyPeriodId,
  getWeekKey,
  weekEndUtc,
  DEFAULT_GAME_ZONE,
  zonedShortName,
  KNOWN_ZONES,
  isValidTimeZone,
  TimeErrors,
} from "../shared/time/index.js";
import { getShopWindow } from "../shared/economyFormulas.js";
import {
  listSchedules,
  getSchedule,
  createSchedule,
  setScheduleEnabled,
  previewOccurrences,
  listAudit,
} from "../scheduling/store.js";
import { tickScheduler } from "../scheduling/worker.js";

function adminOnly(req, res) {
  if (!isAdmin(req.user)) {
    res.status(403).json({ error: "Admin only", code: "FORBIDDEN" });
    return false;
  }
  return true;
}

export function createTimeRouter(express) {
  const router = express.Router();

  /** Authoritative server time for client countdown sync. */
  router.get("/now", requireAuth, (req, res) => {
    const now = clock.now();
    const daily = dailyPeriodInfo({ region: "na" });
    const shop = getShopWindow(clock.nowMs());
    res.json({
      serverTimeUtc: clock.nowIso(),
      requestReceivedAtUtc: clock.nowIso(),
      responseGeneratedAtUtc: clock.nowIso(),
      gameTimeZoneId: DEFAULT_GAME_ZONE,
      gameTimeZoneLabel: zonedShortName(now, DEFAULT_GAME_ZONE),
      dailyPeriodId: daily.periodId,
      dailyPeriodKey: daily.periodKey,
      nextDailyResetAtUtc: daily.nextResetAtUtc,
      msUntilDailyReset: daily.remainingMs,
      weeklyPeriodId: weeklyPeriodId({ region: "na" }),
      weekKey: getWeekKey(),
      weekEndsAtUtc: weekEndUtc().toISOString(),
      shopWindow: {
        idx: shop.idx,
        startsAtUtc: new Date(shop.startsAt).toISOString(),
        endsAtUtc: new Date(shop.endsAt).toISOString(),
        secondsLeft: shop.secondsLeft,
        rotationPeriodId: `shop-rotation:global:${shop.idx}`,
      },
      // legacy helpers for existing UI
      todayET: todayET(),
      msUntilNextETMidnight: msUntilNextETMidnight(),
    });
  });

  router.get("/zones", requireAuth, (_req, res) => {
    res.json({ zones: KNOWN_ZONES, default: DEFAULT_GAME_ZONE });
  });

  return router;
}

export function createScheduleRouter(express) {
  const router = express.Router();

  router.get("/", requireAuth, (req, res) => {
    if (!adminOnly(req, res)) return;
    res.json({ schedules: listSchedules() });
  });

  router.get("/audit", requireAuth, (req, res) => {
    if (!adminOnly(req, res)) return;
    res.json({ audit: listAudit(Number(req.query.limit) || 50) });
  });

  router.post("/preview", requireAuth, (req, res) => {
    if (!adminOnly(req, res)) return;
    try {
      const body = req.body || {};
      if (body.timeZoneId && !isValidTimeZone(body.timeZoneId)) {
        return res.status(400).json({ error: "Invalid time zone", code: TimeErrors.INVALID_TIME_ZONE });
      }
      const occurrences = previewOccurrences(body, Number(body.count) || 5);
      res.json({ occurrences });
    } catch (err) {
      res.status(400).json({ error: err.message, code: err.code || TimeErrors.INVALID_RECURRENCE });
    }
  });

  router.post("/", requireAuth, (req, res) => {
    if (!adminOnly(req, res)) return;
    try {
      const body = req.body || {};
      if (!body.key) return res.status(400).json({ error: "key required" });
      if (body.timeZoneId && !isValidTimeZone(body.timeZoneId)) {
        return res.status(400).json({ error: "Invalid time zone", code: TimeErrors.INVALID_TIME_ZONE });
      }
      const schedule = createSchedule(body, req.user.email || req.user.id);
      res.status(201).json({ schedule });
    } catch (err) {
      res.status(400).json({ error: err.message, code: err.code || "SCHEDULE_ERROR" });
    }
  });

  router.post("/:id/pause", requireAuth, (req, res) => {
    if (!adminOnly(req, res)) return;
    const schedule = setScheduleEnabled(req.params.id, false, req.user.email || req.user.id);
    if (!schedule) return res.status(404).json({ error: "Not found" });
    res.json({ schedule });
  });

  router.post("/:id/resume", requireAuth, (req, res) => {
    if (!adminOnly(req, res)) return;
    const schedule = setScheduleEnabled(req.params.id, true, req.user.email || req.user.id);
    if (!schedule) return res.status(404).json({ error: "Not found" });
    res.json({ schedule });
  });

  router.post("/tick", requireAuth, async (req, res) => {
    if (!adminOnly(req, res)) return;
    const result = await tickScheduler();
    res.json(result);
  });

  router.get("/:id", requireAuth, (req, res) => {
    if (!adminOnly(req, res)) return;
    const schedule = getSchedule(req.params.id);
    if (!schedule) return res.status(404).json({ error: "Not found" });
    res.json({ schedule });
  });

  return router;
}
