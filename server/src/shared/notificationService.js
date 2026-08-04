/**
 * AppNotification service (Restoration 22).
 * Node owns create / read / dismiss. Clients display and request state changes.
 * Gameplay must not depend on delivery success.
 */
import { entities } from "../entities.js";
import { clock } from "./time/clock.js";
import { ACHIEVEMENT_DEFINITIONS } from "./achievements.js";

/** Recovered categories used by UI TYPE_META + server writers. */
export const NOTIFICATION_TYPES = Object.freeze([
  "friend_request",
  "private_message",
  "mail",
  "chat_mention",
  "daily",
  "system",
  "stat_points",
  "achievement",
  "arena_defense",
  "arena",
  "mission",
  "mining",
  "dungeon",
  "shop",
  "fuel",
  "reward",
  "warning",
  "error",
  "maintenance",
]);

export const NOTIFICATION_PRIORITIES = Object.freeze(["critical", "high", "normal", "low"]);

/** Types clients may request via CreateNotification RPC (social/guild). */
export const CLIENT_CREATABLE_TYPES = Object.freeze([
  "friend_request",
  "system",
  "mail",
]);

const TITLE_MAX = 120;
const BODY_MAX = 500;

function httpErr(status, message, code) {
  const e = new Error(message);
  e.status = status;
  e.code = code || "NOTIFICATION_ERROR";
  throw e;
}

function normalizeType(type) {
  const t = String(type || "system").trim().toLowerCase() || "system";
  if (!NOTIFICATION_TYPES.includes(t)) return "system";
  return t;
}

function normalizePriority(priority) {
  const p = String(priority || "normal").trim().toLowerCase();
  return NOTIFICATION_PRIORITIES.includes(p) ? p : "normal";
}

function serializeNotification(doc) {
  if (!doc) return null;
  const expiresAt = doc.expires_at || null;
  const expired = expiresAt ? Date.parse(expiresAt) <= clock.nowMs() : false;
  const dismissed = !!doc.dismissed;
  return {
    id: doc.id,
    owner_id: doc.owner_id,
    type: doc.type || "system",
    title: doc.title || "",
    body: doc.body || "",
    related_id: doc.related_id || null,
    priority: doc.priority || "normal",
    read: !!doc.read || dismissed || expired,
    dismissed,
    expires_at: expiresAt,
    expired,
    created_date: doc.created_date,
    updated_date: doc.updated_date,
  };
}

function isExpired(doc) {
  if (!doc?.expires_at) return false;
  const t = Date.parse(doc.expires_at);
  return Number.isFinite(t) && t <= clock.nowMs();
}

/**
 * Authoritative create. Idempotent when idempotency_key is set
 * (dedupe by owner_id + idempotency_key among recent rows).
 */
export function createNotification({
  owner_id,
  type = "system",
  title,
  body = "",
  related_id = null,
  priority = "normal",
  expires_at = null,
  idempotency_key = null,
  persist = true,
} = {}) {
  const ownerId = String(owner_id || "").trim();
  if (!ownerId) httpErr(400, "owner_id required", "NOTIFICATION_OWNER_REQUIRED");
  if (!persist) {
    return { ephemeral: true, notification: null };
  }

  const ntype = normalizeType(type);
  const ttl = String(title || "").trim().slice(0, TITLE_MAX);
  if (!ttl) httpErr(400, "title required", "NOTIFICATION_TITLE_REQUIRED");
  const bdy = String(body || "").trim().slice(0, BODY_MAX);
  const key = idempotency_key ? String(idempotency_key).slice(0, 128) : null;

  if (key) {
    const existing = entities.AppNotification.filter({
      owner_id: ownerId,
      idempotency_key: key,
    });
    if (Array.isArray(existing) && existing.length) {
      return { replay: true, notification: serializeNotification(existing[0]) };
    }
  }

  const doc = entities.AppNotification.create({
    owner_id: ownerId,
    type: ntype,
    title: ttl,
    body: bdy,
    related_id: related_id != null ? String(related_id) : null,
    priority: normalizePriority(priority),
    expires_at: expires_at || null,
    idempotency_key: key,
    read: false,
    dismissed: false,
  });
  return { replay: false, notification: serializeNotification(doc) };
}

/** Safe wrapper — never throws into gameplay settlement. */
export function tryCreateNotification(opts) {
  try {
    return createNotification(opts);
  } catch (err) {
    console.error("[notifications] create failed:", err?.message || err);
    return { error: err?.message || String(err), notification: null };
  }
}

export function notifyAchievementsUnlocked(characterId, newlyUnlocked = []) {
  const ids = Array.isArray(newlyUnlocked) ? newlyUnlocked : [];
  const created = [];
  for (const achId of ids) {
    const def = ACHIEVEMENT_DEFINITIONS.find((d) => d.id === achId);
    const name = def?.name || achId;
    const titleReward = def?.title ? ` Title: ${def.title}.` : "";
    const result = tryCreateNotification({
      owner_id: characterId,
      type: "achievement",
      title: "Achievement unlocked!",
      body: `${name}.${titleReward}`.trim(),
      related_id: achId,
      priority: "high",
      idempotency_key: `achievement:${characterId}:${achId}`,
    });
    if (result.notification) created.push(result.notification);
  }
  return created;
}

export function listNotifications(ownerId, {
  unreadOnly = false,
  limit = 50,
  includeExpired = false,
} = {}) {
  const owner = String(ownerId || "").trim();
  if (!owner) return [];
  const lim = Math.min(100, Math.max(1, Math.floor(Number(limit) || 50)));
  const query = { owner_id: owner };
  if (unreadOnly) query.read = false;
  let rows = entities.AppNotification.filter(query, "-created_date", lim * 2) || [];
  if (!Array.isArray(rows)) rows = [];
  const out = [];
  for (const doc of rows) {
    if (doc.dismissed) continue;
    if (!includeExpired && isExpired(doc)) continue;
    if (unreadOnly && (doc.read || isExpired(doc))) continue;
    out.push(serializeNotification(doc));
    if (out.length >= lim) break;
  }
  return out;
}

export function getUnreadCounts(ownerId) {
  const rows = listNotifications(ownerId, { unreadOnly: true, limit: 100 });
  const counts = { total: rows.length };
  for (const t of NOTIFICATION_TYPES) counts[t] = 0;
  for (const n of rows) {
    counts[n.type] = (counts[n.type] || 0) + 1;
  }
  return counts;
}

export function markNotificationRead(ownerId, notificationId) {
  const id = String(notificationId || "").trim();
  if (!id) httpErr(400, "id required");
  const doc = entities.AppNotification.get(id);
  if (!doc) httpErr(404, "Notification not found");
  if (String(doc.owner_id) !== String(ownerId)) {
    httpErr(403, "Not your notification", "NOTIFICATION_FORBIDDEN");
  }
  if (doc.read && !doc.dismissed) {
    return serializeNotification(doc);
  }
  const updated = entities.AppNotification.update(id, { read: true });
  return serializeNotification(updated);
}

export function dismissNotification(ownerId, notificationId) {
  const id = String(notificationId || "").trim();
  if (!id) httpErr(400, "id required");
  const doc = entities.AppNotification.get(id);
  if (!doc) httpErr(404, "Notification not found");
  if (String(doc.owner_id) !== String(ownerId)) {
    httpErr(403, "Not your notification", "NOTIFICATION_FORBIDDEN");
  }
  const updated = entities.AppNotification.update(id, {
    read: true,
    dismissed: true,
  });
  return serializeNotification(updated);
}

export function markAllNotificationsRead(ownerId) {
  const owner = String(ownerId || "").trim();
  if (!owner) httpErr(400, "owner_id required");
  const unread = entities.AppNotification.filter({ owner_id: owner, read: false }) || [];
  let updated = 0;
  for (const doc of unread) {
    if (doc.dismissed) continue;
    entities.AppNotification.update(doc.id, { read: true });
    updated += 1;
  }
  return { updated, counts: getUnreadCounts(owner) };
}

export function assertNotificationClientSafe(body = {}) {
  if (!body || typeof body !== "object") return;
  for (const k of ["read", "dismissed", "owner_id", "created_date"]) {
    // owner_id allowed only on create path separately
    if (k === "owner_id") continue;
    if (Object.prototype.hasOwnProperty.call(body, k) && body[k] != null && k !== "read") {
      /* mark endpoints set read server-side */
    }
  }
  if (body.forge_achievement || body.newly_unlocked) {
    httpErr(400, "Client may not forge achievement notifications", "NOTIFICATION_CLIENT_AUTHORITY_REJECTED");
  }
}

export {
  serializeNotification,
  isExpired,
};
