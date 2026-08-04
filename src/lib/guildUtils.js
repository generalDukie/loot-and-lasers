import { api } from "@/api/gameClient";

// Fetch the guild membership record for a character (if any).
// Called from many pages on mount + on each mission/arena contribution; rapid
// bursts trip the platform rate limit. A short per-character cache collapses
// near-simultaneous calls, and a single backoff retry recovers transient 429s.
const _membershipCache = new Map();
const MEMBERSHIP_TTL = 2000;

export async function getGuildMembership(characterId, { force = false } = {}) {
  const now = Date.now();
  const cached = _membershipCache.get(characterId);
  if (!force && cached && now - cached.at < MEMBERSHIP_TTL) return cached.value;
  const fetchOne = async () => {
    const members = await api.entities.GuildMember.filter({ character_id: characterId });
    return members[0] || null;
  };
  try {
    const value = await fetchOne();
    _membershipCache.set(characterId, { value, at: Date.now() });
    return value;
  } catch (err) {
    if (/rate limit/i.test(err?.message || String(err))) {
      await new Promise((r) => setTimeout(r, 700));
      const value = await fetchOne();
      _membershipCache.set(characterId, { value, at: Date.now() });
      return value;
    }
    throw err;
  }
}

// Feed a completed mission into the guild via Node ContributeGuildMission.
export async function contributeMission(character, mission) {
  const membership = await getGuildMembership(character.id);
  if (!membership) return;

  const rewards = mission.rewards || {};
  const res = await api.functions.invoke("ContributeGuildMission", {
    mission: {
      name: mission.name || "a mission",
      location: mission.location || "?",
    },
    gains: {
      experience: rewards.experience || 0,
      stardust: rewards.stardust || 0,
    },
  });
  const data = res?.data || res || {};
  if (data.error) throw new Error(data.error);
  _membershipCache.delete(character.id);
  return data;
}

// Remove a character from their guild via Node LeaveGuild.
export async function departFromGuild(characterId) {
  const membership = await getGuildMembership(characterId, { force: true });
  if (!membership) return { wasMember: false };
  const res = await api.functions.invoke("LeaveGuild", {});
  const data = res?.data || res || {};
  if (data.error) throw new Error(data.error);
  _membershipCache.delete(characterId);
  return { wasMember: true, ...data };
}

// Feed an Arena victory into the guild via Node ContributeGuildArenaWin.
export async function contributeArenaWin(character) {
  const membership = await getGuildMembership(character.id);
  if (!membership) return;
  const res = await api.functions.invoke("ContributeGuildArenaWin", {});
  const data = res?.data || res || {};
  if (data.error) throw new Error(data.error);
  return data;
}

// Add a character to a guild by guild id via Node JoinGuild.
export async function joinGuildById(character, guildId) {
  void character;
  const res = await api.functions.invoke("JoinGuild", { guild_id: guildId });
  const data = res?.data || res || {};
  if (data.error) throw new Error(data.error);
  _membershipCache.delete(character?.id);
  return { ok: true, ...data };
}

// Player requests to join an invite-only guild via Node RequestJoinGuild.
export async function requestToJoinGuild(character, guild) {
  void character;
  const res = await api.functions.invoke("RequestJoinGuild", { guild_id: guild.id });
  const data = res?.data || res || {};
  if (data.error) throw new Error(data.error);
  return data;
}

// Officer sends a personal guild invite via Node InviteGuildMember.
export async function invitePlayerToGuild(officer, guild, targetCharacter) {
  void officer;
  void guild;
  const res = await api.functions.invoke("InviteGuildMember", {
    character_id: targetCharacter.id,
  });
  const data = res?.data || res || {};
  if (data.error) throw new Error(data.error);
  return data;
}

// Player accepts a guild invite from their mail via Node AcceptGuildInvite.
export async function acceptGuildInvite(character, mail) {
  void character;
  const res = await api.functions.invoke("AcceptGuildInvite", { mail_id: mail.id });
  const data = res?.data || res || {};
  if (data.error) throw new Error(data.error);
  _membershipCache.delete(character?.id);
  return data;
}

// Officer accepts a player's join request via Node AcceptGuildRequest.
export async function acceptGuildRequest(officer, guild, mail) {
  void officer;
  void guild;
  const res = await api.functions.invoke("AcceptGuildRequest", { mail_id: mail.id });
  const data = res?.data || res || {};
  if (data.error) throw new Error(data.error);
  return data;
}

// Officer declines a join request — removes it from their inbox.
export async function declineGuildRequest(mail) {
  await api.functions.invoke("DeleteMail", { mail_id: mail.id, id: mail.id });
}
