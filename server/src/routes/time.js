/**
 * Time + schedule HTTP routes.
 */

import { requireAuth } from "../auth.js";
import { isAdmin } from "../entityAccess.js";
import {
  clock,
  DEFAULT_GAME_ZONE,
  KNOWN_ZONES,
  isValidTimeZone,
  TimeErrors,
} from "../shared/time/index.js";
import { getGameTime, recoverMissedSchedules } from "../shared/schedulerService.js";
import {
  listSchedules,
  getSchedule,
  createSchedule,
  setScheduleEnabled,
  previewOccurrences,
  listAudit,
} from "../scheduling/store.js";

const DEFAULT_AUDIT_ENTRY_LIMIT = 50;
const DEFAULT_PREVIEW_OCCURRENCE_COUNT = 5;

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
  router.get("/now", requireAuth, (_req, res) => {
    const gt = getGameTime();
    res.json({
      ...gt,
      requestReceivedAtUtc: clock.nowIso(),
      responseGeneratedAtUtc: clock.nowIso(),
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
    res.json({ audit: listAudit(Number(req.query.limit) || DEFAULT_AUDIT_ENTRY_LIMIT) });
  });

  router.post("/preview", requireAuth, (req, res) => {
    if (!adminOnly(req, res)) return;
    try {
      const body = req.body || {};
      if (body.timeZoneId && !isValidTimeZone(body.timeZoneId)) {
        return res.status(400).json({ error: "Invalid time zone", code: TimeErrors.INVALID_TIME_ZONE });
      }
      const occurrences = previewOccurrences(
        body,
        Number(body.count) || DEFAULT_PREVIEW_OCCURRENCE_COUNT,
      );
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
    const result = await recoverMissedSchedules();
    res.json({ ok: true, ...result });
  });

  router.get("/:id", requireAuth, (req, res) => {
    if (!adminOnly(req, res)) return;
    const schedule = getSchedule(req.params.id);
    if (!schedule) return res.status(404).json({ error: "Not found" });
    res.json({ schedule });
  });

  return router;
}
