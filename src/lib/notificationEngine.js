import { api } from "@/api/gameClient";

const UNREAD_NOTIFICATION_LIMIT = 100;
const DEFAULT_NOTIFICATION_LIMIT = 50;
const LEGACY_STAT_NOTIFICATION_CLEANUP_LIMIT = 80;

/** Unread badge counts — Node GetNotifications. */
export async function getUnreadCounts(_characterId) {
  const res = await api.functions.invoke("GetNotifications", {
    unread_only: true,
    limit: UNREAD_NOTIFICATION_LIMIT,
  });
  return res?.counts || { total: 0 };
}

const localAlertListeners = new Set();

/** Optimistic UI ping for the notification bell (toasts → bell). */
export function emitLocalAlert(payload) {
  for (const cb of localAlertListeners) {
    try { cb(payload); } catch {}
  }
}

export function subscribeLocalAlerts(callback) {
  localAlertListeners.add(callback);
  return () => localAlertListeners.delete(callback);
}

export function subscribeNotifications(characterId, callback) {
  return api.entities.AppNotification.subscribe((event) => {
    if (event.data?.owner_id === characterId) callback(event);
  });
}

export async function listNotifications({ unreadOnly = false, limit = DEFAULT_NOTIFICATION_LIMIT } = {}) {
  const res = await api.functions.invoke("GetNotifications", {
    unread_only: unreadOnly,
    limit,
  });
  return Array.isArray(res?.notifications) ? res.notifications : [];
}

export function markRead(id) {
  return api.functions.invoke("MarkNotificationRead", { id });
}

/**
 * Persist a notification via Node CreateNotification (social whitelist).
 * Floating toasts must NOT call this — use emitLocalAlert only.
 */
export function pushNotification({ owner_id, type = "system", title, body, related_id, idempotency_key }) {
  return api.functions.invoke("CreateNotification", {
    owner_id,
    type,
    title,
    body,
    related_id,
    idempotency_key,
  });
}

export function markAllReadByType(characterId, type) {
  // Full mark-all then clients refilter — type-scoped update-many retired.
  void characterId;
  void type;
  return api.functions.invoke("MarkAllNotificationsRead", {});
}

export function markAllRead() {
  return api.functions.invoke("MarkAllNotificationsRead", {});
}

export function dismissNotification(id) {
  return api.functions.invoke("DismissNotification", { id });
}

// Legacy helper — free attribute points were removed (Stardust sink).
export async function syncStatPointsNotification(character) {
  if (!character?.id) return;
  try {
    const list = await listNotifications({ limit: LEGACY_STAT_NOTIFICATION_CLEANUP_LIMIT });
    await Promise.all(
      list
        .filter((n) => n.type === "stat_points" && !n.read)
        .map((n) => markRead(n.id).catch(() => {}))
    );
  } catch {
    /* ignore */
  }
}
