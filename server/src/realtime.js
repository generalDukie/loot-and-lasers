import { verifyToken, getUserById, getUserByNakamaId, gameplaySessionFromPayload } from "./auth.js";

const subscribers = new Set();

/** Never fan these out on wildcard subscriptions for non-admins. */
const SENSITIVE_TYPES = new Set([
  "PromoCode",
  "PrivateMessage",
  "PrivateConversation",
  "Mail",
  "PlayerModeration",
  "ModerationConfig",
  "User",
  "Character",
  "Item",
  "Mission",
  "DailyLogin",
  "HubLayout",
  "NovaSpendEvent",
  "StardustSpendEvent",
  "PlayerPresence",
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

export const ACCOUNT_CHARACTER_REFRESH_SOURCE_ADMIN_CURRENCY = "admin_currency";
export const ACCOUNT_CHARACTER_REFRESH_SOURCE_ADMIN_REWARD = "admin_reward";
export const ACCOUNT_CHARACTER_REFRESH_SOURCE_ADMIN_ITEM = "admin_item";
export const ACCOUNT_CHARACTER_REFRESH_SOURCE_ADMIN_SIMULATE = "admin_simulate";

/** Account-scoped event on the existing websocket transport. */
export function broadcastWalletUpdated(accountId, data) {
  if (!accountId) return;
  const payload = JSON.stringify({
    entity: "Wallet",
    type: "wallet_updated",
    data,
  });
  for (const sub of subscribers) {
    if (sub.ws.readyState !== 1 || sub.user?.id !== accountId) continue;
    try {
      sub.ws.send(payload);
    } catch {
      subscribers.delete(sub);
    }
  }
}

/**
 * Tell the live client for this account to re-fetch the granted character.
 * Admin currency/XP/item writes update storage without a wallet-bridge receipt,
 * so the HUD stays stale until the operative is reselected unless we fan this out.
 */
export function broadcastAccountCharacterRefresh(accountId, characterId, source) {
  if (!accountId || !characterId) return;
  broadcastWalletUpdated(accountId, {
    character_id: characterId,
    source,
    force_reconcile: true,
    type: "wallet_updated",
  });
}

/** Close live sockets for an account — used when a newer login claims the session. */
export function kickAccountSessions(accountId, { reason = "session_replaced", message = "Signed in elsewhere on this server. Please log in again." } = {}) {
  if (!accountId) return 0;
  const payload = JSON.stringify({
    entity: "Auth",
    type: "session_kicked",
    data: { reason, message },
  });
  let kicked = 0;
  for (const sub of subscribers) {
    if (sub.user?.id !== accountId) continue;
    kicked += 1;
    try {
      if (sub.ws.readyState === 1) {
        sub.ws.send(payload);
      }
      sub.ws.close(4403, reason);
    } catch {
      /* ignore */
    }
    subscribers.delete(sub);
  }
  return kicked;
}

/** Authenticate a WS upgrade token; returns user or null. */
export function userFromWsToken(token) {
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload?.sub) return null;
  if (payload.token_use === "nakama_gameplay") {
    const resolved = gameplaySessionFromPayload(payload);
    return resolved.ok ? resolved.user : null;
  }
  return getUserById(payload.sub);
}
