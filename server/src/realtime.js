import { verifyToken, getUserById } from "./auth.js";

const subscribers = new Set();

/** Never fan these out on wildcard subscriptions for non-admins. */
const SENSITIVE_TYPES = new Set([
  "PromoCode",
  "PrivateMessage",
  "PrivateConversation",
  "Mail",
  "PlayerModeration",
  "ModerationConfig",
]);

export function addSubscriber(ws, { entityType = "*", user = null } = {}) {
  const sub = { ws, entityType, user };
  subscribers.add(sub);
  ws.on("close", () => subscribers.delete(sub));
  return sub;
}

function subscriberMayReceive(sub, entityType) {
  if (!sub.user) return false;
  if (sub.user.role === "admin") return true;

  if (sub.entityType === "*") {
    return !SENSITIVE_TYPES.has(entityType);
  }
  if (sub.entityType !== entityType) return false;
  // Explicit subscribe to a sensitive type: only allow for own-adjacent reads is hard
  // without entity graph; require admin for those channels.
  if (SENSITIVE_TYPES.has(entityType)) return false;
  return true;
}

export function broadcastEntity(entityType, eventType, data) {
  const payload = JSON.stringify({
    entity: entityType,
    type: eventType,
    data,
  });
  for (const sub of subscribers) {
    if (sub.ws.readyState !== 1) continue;
    if (!subscriberMayReceive(sub, entityType)) continue;
    try {
      sub.ws.send(payload);
    } catch {
      subscribers.delete(sub);
    }
  }
}

/** Authenticate a WS upgrade token; returns user or null. */
export function userFromWsToken(token) {
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload?.sub) return null;
  return getUserById(payload.sub);
}
