import { api } from "@/api/gameClient";

const SPAM_WINDOW_MS = 10000;
const SPAM_THRESHOLD = 5;
const SPAM_MUTE_MS = 3 * 60 * 1000;

// Block sending if the character is currently muted.
export async function checkMuted(characterId) {
  const list = await api.entities.PlayerModeration.filter({ character_id: characterId });
  if (list[0]?.chat_muted_until && new Date(list[0].chat_muted_until) > new Date()) {
    throw new Error("You are temporarily silenced from sending messages.");
  }
}

// Auto-mute for 3 minutes when a character sends 5+ messages (chat + private +
// player mail) within a 10-second window. Throws after muting so the caller
// can surface the error to the user.
export async function checkSpamAndMute(characterId) {
  const since = Date.now() - SPAM_WINDOW_MS;
  const [chats, privs, mails] = await Promise.all([
    api.entities.ChatMessage.filter({ sender_id: characterId }, "-created_date", 10),
    api.entities.PrivateMessage.filter({ sender_id: characterId }, "-created_date", 10),
    api.entities.Mail.filter({ from_id: characterId, mail_type: "player" }, "-created_date", 10),
  ]);
  const countRecent = (list) => (list || []).filter((m) => new Date(m.created_date).getTime() > since).length;
  if (countRecent(chats) + countRecent(privs) + countRecent(mails) >= SPAM_THRESHOLD) {
    const mutedUntil = new Date(Date.now() + SPAM_MUTE_MS).toISOString();
    const existing = await api.entities.PlayerModeration.filter({ character_id: characterId });
    if (existing[0]) {
      await api.entities.PlayerModeration.update(existing[0].id, { chat_muted_until: mutedUntil });
    } else {
      await api.entities.PlayerModeration.create({ character_id: characterId, chat_muted_until: mutedUntil });
    }
    throw new Error("You are sending messages too fast. You have been muted for 3 minutes.");
  }
}

export function getMail(characterId, folder) {
  const query = folder === "deleted"
    ? { owner_id: characterId, folder: "deleted" }
    : { owner_id: characterId, folder };
  return api.entities.Mail.filter(query, "-created_date", 100);
}

export function getUnreadMailCount(characterId) {
  return api.entities.Mail.filter({ owner_id: characterId, read: false, folder: { $ne: "deleted" } }).then((r) => r.length);
}

export function getUnclaimedMailCount(characterId) {
  return api.entities.Mail.filter({ owner_id: characterId, has_rewards: true, claimed: false, folder: { $ne: "deleted" } }).then((r) => r.length);
}

export async function sendPlayerMail(fromChar, toCharId, toName, subject, body) {
  await checkMuted(fromChar.id);
  await checkSpamAndMute(fromChar.id);
  // Sender's sent copy
  await api.entities.Mail.create({
    owner_id: fromChar.id, from_id: fromChar.id, from_name: fromChar.name,
    to_id: toCharId, to_name: toName, subject, body, mail_type: "player",
    folder: "sent", read: true, claimed: false, has_rewards: false,
  });
  // Recipient's inbox copy
  await api.entities.Mail.create({
    owner_id: toCharId, from_id: fromChar.id, from_name: fromChar.name,
    to_id: toCharId, to_name: toName, subject, body, mail_type: "player",
    folder: "inbox", read: false, claimed: false, has_rewards: false,
  });
}

export async function claimMailReward(mailId) {
  const res = await api.functions.invoke("ClaimMailReward", { mail_id: mailId });
  return res.data;
}

export function markMailRead(mailId, read = true) {
  return api.entities.Mail.update(mailId, { read });
}

export function deleteMail(mailId) {
  return api.entities.Mail.update(mailId, { folder: "deleted" });
}

export function restoreMail(mailId) {
  return api.entities.Mail.update(mailId, { folder: "inbox" });
}