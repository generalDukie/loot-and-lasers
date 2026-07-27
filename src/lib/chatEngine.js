import { api } from "@/api/gameClient";

const GLOBAL_LIMIT = 50;

// ── Global Chat ──

export function loadGlobal() {
  return api.entities.ChatMessage.list("-created_date", GLOBAL_LIMIT);
}

export function subscribeGlobal(callback) {
  return api.entities.ChatMessage.subscribe((event) => {
    callback(event);
  });
}

export async function sendGlobal(content) {
  const res = await api.functions.invoke("SendMessage", { channel: "global", content });
  return res.data;
}

// ── Private Chat ──

export async function getConversations(characterId) {
  const all = await api.entities.PrivateConversation.list("-last_message_at", 200);
  return all.filter((c) => (c.participant_ids || []).includes(characterId));
}

export function getMessages(conversationId) {
  return api.entities.PrivateMessage.filter({ conversation_id: conversationId }, "-created_date", 50);
}

export function subscribePrivate(conversationId, callback) {
  return api.entities.PrivateMessage.subscribe((event) => {
    const cid = event.data?.conversation_id;
    if (cid === conversationId) callback(event);
  });
}

export function subscribeConversations(callback) {
  return api.entities.PrivateConversation.subscribe(callback);
}

export async function sendPrivate(recipientId, content) {
  const res = await api.functions.invoke("SendMessage", { channel: "private", recipient_id: recipientId, content });
  return res.data;
}

export async function markConversationRead(conversationId, myCharId) {
  await api.entities.PrivateMessage.updateMany(
    { conversation_id: conversationId, recipient_id: myCharId, read_by_recipient: false },
    { $set: { read_by_recipient: true } }
  );
  // Clear related notifications
  const notifs = await api.entities.AppNotification.filter({ owner_id: myCharId, type: "private_message", related_id: conversationId, read: false });
  await Promise.all(notifs.map((n) => api.entities.AppNotification.update(n.id, { read: true })));
}