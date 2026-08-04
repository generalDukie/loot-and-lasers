import { api } from "@/api/gameClient";

function unwrap(res) {
  return res?.data && typeof res.data === "object" ? { ...res, ...res.data } : res || {};
}

// Block sending if the character is currently muted (server enforces on SendMail/SendMessage).
export async function checkMuted(_characterId) {
  // Kept for call-site compatibility; authoritative mute is on Node.
  return;
}

export async function checkSpamAndMute(_characterId) {
  // Authoritative spam mute is on Node SendMail / SendMessage.
  return;
}

export async function getMail(_characterId, folder) {
  const res = unwrap(await api.functions.invoke("GetInbox", { folder: folder || "inbox" }));
  return Array.isArray(res.mail) ? res.mail : [];
}

export async function getUnreadMailCount(_characterId) {
  const res = unwrap(await api.functions.invoke("GetInbox", { folder: "inbox", limit: 1 }));
  return Number(res.unread_count || 0);
}

export async function getUnclaimedMailCount(_characterId) {
  const res = unwrap(await api.functions.invoke("GetInbox", { folder: "inbox", limit: 1 }));
  return Number(res.unclaimed_count || 0);
}

export async function sendPlayerMail(fromChar, toCharId, toName, subject, body) {
  void fromChar;
  void toName;
  const res = unwrap(
    await api.functions.invoke("SendMail", {
      to_character_id: toCharId,
      subject,
      body,
    }),
  );
  if (res.error) throw new Error(res.error);
  return res;
}

export async function claimMailReward(mailId) {
  const res = await api.functions.invoke("ClaimMailReward", { mail_id: mailId });
  return res.data || res;
}

export async function markMailRead(mailId, read = true) {
  return api.functions.invoke("MarkMailRead", { mail_id: mailId, read });
}

export async function deleteMail(mailId) {
  return api.functions.invoke("DeleteMail", { mail_id: mailId });
}

export async function restoreMail(mailId) {
  return api.functions.invoke("RestoreMail", { mail_id: mailId });
}
