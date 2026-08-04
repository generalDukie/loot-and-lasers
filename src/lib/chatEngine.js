import { api } from "@/api/gameClient";
import { listNotifications, markRead } from "@/lib/notificationEngine";

const GLOBAL_LIMIT = 50;

function unwrap(res) {
  return res?.data && typeof res.data === "object" ? { ...res, ...res.data } : res || {};
}

// ── Global Chat ──

export async function loadGlobal() {
  const res = unwrap(await api.functions.invoke("GetChatHistory", { channel: "global", limit: GLOBAL_LIMIT }));
  return Array.isArray(res.messages) ? res.messages : [];
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

export async function getMessages(conversationId) {
  const res = unwrap(
    await api.functions.invoke("GetChatHistory", {
      channel: "private",
      conversation_id: conversationId,
      limit: 50,
    }),
  );
  return Array.isArray(res.messages) ? res.messages : [];
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
  void myCharId;
  await api.functions.invoke("MarkConversationRead", { conversation_id: conversationId });
  const notifs = (await listNotifications({ unreadOnly: true, limit: 100 })).filter(
    (n) => n.type === "private_message" && n.related_id === conversationId,
  );
  await Promise.all(notifs.map((n) => markRead(n.id).catch(() => {})));
}
