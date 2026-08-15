import { api } from "@/api/gameClient";
import { listNotifications, markRead } from "@/lib/notificationEngine";

const GLOBAL_MESSAGE_LIMIT = 50;
const PRIVATE_MESSAGE_LIMIT = 50;
const CONVERSATION_LIST_LIMIT = 200;
const UNREAD_NOTIFICATION_LIMIT = 100;

function unwrap(res) {
  return res?.data && typeof res.data === "object" ? { ...res, ...res.data } : res || {};
}

// ── Global Chat ──

export async function loadGlobal() {
  const res = unwrap(await api.functions.invoke("GetChatHistory", {
    channel: "global",
    limit: GLOBAL_MESSAGE_LIMIT,
  }));
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
  const all = await api.entities.PrivateConversation.list("-last_message_at", CONVERSATION_LIST_LIMIT);
  return all.filter((c) => (c.participant_ids || []).includes(characterId));
}

export async function getMessages(conversationId) {
  const res = unwrap(
    await api.functions.invoke("GetChatHistory", {
      channel: "private",
      conversation_id: conversationId,
      limit: PRIVATE_MESSAGE_LIMIT,
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
  const notifs = (await listNotifications({
    unreadOnly: true,
    limit: UNREAD_NOTIFICATION_LIMIT,
  })).filter(
    (n) => n.type === "private_message" && n.related_id === conversationId,
  );
  await Promise.all(notifs.map((n) => markRead(n.id).catch(() => {})));
}
