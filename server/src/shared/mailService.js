/**
 * Mail authority (Restoration 23).
 * ClaimMailReward stays in functions/index.js (reward pipeline).
 * This module owns inbox list/send/read/delete/expire filtering.
 */
import { entities } from "../entities.js";
import { clock } from "./time/clock.js";
import { isBlocked } from "./socialService.js";
import { tryCreateNotification } from "./notificationService.js";

const SPAM_WINDOW_MS = 10_000;
const SPAM_THRESHOLD = 5;
const SPAM_MUTE_MS = 3 * 60 * 1000;
const MAIL_COOLDOWN_MS = 2_000;
const SUBJECT_MAX = 120;
const BODY_MAX = 4000;

function httpErr(status, message, code) {
  const e = new Error(message);
  e.status = status;
  e.code = code || "MAIL_ERROR";
  throw e;
}

function assertNotMuted(characterId) {
  const mod = entities.PlayerModeration.filter({ character_id: characterId }, null, 1)[0];
  if (mod?.chat_banned) httpErr(403, "You are banned from messaging.");
  if (mod?.chat_muted_until && new Date(mod.chat_muted_until) > new Date(clock.nowMs())) {
    httpErr(403, "You are temporarily silenced from sending messages.");
  }
}

function assertSpam(characterId) {
  const sinceMs = clock.nowMs() - SPAM_WINDOW_MS;
  const recentChats = entities.ChatMessage.filter({ sender_id: characterId }, "-created_date", 10);
  const recentPrivs = entities.PrivateMessage.filter({ sender_id: characterId }, "-created_date", 10);
  const recentMails = entities.Mail.filter(
    { from_id: characterId, mail_type: "player" },
    "-created_date",
    10,
  );
  const countSince = (list) =>
    (list || []).filter((m) => new Date(m.created_date).getTime() > sinceMs).length;
  if (countSince(recentChats) + countSince(recentPrivs) + countSince(recentMails) >= SPAM_THRESHOLD) {
    const mutedUntil = new Date(clock.nowMs() + SPAM_MUTE_MS).toISOString();
    const mod = entities.PlayerModeration.filter({ character_id: characterId }, null, 1)[0];
    if (mod) entities.PlayerModeration.update(mod.id, { chat_muted_until: mutedUntil });
    else entities.PlayerModeration.create({ character_id: characterId, chat_muted_until: mutedUntil });
    httpErr(429, "You are sending messages too fast. You have been muted for 3 minutes.");
  }
}

function isExpired(mail, nowMs = clock.nowMs()) {
  if (!mail?.expires_at) return false;
  const t = Date.parse(mail.expires_at);
  return Number.isFinite(t) && t <= nowMs;
}

export function serializeMail(doc) {
  if (!doc) return null;
  const expired = isExpired(doc);
  return {
    id: doc.id,
    owner_id: doc.owner_id,
    from_id: doc.from_id || null,
    from_name: doc.from_name || "",
    to_id: doc.to_id || null,
    to_name: doc.to_name || "",
    subject: doc.subject || "",
    body: doc.body || "",
    mail_type: doc.mail_type || "player",
    folder: doc.folder || "inbox",
    read: !!doc.read,
    claimed: !!doc.claimed,
    has_rewards: !!doc.has_rewards,
    rewards: doc.has_rewards ? doc.rewards || {} : undefined,
    guild_id: doc.guild_id || null,
    expires_at: doc.expires_at || null,
    expired,
    created_date: doc.created_date,
  };
}

export function listMail(ownerId, { folder = "inbox", limit = 100 } = {}) {
  const lim = Math.max(1, Math.min(200, Number(limit) || 100));
  let rows;
  if (folder === "deleted") {
    rows = entities.Mail.filter({ owner_id: ownerId, folder: "deleted" }, "-created_date", lim) || [];
  } else {
    rows = entities.Mail.filter({ owner_id: ownerId, folder }, "-created_date", lim) || [];
  }
  const now = clock.nowMs();
  return rows.filter((m) => !isExpired(m, now) || m.has_rewards).map(serializeMail);
}

export function getUnreadMailCount(ownerId) {
  const rows =
    entities.Mail.filter({ owner_id: ownerId, read: false, folder: "inbox" }, null, 500) || [];
  const now = clock.nowMs();
  return rows.filter((m) => !isExpired(m, now)).length;
}

export function getUnclaimedMailCount(ownerId) {
  const rows =
    entities.Mail.filter(
      { owner_id: ownerId, has_rewards: true, claimed: false },
      null,
      500,
    ) || [];
  const now = clock.nowMs();
  return rows.filter((m) => m.folder !== "deleted" && !isExpired(m, now)).length;
}

export function sendPlayerMail(fromChar, toCharacterId, subject, body) {
  const toId = String(toCharacterId || "").trim();
  if (!toId) httpErr(400, "Missing recipient");
  if (toId === fromChar.id) httpErr(400, "Cannot mail yourself");
  const toChar = entities.Character.get(toId);
  if (!toChar) httpErr(404, "Recipient not found");
  if (isBlocked(toChar.id, fromChar.id)) httpErr(403, "You cannot message this player.");
  if (isBlocked(fromChar.id, toChar.id)) httpErr(403, "Unblock this player before mailing them.");

  assertNotMuted(fromChar.id);
  assertSpam(fromChar.id);

  const last = entities.Mail.filter(
    { from_id: fromChar.id, mail_type: "player" },
    "-created_date",
    1,
  )[0];
  if (last && clock.nowMs() - new Date(last.created_date).getTime() < MAIL_COOLDOWN_MS) {
    httpErr(429, "Slow down — mail cooldown active.");
  }

  const subj = String(subject || "").trim().slice(0, SUBJECT_MAX);
  const text = String(body || "").trim().slice(0, BODY_MAX);
  if (!subj) httpErr(400, "Subject required");
  if (!text) httpErr(400, "Body required");

  const sent = entities.Mail.create({
    owner_id: fromChar.id,
    from_id: fromChar.id,
    from_name: fromChar.name,
    to_id: toChar.id,
    to_name: toChar.name,
    subject: subj,
    body: text,
    mail_type: "player",
    folder: "sent",
    read: true,
    claimed: false,
    has_rewards: false,
  });
  const inbox = entities.Mail.create({
    owner_id: toChar.id,
    from_id: fromChar.id,
    from_name: fromChar.name,
    to_id: toChar.id,
    to_name: toChar.name,
    subject: subj,
    body: text,
    mail_type: "player",
    folder: "inbox",
    read: false,
    claimed: false,
    has_rewards: false,
  });
  tryCreateNotification({
    owner_id: toChar.id,
    type: "mail",
    title: fromChar.name,
    body: subj,
    related_id: inbox.id,
    priority: "normal",
    idempotency_key: `mail:${inbox.id}`,
  });
  return { sent: serializeMail(sent), inbox: serializeMail(inbox) };
}

/**
 * Server/admin system mail with optional rewards (no client create path).
 */
export function createSystemMail({
  ownerId,
  subject,
  body,
  rewards = null,
  expiresAt = null,
  mailType = "system",
  fromName = "System",
}) {
  const hasRewards = !!(rewards && Object.keys(rewards).length);
  return entities.Mail.create({
    owner_id: ownerId,
    from_id: null,
    from_name: fromName,
    to_id: ownerId,
    to_name: "",
    subject: String(subject || "").slice(0, SUBJECT_MAX),
    body: String(body || "").slice(0, BODY_MAX),
    mail_type: mailType,
    folder: "inbox",
    read: false,
    claimed: false,
    has_rewards: hasRewards,
    rewards: hasRewards ? rewards : undefined,
    expires_at: expiresAt || null,
  });
}

export function markMailRead(ownerId, mailId, read = true) {
  const mail = entities.Mail.get(mailId);
  if (!mail) httpErr(404, "Mail not found");
  if (mail.owner_id !== ownerId) httpErr(403, "Not your mail");
  const updated = entities.Mail.update(mailId, { read: !!read });
  return serializeMail(updated);
}

export function deleteMail(ownerId, mailId) {
  const mail = entities.Mail.get(mailId);
  if (!mail) httpErr(404, "Mail not found");
  if (mail.owner_id !== ownerId) httpErr(403, "Not your mail");
  const updated = entities.Mail.update(mailId, { folder: "deleted" });
  return serializeMail(updated);
}

export function restoreMail(ownerId, mailId) {
  const mail = entities.Mail.get(mailId);
  if (!mail) httpErr(404, "Mail not found");
  if (mail.owner_id !== ownerId) httpErr(403, "Not your mail");
  const updated = entities.Mail.update(mailId, { folder: "inbox" });
  return serializeMail(updated);
}

/** Guild invite / request mail helpers used by guildService. */
export function createOwnedMail(payload) {
  const doc = entities.Mail.create({
    ...payload,
    folder: payload.folder || "inbox",
    read: !!payload.read,
    claimed: false,
    has_rewards: false,
  });
  tryCreateNotification({
    owner_id: doc.owner_id,
    type: "mail",
    title: doc.from_name || "Mail",
    body: doc.subject || "",
    related_id: doc.id,
    priority: "normal",
    idempotency_key: `mail:${doc.id}`,
  });
  return serializeMail(doc);
}
