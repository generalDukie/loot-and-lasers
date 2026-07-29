/**
 * Built-in schedule handlers.
 * Heavy game mutations still happen at claim-time; handlers emit audits / markers
 * and keep period metadata fresh so delayed workers cannot invent duplicate windows.
 */

import { entities } from "../entities.js";
import { clock } from "../shared/time/clock.js";
import { dailyPeriodInfo, weeklyPeriodId, getWeekKey } from "../shared/time/periods.js";
import { getShopWindow } from "../shared/economyFormulas.js";

const handlers = new Map();

export function registerHandler(key, fn) {
  handlers.set(key, fn);
}

export function getHandler(key) {
  return handlers.get(key) || null;
}

registerHandler("daily_reset_marker", async (_schedule, occurrence) => {
  const info = dailyPeriodInfo({ region: "na" });
  return {
    type: "daily_reset",
    periodId: info.periodId,
    periodKey: info.periodKey,
    scheduledAtUtc: occurrence.scheduledAtUtc,
    markedAtUtc: clock.nowIso(),
  };
});

registerHandler("weekly_reset_marker", async (_schedule, occurrence) => {
  return {
    type: "weekly_reset",
    periodId: weeklyPeriodId({ region: "na" }),
    weekKey: getWeekKey(),
    scheduledAtUtc: occurrence.scheduledAtUtc,
    markedAtUtc: clock.nowIso(),
  };
});

registerHandler("shop_rotation_marker", async (_schedule, occurrence) => {
  const win = getShopWindow(clock.nowMs());
  return {
    type: "shop_rotation",
    rotationPeriodId: `shop-rotation:global:${win.idx}`,
    windowIdx: win.idx,
    startsAtUtc: new Date(win.startsAt).toISOString(),
    endsAtUtc: new Date(win.endsAt).toISOString(),
    scheduledAtUtc: occurrence.scheduledAtUtc,
    markedAtUtc: clock.nowIso(),
  };
});

registerHandler("mail_expiry_sweep", async () => {
  const now = clock.now();
  const mails = entities.Mail?.list?.("-created_date", 500) || [];
  let expired = 0;
  for (const mail of mails) {
    if (mail.expires_at && new Date(mail.expires_at) < now && mail.status !== "expired") {
      try {
        entities.Mail.update(mail.id, { status: "expired" });
        expired += 1;
      } catch {
        /* ignore single failures */
      }
    }
  }
  return { type: "mail_expiry_sweep", expired, markedAtUtc: clock.nowIso() };
});

registerHandler("entitlement_expiry_sweep", async () => {
  const { processExpiredEntitlements } = await import("../entitlements/service.js");
  const result = processExpiredEntitlements(100);
  return { type: "entitlement_expiry_sweep", ...result, markedAtUtc: clock.nowIso() };
});

registerHandler("noop", async () => ({ type: "noop", markedAtUtc: clock.nowIso() }));
