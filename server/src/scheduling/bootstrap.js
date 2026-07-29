/**
 * Bootstrap default schedules + high-level API helpers.
 */

import {
  createSchedule,
  getScheduleByKey,
  listSchedules,
  previewOccurrences,
} from "./store.js";
import "./handlers.js";

const DEFAULTS = [
  {
    key: "daily-reset-et",
    displayName: "Daily Reset (America/New_York midnight)",
    scheduleType: "daily_reset",
    recurrence: "daily",
    localTime: "00:00",
    timeZoneId: "America/New_York",
    missedRunPolicy: "latest_only",
    handlerKey: "daily_reset_marker",
  },
  {
    key: "weekly-reset-et",
    displayName: "Weekly Reset (Monday 00:00 ET)",
    scheduleType: "weekly_reset",
    recurrence: "weekly",
    localTime: "00:00",
    timeZoneId: "America/New_York",
    weekdays: [1],
    missedRunPolicy: "latest_only",
    handlerKey: "weekly_reset_marker",
  },
  {
    key: "mail-expiry-sweep",
    displayName: "Mail Expiry Sweep",
    scheduleType: "cleanup",
    recurrence: "daily",
    localTime: "03:15",
    timeZoneId: "America/New_York",
    missedRunPolicy: "latest_only",
    handlerKey: "mail_expiry_sweep",
  },
  {
    key: "entitlement-expiry-sweep",
    displayName: "Entitlement Expiry Sweep",
    scheduleType: "cleanup",
    recurrence: "daily",
    localTime: "03:30",
    timeZoneId: "America/New_York",
    missedRunPolicy: "latest_only",
    handlerKey: "entitlement_expiry_sweep",
  },
];

export function ensureDefaultSchedules() {
  for (const def of DEFAULTS) {
    if (!getScheduleByKey(def.key)) {
      try {
        createSchedule(def, "system");
        console.log(`[scheduler] seeded schedule ${def.key}`);
      } catch (err) {
        console.warn(`[scheduler] seed ${def.key} failed:`, err.message);
      }
    }
  }
}

export { listSchedules, previewOccurrences, getScheduleByKey };
