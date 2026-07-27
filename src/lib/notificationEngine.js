import { api } from "@/api/gameClient";

export async function getUnreadCounts(characterId) {
  const all = await api.entities.AppNotification.filter({ owner_id: characterId, read: false });
  const counts = {
    friend_request: 0, private_message: 0, mail: 0, chat_mention: 0, daily: 0, system: 0, total: all.length,
  };
  all.forEach((n) => { counts[n.type] = (counts[n.type] || 0) + 1; });
  return counts;
}

export function subscribeNotifications(characterId, callback) {
  return api.entities.AppNotification.subscribe((event) => {
    if (event.data?.owner_id === characterId) callback(event);
  });
}

export function markRead(id) {
  return api.entities.AppNotification.update(id, { read: true });
}

// Create a silent in-app notification (shown in the Notifications tab) instead
// of a screen-blocking toast. Used for low-priority ambient events like mission
// launches and discoveries.
export function pushNotification({ owner_id, type = "system", title, body, related_id }) {
  return api.entities.AppNotification.create({ owner_id, type, title, body, related_id });
}

export function markAllReadByType(characterId, type) {
  return api.entities.AppNotification.updateMany(
    { owner_id: characterId, type, read: false },
    { $set: { read: true } }
  );
}