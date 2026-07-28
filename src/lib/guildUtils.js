import { api } from "@/api/gameClient";
import { addChallengeProgress } from "@/lib/guildEngine";
import { getNexusOwnerGuildId } from "@/lib/nexusEngine";
import { GUILD_MAX_MEMBERS } from "@/lib/gameData";
import { checkMuted, checkSpamAndMute } from "@/lib/mailEngine";

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

// Feed a completed mission into the guild: adds XP/stardust to the guild,
// bumps the member's contributions, writes a shared log entry, and ticks
// the active weekly challenge.
export async function contributeMission(character, mission) {
  const membership = await getGuildMembership(character.id);
  if (!membership) return;

  const rewards = mission.rewards || {};
  const exp = rewards.experience || 0;
  const stardust = rewards.stardust || 0;

  const guild = await api.entities.Guild.get(membership.guild_id);
  // Nexus owner perk: +5% guild experience
  const ownerGuildId = await getNexusOwnerGuildId();
  const xpMult = ownerGuildId === guild.id ? 1.05 : 1;
  let newExp = (guild.experience || 0) + Math.floor(exp * 0.5 * xpMult);
  let level = guild.level || 1;
  let expToNext = guild.experience_to_next || 1000;
  let leveled = false;
  while (newExp >= expToNext) {
    newExp -= expToNext;
    level++;
    expToNext = Math.floor(expToNext * 1.4);
    leveled = true;
  }

  await api.entities.Guild.update(guild.id, {
    experience: newExp,
    level,
    experience_to_next: expToNext,
    total_missions: (guild.total_missions || 0) + 1,
    total_stardust: (guild.total_stardust || 0) + stardust,
  });

  await api.entities.GuildMember.update(membership.id, {
    contributed_missions: (membership.contributed_missions || 0) + 1,
    contributed_stardust: (membership.contributed_stardust || 0) + stardust,
    character_level: character.level,
  });

  await api.entities.GuildLog.create({
    guild_id: guild.id,
    entry_type: "mission",
    message: `completed "${mission.name}" at ${mission.location}`,
    character_name: character.name,
    amount: stardust,
  });

  if (leveled) {
    await api.entities.GuildLog.create({
      guild_id: guild.id,
      entry_type: "levelup",
      message: `reached Guild Level ${level}!`,
      character_name: character.name,
    });
  }

  // Weekly challenge progress (missions + arena wins both count)
  const ch = await addChallengeProgress(guild, 1);
  if (ch?.completed && ch.reward_stardust) {
    // TODO: grant via ClaimGuildChallengeReward / ClaimMission — Character.stardust is server-locked.
    await api.entities.GuildLog.create({
      guild_id: guild.id,
      entry_type: "levelup",
      message: `Weekly Challenge complete! +${ch.reward_stardust} ✦ bonus (claim pending)`,
      character_name: character.name,
    });
  }
}

// Rank priority for leadership succession: officer outranks member.
const RANK_PRIORITY = { officer: 2, member: 1 };

// Remove a character from their guild. If they were the leader, leadership
// passes to the next highest-ranked remaining member (officer → member,
// tiebreak by highest level, then earliest join date). Used when a character
// is deleted so the guild isn't left leaderless.
export async function departFromGuild(characterId) {
  const membership = await getGuildMembership(characterId, { force: true });
  if (!membership) return { wasMember: false };

  const [guild, members] = await Promise.all([
    api.entities.Guild.get(membership.guild_id),
    api.entities.GuildMember.filter({ guild_id: membership.guild_id }),
  ]);
  const remaining = members.filter((m) => m.id !== membership.id);

  if (remaining.length === 0) {
    // Last member leaving — delete the guild and all its related data
    await api.entities.GuildMember.delete(membership.id);
    _membershipCache.delete(characterId);
    await api.entities.GuildLog.deleteMany({ guild_id: guild.id });
    await api.entities.GuildWarReady.deleteMany({ guild_id: guild.id });
    await api.entities.GuildWar.deleteMany({ attacker_guild_id: guild.id });
    await api.entities.GuildWar.deleteMany({ defender_guild_id: guild.id });
    await api.entities.Guild.delete(guild.id);
    return { wasMember: true, guildDeleted: true };
  }

  if (membership.role === "leader") {
    const next = [...remaining].sort((a, b) => {
      const rankDiff = (RANK_PRIORITY[b.role] || 0) - (RANK_PRIORITY[a.role] || 0);
      if (rankDiff !== 0) return rankDiff;
      const lvlDiff = (b.character_level || 1) - (a.character_level || 1);
      if (lvlDiff !== 0) return lvlDiff;
      return new Date(a.joined_date || 0) - new Date(b.joined_date || 0);
    })[0];
    await api.entities.GuildMember.update(next.id, { role: "leader" });
    await api.entities.Guild.update(guild.id, {
      leader_id: next.character_id,
      leader_name: next.character_name,
      member_count: remaining.length,
    });
    await api.entities.GuildLog.create({
      guild_id: guild.id,
      entry_type: "leave",
      message: `departed — leadership passed to ${next.character_name}`,
      character_name: membership.character_name,
    });
  } else {
    await api.entities.Guild.update(guild.id, { member_count: remaining.length });
  }

  await api.entities.GuildMember.delete(membership.id);
  _membershipCache.delete(characterId);
  return { wasMember: true, transferred: membership.role === "leader" && remaining.length > 0 };
}

// Feed an Arena victory into the guild's weekly challenge.
export async function contributeArenaWin(character) {
  const membership = await getGuildMembership(character.id);
  if (!membership) return;
  const guild = await api.entities.Guild.get(membership.guild_id);

  await api.entities.GuildLog.create({
    guild_id: guild.id,
    entry_type: "arena",
    message: `won an Arena duel`,
    character_name: character.name,
  });

  const ch = await addChallengeProgress(guild, 1);
  if (ch?.completed && ch.reward_stardust) {
    // TODO: grant via ClaimGuildChallengeReward — Character.stardust is server-locked.
    await api.entities.GuildLog.create({
      guild_id: guild.id,
      entry_type: "levelup",
      message: `Weekly Challenge complete! +${ch.reward_stardust} ✦ bonus (claim pending)`,
      character_name: character.name,
    });
  }
}

// Add a character to a guild by guild id. Shared by direct join, invite
// accept, and request accept flows. Throws if the player is already in a
// guild or the guild is full.
export async function joinGuildById(character, guildId) {
  const guild = await api.entities.Guild.get(guildId);
  if (!guild) throw new Error("Guild not found.");
  const existingAny = await api.entities.GuildMember.filter({ character_id: character.id });
  if (existingAny.length) {
    if (existingAny[0].guild_id === guildId) return { ok: true, alreadyMember: true };
    throw new Error("That player is already in a guild.");
  }
  if ((guild.member_count || 0) >= GUILD_MAX_MEMBERS) throw new Error("That guild is full.");
  await api.entities.GuildMember.create({
    guild_id: guild.id,
    character_id: character.id,
    character_name: character.name,
    character_level: character.level,
    character_race: character.race,
    role: "member",
    contributed_missions: 0,
    contributed_stardust: 0,
    joined_date: new Date().toISOString(),
  });
  await api.entities.Guild.update(guild.id, { member_count: (guild.member_count || 1) + 1 });
  await api.entities.GuildLog.create({
    guild_id: guild.id,
    entry_type: "join",
    message: "joined the guild",
    character_name: character.name,
  });
  return { ok: true };
}

// Player requests to join an invite-only guild. Sends a guild_request mail
// to every officer and the leader.
export async function requestToJoinGuild(character, guild) {
  if ((guild.member_count || 0) >= GUILD_MAX_MEMBERS) throw new Error("That guild is full.");
  const existing = await api.entities.GuildMember.filter({ character_id: character.id });
  if (existing.length) throw new Error("You are already in a guild.");

  // Prevent spam: a character may only have one pending guild request at a time.
  const pending = await api.entities.Mail.filter({
    from_id: character.id,
    mail_type: "guild_request",
    folder: "inbox",
  });
  if (pending.length > 0) {
    throw new Error("You already have a pending guild request. Wait for it to be accepted or declined.");
  }

  // Muted players cannot send guild requests.
  await checkMuted(character.id);
  await checkSpamAndMute(character.id);

  const members = await api.entities.GuildMember.filter({ guild_id: guild.id });
  const recipients = members.filter((m) => m.role === "leader" || m.role === "officer");
  if (!recipients.length) throw new Error("No officers found to receive your request.");

  const subject = `Guild Join Request: ${guild.name}`;
  const body = `${character.name} (Level ${character.level || 1}, ${character.race || "Unknown"}) is requesting to join ${guild.name}.`;

  for (const r of recipients) {
    await api.entities.Mail.create({
      owner_id: r.character_id,
      from_id: character.id,
      from_name: character.name,
      to_id: r.character_id,
      to_name: r.character_name,
      subject, body,
      mail_type: "guild_request",
      folder: "inbox",
      read: false,
      claimed: false,
      has_rewards: false,
      guild_id: guild.id,
    });
    await api.entities.AppNotification.create({
      owner_id: r.character_id,
      type: "mail",
      title: character.name,
      body: `wants to join ${guild.name}`,
      read: false,
    });
  }
}

// Officer sends a personal guild invite to a player via mail.
export async function invitePlayerToGuild(officer, guild, targetCharacter) {
  const existing = await api.entities.GuildMember.filter({ character_id: targetCharacter.id });
  if (existing.length) throw new Error("That player is already in a guild.");

  // Prevent duplicate invites: only one pending invite per guild→target at a time.
  const pending = await api.entities.Mail.filter({
    owner_id: targetCharacter.id,
    mail_type: "guild_invite",
    guild_id: guild.id,
    folder: "inbox",
  });
  if (pending.length > 0) throw new Error("An invitation has already been sent to this player.");

  await api.entities.Mail.create({
    owner_id: targetCharacter.id,
    from_id: officer.id,
    from_name: officer.name,
    to_id: targetCharacter.id,
    to_name: targetCharacter.name,
    subject: `Guild Invitation: ${guild.name}`,
    body: `${officer.name} has invited you to join ${guild.name}.`,
    mail_type: "guild_invite",
    folder: "inbox",
    read: false,
    claimed: false,
    has_rewards: false,
    guild_id: guild.id,
  });
  await api.entities.AppNotification.create({
    owner_id: targetCharacter.id,
    type: "mail",
    title: officer.name,
    body: `invited you to join ${guild.name}`,
    read: false,
  });
}

// Player accepts a guild invite from their mail.
export async function acceptGuildInvite(character, mail) {
  await joinGuildById(character, mail.guild_id);
  await api.entities.Mail.update(mail.id, { folder: "deleted" });
  await api.entities.AppNotification.create({
    owner_id: mail.from_id,
    type: "system",
    title: character.name,
    body: `accepted your guild invitation`,
    read: false,
  });
}

// Officer accepts a player's join request from their mail. Adds the requester
// to the guild, cleans up request mails for all officers, and notifies the
// requester.
export async function acceptGuildRequest(officer, guild, mail) {
  const requester = await api.entities.Character.get(mail.from_id);
  if (!requester) throw new Error("Requesting player not found.");
  await joinGuildById(requester, guild.id);
  // Clean up all pending request mails for this requester in this guild.
  const allRequests = await api.entities.Mail.filter({
    guild_id: guild.id,
    mail_type: "guild_request",
    from_id: mail.from_id,
    folder: "inbox",
  });
  for (const r of allRequests) {
    await api.entities.Mail.update(r.id, { folder: "deleted" });
  }
  // Send confirmation mail to the requester.
  await api.entities.Mail.create({
    owner_id: mail.from_id,
    from_id: officer.id,
    from_name: officer.name,
    to_id: mail.from_id,
    to_name: mail.from_name,
    subject: `Request Accepted: ${guild.name}`,
    body: `${officer.name} accepted your request to join ${guild.name}. Welcome aboard!`,
    mail_type: "system",
    folder: "inbox",
    read: false,
    claimed: false,
    has_rewards: false,
    guild_id: guild.id,
  });
  await api.entities.AppNotification.create({
    owner_id: mail.from_id,
    type: "mail",
    title: guild.name,
    body: `Your join request was accepted!`,
    read: false,
  });
}

// Officer declines a join request — removes it from their inbox.
export async function declineGuildRequest(mail) {
  await api.entities.Mail.update(mail.id, { folder: "deleted" });
}