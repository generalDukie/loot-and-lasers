import { api } from "@/api/gameClient";

export async function getUnreadCounts(characterId) {
  const all = await api.entities.AppNotification.filter({ owner_id: characterId, read: false });
  const counts = {
    friend_request: 0, private_message: 0, mail: 0, chat_mention: 0, daily: 0, system: 0, stat_points: 0, total: all.length,
  };
  all.forEach((n) => { counts[n.type] = (counts[n.type] || 0) + 1; });
  return counts;
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

export function markRead(id) {
  return api.entities.AppNotification.update(id, { read: true });
}

// Create an in-app notification shown in the bottom-right NotificationCenter
// (blue bell). Prefer this over floating toasts for game feedback — toast()
// also routes here while a character is active.
export function pushNotification({ owner_id, type = "system", title, body, related_id }) {
  return api.entities.AppNotification.create({ owner_id, type, title, body, related_id });
}

export function markAllReadByType(characterId, type) {
  return api.entities.AppNotification.updateMany(
    { owner_id: characterId, type, read: false },
    { $set: { read: true } }
  );
}

// Legacy helper — free attribute points were removed (Stardust sink).
// Clears any leftover "stat_points" notifications.
export async function syncStatPointsNotification(character) {
  if (!character?.id) return;
  let existing = [];
  try {
    const all = await api.entities.AppNotification.filter({ owner_id: character.id }, "-created_date", 80);
    existing = (all || []).filter((n) => n.type === "stat_points");
  } catch (e) {
    return;
  }
  await Promise.all(
    existing.filter((n) => !n.read).map((n) => api.entities.AppNotification.update(n.id, { read: true }).catch(() => {}))
  );
}
