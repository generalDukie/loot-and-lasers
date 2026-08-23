/**
 * Guild membership authority (Restoration 23).
 * Does not invent banks/progression — restores join/leave/invite/kick/permissions.
 * CreateGuild / DeclareGuildWar remain in economyFollowOn.js.
 */
import { entities } from "../entities.js";
import { createOwnedMail } from "./mailService.js";
import { tryCreateNotification } from "./notificationService.js";
import { simulateBattle } from "./combatEngine.js";
import { clock, getWeekKey, weekEndUtc } from "./time/index.js";
import { secureRandom } from "../rewards/rng.js";

export const GUILD_MAX_MEMBERS = 50;
const RANK_PRIORITY = { officer: 2, member: 1 };
const GUILD_MEMBER_QUERY_LIMIT = 200;
const GUILD_LOG_CLEANUP_LIMIT = 5_000;
const GUILD_WAR_QUERY_LIMIT = 500;
const PENDING_GUILD_INVITE_QUERY_LIMIT = 5;
const PENDING_GUILD_REQUEST_QUERY_LIMIT = 20;
const GUILD_REQUEST_HISTORY_LIMIT = 50;
const GUILD_STARTING_XP_REQUIREMENT = 1_000;
const GUILD_XP_REQUIREMENT_GROWTH = 1.4;
const NEXUS_GUILD_XP_MULTIPLIER = 1.05;
const GUILD_LEVELS_PER_CHALLENGE_TIER = 3;
const CHALLENGE_GOAL_PER_MEMBER = 5;
const MISSION_GUILD_XP_SHARE = 0.5;
const WAR_READY_QUERY_LIMIT = 200;
const WAR_FIGHTER_EQUIPMENT_LIMIT = 20;
const WAR_REWARD_BASE = 80;
const WAR_REWARD_PER_FIGHTER = 15;
const WAR_REWARD_SCALE = 10;
const WAR_REWARD_GUILD_XP_SHARE = 0.8;
const RIVAL_WAR_REWARD_BASE = 120;
const RIVAL_WAR_REWARD_PER_LEVEL = 25;
const RIVAL_FIELD_MAX_LENGTH = 64;
const RIVAL_EVENT_LIMIT = 50;
const DEFAULT_GUILD_LEADERBOARD_LIMIT = 50;
const MAX_GUILD_LEADERBOARD_LIMIT = 100;
const DEFAULT_NEARBY_GUILD_RADIUS = 5;
const MAX_NEARBY_GUILD_RADIUS = 25;

function httpErr(status, message, code) {
  const e = new Error(message);
  e.status = status;
  e.code = code || "GUILD_ERROR";
  throw e;
}

function membershipOf(characterId) {
  return entities.GuildMember.filter({ character_id: characterId }, null, 1)[0] || null;
}

/** Membership-only lookup for callers that do not need to hydrate a guild roster. */
export function getGuildMembership(characterId) {
  return membershipOf(characterId);
}

function canInvite(role) {
  return role === "leader" || role === "officer";
}

function canKick(actorRole, targetRole) {
  if (actorRole === "leader") return targetRole !== "leader";
  if (actorRole === "officer") return targetRole === "member";
  return false;
}

export function getMyGuildState(characterId) {
  const membership = membershipOf(characterId);
  if (!membership) return { membership: null, guild: null, members: [] };
  const guild = entities.Guild.get(membership.guild_id) || null;
  const members = hydrateGuildMembers(
    entities.GuildMember.filter(
      { guild_id: membership.guild_id },
      null,
      GUILD_MEMBER_QUERY_LIMIT,
    ) || [],
  );
  return { membership, guild, members };
}

/** Keep GuildMember.character_level in sync with live Character.level. */
export function syncGuildMemberFromCharacter(character) {
  if (!character?.id) return null;
  const membership = membershipOf(character.id);
  if (!membership) return null;
  const nextLevel = Math.max(1, Number(character.level) || 1);
  const nextName = character.name || membership.character_name;
  if (
    Number(membership.character_level || 0) === nextLevel &&
    String(membership.character_name || "") === String(nextName || "")
  ) {
    return membership;
  }
  return entities.GuildMember.update(membership.id, {
    character_level: nextLevel,
    character_name: nextName,
  });
}

export function hydrateGuildMembers(members) {
  return (members || []).map((m) => {
    if (!m?.character_id) return m;
    const ch = entities.Character.get(m.character_id);
    if (!ch) return m;
    const nextLevel = Math.max(1, Number(ch.level) || 1);
    const nextName = ch.name || m.character_name;
    if (
      Number(m.character_level || 0) === nextLevel &&
      String(m.character_name || "") === String(nextName || "")
    ) {
      return m;
    }
    try {
      return entities.GuildMember.update(m.id, {
        character_level: nextLevel,
        character_name: nextName,
      });
    } catch {
      return { ...m, character_level: nextLevel, character_name: nextName };
    }
  });
}

export function joinGuild(character, guildId) {
  const gid = String(guildId || "").trim();
  if (!gid) httpErr(400, "Missing guild_id");
  if (membershipOf(character.id)) httpErr(409, "Already in a guild");
  const guild = entities.Guild.get(gid);
  if (!guild) httpErr(404, "Guild not found");
  if ((guild.member_count || 0) >= GUILD_MAX_MEMBERS) httpErr(400, "That guild is full.");
  if (guild.invite_only) httpErr(403, "This guild is invite-only.");

  const member = entities.GuildMember.create({
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
  const updatedGuild = entities.Guild.update(guild.id, {
    member_count: (guild.member_count || 1) + 1,
  });
  entities.GuildLog.create({
    guild_id: guild.id,
    entry_type: "join",
    message: "joined the guild",
    character_name: character.name,
  });
  return { success: true, member, guild: updatedGuild };
}

export function leaveGuild(character) {
  const membership = membershipOf(character.id);
  if (!membership) httpErr(404, "Not in a guild");
  const guild = entities.Guild.get(membership.guild_id);
  if (!guild) {
    entities.GuildMember.delete(membership.id);
    return { success: true, guildDeleted: false };
  }
  const members =
    entities.GuildMember.filter({ guild_id: guild.id }, null, GUILD_MEMBER_QUERY_LIMIT) || [];
  const remaining = members.filter((m) => m.id !== membership.id);

  if (remaining.length === 0) {
    entities.GuildMember.delete(membership.id);
    for (const log of entities.GuildLog.filter(
      { guild_id: guild.id },
      null,
      GUILD_LOG_CLEANUP_LIMIT,
    ) || []) {
      entities.GuildLog.delete(log.id);
    }
    for (const w of entities.GuildWarReady.filter(
      { guild_id: guild.id },
      null,
      GUILD_WAR_QUERY_LIMIT,
    ) || []) {
      entities.GuildWarReady.delete(w.id);
    }
    for (const w of entities.GuildWar.filter(
      { attacker_guild_id: guild.id },
      null,
      GUILD_WAR_QUERY_LIMIT,
    ) || []) {
      entities.GuildWar.delete(w.id);
    }
    for (const w of entities.GuildWar.filter(
      { defender_guild_id: guild.id },
      null,
      GUILD_WAR_QUERY_LIMIT,
    ) || []) {
      entities.GuildWar.delete(w.id);
    }
    entities.Guild.delete(guild.id);
    return { success: true, guildDeleted: true };
  }

  if (membership.role === "leader") {
    const next = [...remaining].sort((a, b) => {
      const rankDiff = (RANK_PRIORITY[b.role] || 0) - (RANK_PRIORITY[a.role] || 0);
      if (rankDiff !== 0) return rankDiff;
      const lvlDiff = (b.character_level || 1) - (a.character_level || 1);
      if (lvlDiff !== 0) return lvlDiff;
      return new Date(a.joined_date || 0) - new Date(b.joined_date || 0);
    })[0];
    entities.GuildMember.update(next.id, { role: "leader" });
    entities.Guild.update(guild.id, {
      leader_id: next.character_id,
      leader_name: next.character_name,
      member_count: remaining.length,
    });
    entities.GuildLog.create({
      guild_id: guild.id,
      entry_type: "leave",
      message: `departed — leadership passed to ${next.character_name}`,
      character_name: membership.character_name,
    });
  } else {
    entities.Guild.update(guild.id, { member_count: remaining.length });
    entities.GuildLog.create({
      guild_id: guild.id,
      entry_type: "leave",
      message: "left the guild",
      character_name: membership.character_name,
    });
  }
  entities.GuildMember.delete(membership.id);
  return { success: true, guildDeleted: false };
}

export function inviteToGuild(officerChar, targetCharacterId) {
  const membership = membershipOf(officerChar.id);
  if (!membership) httpErr(400, "Not in a guild");
  if (!canInvite(membership.role)) httpErr(403, "Officers only");
  const guild = entities.Guild.get(membership.guild_id);
  if (!guild) httpErr(404, "Guild not found");
  const targetId = String(targetCharacterId || "").trim();
  const target = entities.Character.get(targetId);
  if (!target) httpErr(404, "Player not found");
  if (membershipOf(target.id)) httpErr(409, "That player is already in a guild.");
  if ((guild.member_count || 0) >= GUILD_MAX_MEMBERS) httpErr(400, "That guild is full.");

  const pending =
    entities.Mail.filter(
      {
        owner_id: target.id,
        mail_type: "guild_invite",
        guild_id: guild.id,
        folder: "inbox",
      },
      null,
      PENDING_GUILD_INVITE_QUERY_LIMIT,
    ) || [];
  if (pending.length) httpErr(409, "An invitation has already been sent to this player.");

  const mail = createOwnedMail({
    owner_id: target.id,
    from_id: officerChar.id,
    from_name: officerChar.name,
    to_id: target.id,
    to_name: target.name,
    subject: `Guild Invitation: ${guild.name}`,
    body: `${officerChar.name} has invited you to join ${guild.name}.`,
    mail_type: "guild_invite",
    guild_id: guild.id,
  });
  return { success: true, mail };
}

export function acceptGuildInvite(character, mailId) {
  const mail = entities.Mail.get(mailId);
  if (!mail) httpErr(404, "Invite not found");
  if (mail.owner_id !== character.id) httpErr(403, "Not your mail");
  if (mail.mail_type !== "guild_invite") httpErr(400, "Not a guild invite");
  if (mail.folder === "deleted") httpErr(409, "Invite no longer available");
  if (membershipOf(character.id)) httpErr(409, "Already in a guild");
  const guild = entities.Guild.get(mail.guild_id);
  if (!guild) httpErr(404, "Guild not found");
  if ((guild.member_count || 0) >= GUILD_MAX_MEMBERS) httpErr(400, "That guild is full.");

  const member = entities.GuildMember.create({
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
  entities.Guild.update(guild.id, { member_count: (guild.member_count || 1) + 1 });
  entities.GuildLog.create({
    guild_id: guild.id,
    entry_type: "join",
    message: "accepted a guild invitation",
    character_name: character.name,
  });
  entities.Mail.update(mail.id, { folder: "deleted", read: true });
  return { success: true, member, guild: entities.Guild.get(guild.id) };
}

export function requestToJoinGuild(character, guildId) {
  const gid = String(guildId || "").trim();
  const guild = entities.Guild.get(gid);
  if (!guild) httpErr(404, "Guild not found");
  if ((guild.member_count || 0) >= GUILD_MAX_MEMBERS) httpErr(400, "That guild is full.");
  if (membershipOf(character.id)) httpErr(409, "Already in a guild");

  const pending =
    entities.Mail.filter(
      { from_id: character.id, mail_type: "guild_request", folder: "inbox" },
      null,
      PENDING_GUILD_REQUEST_QUERY_LIMIT,
    ) || [];
  if (pending.length) {
    httpErr(409, "You already have a pending guild request.");
  }

  const members = entities.GuildMember.filter(
    { guild_id: guild.id },
    null,
    GUILD_MEMBER_QUERY_LIMIT,
  ) || [];
  const recipients = members.filter((m) => m.role === "leader" || m.role === "officer");
  if (!recipients.length) httpErr(400, "No officers found to receive your request.");

  const subject = `Guild Join Request: ${guild.name}`;
  const body = `${character.name} (Level ${character.level || 1}, ${character.race || "Unknown"}) is requesting to join ${guild.name}.`;
  const mails = [];
  for (const r of recipients) {
    mails.push(
      createOwnedMail({
        owner_id: r.character_id,
        from_id: character.id,
        from_name: character.name,
        to_id: r.character_id,
        to_name: r.character_name,
        subject,
        body,
        mail_type: "guild_request",
        guild_id: guild.id,
      }),
    );
  }
  return { success: true, mails };
}

export function acceptGuildRequest(character, guildId, requesterId) {
  const membership = membershipOf(character.id);
  if (!membership) httpErr(400, "Not in a guild");
  if (!canInvite(membership.role)) httpErr(403, "Officers only");
  if (membership.guild_id !== guildId && guildId) {
    const guild = entities.Guild.get(membership.guild_id);
    if (!guild) httpErr(404, "Guild not found");
  }
  const guild = entities.Guild.get(membership.guild_id);
  if (!guild) httpErr(404, "Guild not found");
  const targetId = String(requesterId || "").trim();
  const target = entities.Character.get(targetId);
  if (!target) httpErr(404, "Requesting player not found");
  if (membershipOf(target.id)) httpErr(409, "That player is already in a guild.");
  if ((guild.member_count || 0) >= GUILD_MAX_MEMBERS) httpErr(400, "That guild is full.");

  const member = entities.GuildMember.create({
    guild_id: guild.id,
    character_id: target.id,
    character_name: target.name,
    character_level: target.level,
    character_race: target.race,
    role: "member",
    contributed_missions: 0,
    contributed_stardust: 0,
    joined_date: new Date().toISOString(),
  });
  entities.Guild.update(guild.id, { member_count: (guild.member_count || 1) + 1 });
  entities.GuildLog.create({
    guild_id: guild.id,
    entry_type: "join",
    message: "was accepted into the guild",
    character_name: target.name,
  });

  const requests =
    entities.Mail.filter(
      { guild_id: guild.id, mail_type: "guild_request", from_id: target.id, folder: "inbox" },
      null,
      GUILD_REQUEST_HISTORY_LIMIT,
    ) || [];
  for (const r of requests) entities.Mail.update(r.id, { folder: "deleted", read: true });

  createOwnedMail({
    owner_id: target.id,
    from_id: character.id,
    from_name: character.name,
    to_id: target.id,
    to_name: target.name,
    subject: `Request Accepted: ${guild.name}`,
    body: `${character.name} accepted your request to join ${guild.name}. Welcome aboard!`,
    mail_type: "system",
    guild_id: guild.id,
  });

  return { success: true, member, guild: entities.Guild.get(guild.id) };
}

export function kickGuildMember(actorChar, targetCharacterId) {
  const membership = membershipOf(actorChar.id);
  if (!membership) httpErr(400, "Not in a guild");
  const targetId = String(targetCharacterId || "").trim();
  if (targetId === actorChar.id) httpErr(400, "Use leave to remove yourself");
  const targetMem = entities.GuildMember.filter(
    { guild_id: membership.guild_id, character_id: targetId },
    null,
    1,
  )[0];
  if (!targetMem) httpErr(404, "Member not found");
  if (!canKick(membership.role, targetMem.role)) httpErr(403, "Insufficient permissions");

  const guild = entities.Guild.get(membership.guild_id);
  const members =
    entities.GuildMember.filter(
      { guild_id: membership.guild_id },
      null,
      GUILD_MEMBER_QUERY_LIMIT,
    ) || [];
  entities.GuildMember.delete(targetMem.id);
  if (guild) {
    entities.Guild.update(guild.id, {
      member_count: Math.max(1, members.length - 1),
    });
    entities.GuildLog.create({
      guild_id: guild.id,
      entry_type: "kick",
      message: `was removed by ${actorChar.name}`,
      character_name: targetMem.character_name,
    });
  }
  tryCreateNotification({
    owner_id: targetId,
    type: "system",
    title: guild?.name || "Guild",
    body: "You were removed from the guild.",
    priority: "normal",
    idempotency_key: `guild_kick:${targetMem.id}`,
  });
  return { success: true };
}

// ── Weekly challenge + contribution (server authority) ─────────

const CHALLENGE_TIERS = [
  { title: "Weekly Operations", baseGoal: 20, stardust: 5000, guildXp: 600 },
  { title: "Strike Directive", baseGoal: 35, stardust: 9000, guildXp: 1000 },
  { title: "Galactic Offensive", baseGoal: 55, stardust: 15000, guildXp: 1600 },
  { title: "Apex Crusade", baseGoal: 80, stardust: 24000, guildXp: 2600 },
];

function applyGuildXpInternal(guild, xpAmount, characterName = "Challenge System") {
  if (!guild || xpAmount <= 0) return { guild, leveled: false };
  let exp = (guild.experience || 0) + xpAmount;
  let level = guild.level || 1;
  let expToNext = guild.experience_to_next || GUILD_STARTING_XP_REQUIREMENT;
  let leveled = false;
  while (exp >= expToNext) {
    exp -= expToNext;
    level += 1;
    expToNext = Math.floor(expToNext * GUILD_XP_REQUIREMENT_GROWTH);
    leveled = true;
  }
  const updated = entities.Guild.update(guild.id, {
    experience: exp,
    level,
    experience_to_next: expToNext,
  });
  if (leveled) {
    entities.GuildLog.create({
      guild_id: guild.id,
      entry_type: "levelup",
      message: `reached Guild Level ${level}!`,
      character_name: characterName,
    });
  }
  return { guild: updated, leveled, level };
}

function nexusXpMultiplier(guildId) {
  const nexus = entities.Nexus.filter({ singleton: true }, null, 1)[0];
  if (nexus && nexus.owner_guild_id === guildId) return NEXUS_GUILD_XP_MULTIPLIER;
  return 1;
}

export function ensureWeeklyChallenge(character) {
  const membership = membershipOf(character.id);
  if (!membership) httpErr(400, "Not in a guild");
  const guild = entities.Guild.get(membership.guild_id);
  if (!guild) httpErr(404, "Guild not found");

  const active =
    entities.GuildChallenge.filter(
      { guild_id: guild.id, status: "active" },
      "-created_date",
      1,
    )[0] || null;
  if (active) return { challenge: active, created: false, guild };

  const weekKey = getWeekKey();
  const existing =
    entities.GuildChallenge.filter({ guild_id: guild.id, week_key: weekKey }, null, 1)[0] ||
    null;
  if (existing) return { challenge: existing, created: false, guild };

  const challenge = createChallengeRow(guild);
  return { challenge, created: true, guild };
}

function createChallengeRow(guild) {
  const tierIdx = Math.min(
    CHALLENGE_TIERS.length - 1,
    Math.floor((guild.level || 1) / GUILD_LEVELS_PER_CHALLENGE_TIER),
  );
  const tier = CHALLENGE_TIERS[tierIdx];
  const membersN = Math.max(1, guild.member_count || 1);
  return entities.GuildChallenge.create({
    guild_id: guild.id,
    week_key: getWeekKey(),
    title: tier.title,
    goal: tier.baseGoal + membersN * CHALLENGE_GOAL_PER_MEMBER,
    progress: 0,
    status: "active",
    reward_stardust: tier.stardust,
    reward_guild_xp: tier.guildXp,
    ends_at: weekEndUtc().toISOString(),
  });
}

function addChallengeProgressForGuild(guild, amount = 1) {
  let challenge =
    entities.GuildChallenge.filter(
      { guild_id: guild.id, status: "active" },
      "-created_date",
      1,
    )[0] || null;
  if (!challenge) {
    const weekKey = getWeekKey();
    challenge =
      entities.GuildChallenge.filter({ guild_id: guild.id, week_key: weekKey }, null, 1)[0] ||
      null;
  }
  if (!challenge) {
    challenge = createChallengeRow(guild);
  }
  if (challenge.status !== "active") {
    return { challenge, completed: false, reward_stardust: 0 };
  }
  const goal = challenge.goal || 1;
  const newProgress = (challenge.progress || 0) + amount;
  const completed = newProgress >= goal;
  const updated = entities.GuildChallenge.update(challenge.id, {
    progress: completed ? goal : newProgress,
    ...(completed ? { status: "completed" } : {}),
  });
  if (completed) {
    applyGuildXpInternal(guild, challenge.reward_guild_xp || 0, "Challenge System");
  }
  return {
    challenge: updated,
    completed,
    reward_stardust: completed ? challenge.reward_stardust || 0 : 0,
  };
}

export function contributeGuildMission(character, mission = {}, gains = {}) {
  const membership = membershipOf(character.id);
  if (!membership) return { success: true, skipped: true };
  const guild = entities.Guild.get(membership.guild_id);
  if (!guild) return { success: true, skipped: true };

  const stardust = Math.max(0, Math.floor(Number(gains.stardust) || 0));
  const xp = Math.max(0, Math.floor(Number(gains.experience) || 0));
  const xpMult = nexusXpMultiplier(guild.id);
  const guildXpGain = Math.floor(xp * MISSION_GUILD_XP_SHARE * xpMult);

  let newExp = (guild.experience || 0) + guildXpGain;
  let level = guild.level || 1;
  let expToNext = guild.experience_to_next || GUILD_STARTING_XP_REQUIREMENT;
  let leveled = false;
  while (newExp >= expToNext) {
    newExp -= expToNext;
    level += 1;
    expToNext = Math.floor(expToNext * GUILD_XP_REQUIREMENT_GROWTH);
    leveled = true;
  }

  const updatedGuild = entities.Guild.update(guild.id, {
    experience: newExp,
    level,
    experience_to_next: expToNext,
    total_missions: (guild.total_missions || 0) + 1,
    total_stardust: (guild.total_stardust || 0) + stardust,
  });
  const updatedMember = entities.GuildMember.update(membership.id, {
    contributed_missions: (membership.contributed_missions || 0) + 1,
    contributed_stardust: (membership.contributed_stardust || 0) + stardust,
    character_level: character.level || 1,
  });

  entities.GuildLog.create({
    guild_id: guild.id,
    entry_type: "mission",
    message: `completed "${mission.name || "a mission"}" at ${mission.location || "?"}`,
    character_name: character.name,
    amount: stardust,
  });
  if (leveled) {
    entities.GuildLog.create({
      guild_id: guild.id,
      entry_type: "levelup",
      message: `reached Guild Level ${level}!`,
      character_name: character.name,
    });
  }

  const ch = addChallengeProgressForGuild(updatedGuild, 1);
  if (ch.completed && ch.reward_stardust) {
    entities.GuildLog.create({
      guild_id: guild.id,
      entry_type: "levelup",
      message: `Weekly Challenge complete! +${ch.reward_stardust} SD bonus (claim pending)`,
      character_name: character.name,
    });
  }

  return {
    success: true,
    guild: entities.Guild.get(guild.id),
    membership: updatedMember,
    challenge: ch.challenge,
    challenge_completed: ch.completed,
    reward_stardust: ch.reward_stardust,
  };
}

export function contributeGuildArenaWin(character) {
  const membership = membershipOf(character.id);
  if (!membership) return { success: true, skipped: true };
  const guild = entities.Guild.get(membership.guild_id);
  if (!guild) return { success: true, skipped: true };

  entities.GuildLog.create({
    guild_id: guild.id,
    entry_type: "arena",
    message: "won an Arena duel",
    character_name: character.name,
  });

  const ch = addChallengeProgressForGuild(guild, 1);
  if (ch.completed && ch.reward_stardust) {
    entities.GuildLog.create({
      guild_id: guild.id,
      entry_type: "levelup",
      message: `Weekly Challenge complete! +${ch.reward_stardust} SD bonus (claim pending)`,
      character_name: character.name,
    });
  }

  return {
    success: true,
    guild: entities.Guild.get(guild.id),
    challenge: ch.challenge,
    challenge_completed: ch.completed,
    reward_stardust: ch.reward_stardust,
  };
}

/** Leader-only cosmetic/recruiting settings — never experience/economy fields. */
export function updateGuildSettings(character, patch = {}) {
  const membership = membershipOf(character.id);
  if (!membership || membership.role !== "leader") {
    httpErr(403, "Only the guild leader can change settings");
  }
  const guild = entities.Guild.get(membership.guild_id);
  if (!guild) httpErr(404, "Guild not found");
  const next = {};
  if (Object.prototype.hasOwnProperty.call(patch, "recruiting")) {
    next.recruiting = !!patch.recruiting;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "public_listing")) {
    next.public_listing = !!patch.public_listing;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "invite_only")) {
    next.invite_only = !!patch.invite_only;
  }
  if (Object.keys(next).length === 0) httpErr(400, "No allowed settings to update");
  return { success: true, guild: entities.Guild.update(guild.id, next) };
}

export function toggleGuildWarReady(character, warId) {
  const membership = membershipOf(character.id);
  if (!membership) httpErr(400, "Not in a guild");
  const war = entities.GuildWar.get(String(warId || "").trim());
  if (!war) httpErr(404, "War not found");
  if (war.status !== "readying") httpErr(409, "War is not accepting ready marks");
  const side =
    war.attacker_guild_id === membership.guild_id
      ? "attacker"
      : war.defender_guild_id === membership.guild_id
        ? "defender"
        : null;
  if (!side) httpErr(403, "Not a participant in this war");

  const existing =
    entities.GuildWarReady.filter(
      { war_id: war.id, character_id: character.id },
      null,
      1,
    )[0] || null;
  if (existing) {
    entities.GuildWarReady.delete(existing.id);
    return { success: true, ready: false };
  }
  entities.GuildWarReady.create({
    war_id: war.id,
    guild_id: membership.guild_id,
    character_id: character.id,
    character_name: character.name,
    character_level: character.level || 1,
    side,
  });
  return { success: true, ready: true };
}

function loadWarFighters(warId, side) {
  const readies =
    entities.GuildWarReady.filter({ war_id: warId, side }, null, WAR_READY_QUERY_LIMIT) || [];
  const fighters = [];
  for (const r of readies) {
    const cid = String(r.character_id || "");
    if (!cid || cid.startsWith("smoke-bot-")) continue;
    const ch = entities.Character.get(cid);
    if (!ch) continue;
    const items =
      entities.Item.filter(
        { character_id: cid, is_equipped: true },
        null,
        WAR_FIGHTER_EQUIPMENT_LIMIT,
      ) || [];
    fighters.push({ character: ch, items, ready: r });
  }
  fighters.sort((a, b) => (b.character.level || 1) - (a.character.level || 1));
  return fighters;
}

function simulateGauntlet(attackerFighters, defenderFighters) {
  const duels = [];
  let defIdx = 0;
  let attackerWon = false;
  for (let aIdx = 0; aIdx < attackerFighters.length && defIdx < defenderFighters.length; aIdx++) {
    const atk = attackerFighters[aIdx];
    while (defIdx < defenderFighters.length) {
      const def = defenderFighters[defIdx];
      const battle = simulateBattle(atk.character, def.character, atk.items || [], def.items || [], {
        rng: secureRandom,
        content: "arena",
      });
      const atkWon = battle.winner === "player";
      duels.push({
        attacker_name: atk.character.name,
        defender_name: def.character.name,
        attacker_level: atk.character.level || 1,
        defender_level: def.character.level || 1,
        winner: atkWon ? "attacker" : "defender",
        events: battle.events || [],
        playerMaxHp: battle.playerMaxHp || 0,
        opponentMaxHp: battle.opponentMaxHp || 0,
      });
      if (atkWon) defIdx += 1;
      else break;
    }
    if (defIdx >= defenderFighters.length) {
      attackerWon = true;
      break;
    }
  }
  return { duels, winner: attackerWon ? "attacker" : "defender" };
}

function computeWarRewards(totalFighters) {
  const base = (WAR_REWARD_BASE + totalFighters * WAR_REWARD_PER_FIGHTER)
    * WAR_REWARD_SCALE;
  return {
    stardust: base,
    guild_xp: Math.round(base * WAR_REWARD_GUILD_XP_SHARE),
  };
}

function bumpGuildWarRecord(guildId, won) {
  const guild = entities.Guild.get(guildId);
  if (!guild) return null;
  return entities.Guild.update(guildId, {
    war_wins: (guild.war_wins || 0) + (won ? 1 : 0),
    war_losses: (guild.war_losses || 0) + (won ? 0 : 1),
  });
}

/**
 * Resolve a readying GuildWar after the ready deadline.
 * Combat + rewards are server-authoritative (no client battle_log trust).
 */
export function resolveGuildWar(character, warId) {
  const membership = membershipOf(character.id);
  if (!membership) httpErr(400, "Not in a guild");
  const war = entities.GuildWar.get(String(warId || "").trim());
  if (!war) httpErr(404, "War not found");
  if (
    war.attacker_guild_id !== membership.guild_id &&
    war.defender_guild_id !== membership.guild_id
  ) {
    httpErr(403, "Not a participant in this war");
  }
  if (war.status === "completed") {
    return { success: true, war, replay: true };
  }
  if (war.status !== "readying") httpErr(409, "War is not resolving");
  const deadlineMs = new Date(war.ready_deadline).getTime();
  if (!Number.isFinite(deadlineMs) || clock.nowMs() < deadlineMs) {
    httpErr(409, "Ready window still open");
  }

  const attackers = loadWarFighters(war.id, "attacker");
  const defenders = loadWarFighters(war.id, "defender");
  let winnerSide;
  let duels = [];
  if (defenders.length === 0) {
    winnerSide = "attacker";
  } else if (attackers.length === 0) {
    winnerSide = "defender";
  } else {
    const gauntlet = simulateGauntlet(attackers, defenders);
    winnerSide = gauntlet.winner;
    duels = gauntlet.duels;
  }

  const rewards = computeWarRewards(attackers.length + defenders.length);
  const nowIso = new Date(clock.nowMs()).toISOString();
  const updatedWar = entities.GuildWar.update(war.id, {
    status: "completed",
    winner_side: winnerSide,
    battle_log: duels,
    resolved_at: nowIso,
    attacker_ready_count: attackers.length,
    defender_ready_count: defenders.length,
    reward_stardust: rewards.stardust,
    reward_guild_xp: rewards.guild_xp,
  });

  const winGuildId =
    winnerSide === "attacker" ? war.attacker_guild_id : war.defender_guild_id;
  bumpGuildWarRecord(war.attacker_guild_id, winnerSide === "attacker");
  bumpGuildWarRecord(war.defender_guild_id, winnerSide === "defender");
  const winGuild = entities.Guild.get(winGuildId);
  if (winGuild) applyGuildXpInternal(winGuild, rewards.guild_xp, war.initiated_by || "War System");

  entities.GuildLog.create({
    guild_id: winGuildId,
    entry_type: "war",
    message:
      winnerSide === "attacker"
        ? `defeated ${war.defender_guild_name} in a guild war`
        : `repelled ${war.attacker_guild_name}'s invasion`,
    character_name: war.initiated_by || "War System",
    amount: rewards.stardust,
  });
  try {
    entities.GalaxyNews.create({
      message:
        winnerSide === "attacker"
          ? `⚔️ ${war.attacker_guild_name} conquered ${war.defender_guild_name} in a Guild War!`
          : `🛡️ ${war.defender_guild_name} repelled ${war.attacker_guild_name}'s invasion.`,
      entry_type: winnerSide === "attacker" ? "victory" : "defeat",
      character_name: war.attacker_guild_name,
    });
  } catch {
    /* optional feed */
  }

  return {
    success: true,
    war: updatedWar,
    winner_side: winnerSide,
    battle_log: duels,
    rewards,
    replay: false,
  };
}

/**
 * Legacy rival-guild war sim settlement (power-share fight, not GuildWar rows).
 * Ignores client reward amounts; applies server XP + logs + battle history.
 */
export function applyRivalGuildWarResult(character, body = {}) {
  const membership = membershipOf(character.id);
  if (!membership) httpErr(400, "Not in a guild");
  const guild = entities.Guild.get(membership.guild_id);
  if (!guild) httpErr(404, "Guild not found");
  if (!["leader", "officer"].includes(membership.role)) {
    httpErr(403, "Officers only");
  }

  const playerWon = !!body.won;
  const rivalName = String(body.rival_name || "Rival Guild").slice(
    0,
    RIVAL_FIELD_MAX_LENGTH,
  );
  const rivalLevel = Math.max(1, Math.floor(Number(body.rival_level) || 1));
  const base = (RIVAL_WAR_REWARD_BASE + rivalLevel * RIVAL_WAR_REWARD_PER_LEVEL)
    * WAR_REWARD_SCALE;
  const rewards = playerWon
    ? { stardust: base, guild_xp: Math.round(base * WAR_REWARD_GUILD_XP_SHARE) }
    : { stardust: 0, guild_xp: 0 };

  applyGuildXpInternal(guild, rewards.guild_xp, character.name);
  bumpGuildWarRecord(guild.id, playerWon);

  const battle = entities.GuildBattle.create({
    attacker_guild_id: guild.id,
    defender_guild_id: String(body.rival_id || `rival-${Date.now()}`).slice(
      0,
      RIVAL_FIELD_MAX_LENGTH,
    ),
    attacker_guild_name: guild.name,
    defender_guild_name: rivalName,
    attacker_guild_level: guild.level || 1,
    defender_guild_level: rivalLevel,
    attacker_power: Number(body.atk_power) || 0,
    defender_power: Number(body.def_power) || 0,
    winner_side: playerWon ? "attacker" : "defender",
    events: Array.isArray(body.events) ? body.events.slice(0, RIVAL_EVENT_LIMIT) : [],
    reward_stardust: rewards.stardust,
    reward_guild_xp: rewards.guild_xp,
    initiated_by: character.name,
  });

  entities.GuildLog.create({
    guild_id: guild.id,
    entry_type: "war",
    message: playerWon
      ? `defeated ${rivalName} in a guild war`
      : `lost a guild war to ${rivalName}`,
    character_name: character.name,
    amount: rewards.stardust,
  });

  return {
    success: true,
    battle,
    rewards,
    guild: entities.Guild.get(guild.id),
  };
}

/** All guilds — no default 100-row cap (needed for global rank). */
function allGuilds() {
  return entities.Guild.filter({}, "-created_date", null) || [];
}

/**
 * Guild ladder order: level DESC → XP DESC → member_count DESC → created_date ASC → id ASC.
 * Ordinal ranks (no shared-place ties).
 */
export function compareGuildRank(a, b) {
  const ld = (Number(b?.level) || 1) - (Number(a?.level) || 1);
  if (ld !== 0) return ld;
  const xd = (Number(b?.experience) || 0) - (Number(a?.experience) || 0);
  if (xd !== 0) return xd;
  const md = (Number(b?.member_count) || 0) - (Number(a?.member_count) || 0);
  if (md !== 0) return md;
  const ca = String(a?.created_date || "");
  const cb = String(b?.created_date || "");
  if (ca !== cb) return ca.localeCompare(cb);
  return String(a?.id || "").localeCompare(String(b?.id || ""));
}

export function sortedGuilds() {
  return allGuilds().slice().sort(compareGuildRank);
}

export function publicGuildRankRow(guild, rank, { is_self = false } = {}) {
  if (!guild) return null;
  const tag = String(guild.tag || "").trim();
  return {
    rank,
    id: guild.id,
    guild_id: guild.id,
    name: guild.name || "",
    tag,
    level: guild.level || 1,
    guild_level: guild.level || 1,
    experience: guild.experience || 0,
    guild_xp: guild.experience || 0,
    experience_to_next: guild.experience_to_next || GUILD_STARTING_XP_REQUIREMENT,
    member_count: guild.member_count || 0,
    leader_id: guild.leader_id || null,
    leader_name: guild.leader_name || "",
    emblem: tag || null,
    is_self: !!is_self,
  };
}

export function listGuildLeaderboard({
  limit = DEFAULT_GUILD_LEADERBOARD_LIMIT,
  offset = 0,
  guilds = null,
} = {}) {
  const lim = Math.min(
    MAX_GUILD_LEADERBOARD_LIMIT,
    Math.max(1, Math.floor(Number(limit) || DEFAULT_GUILD_LEADERBOARD_LIMIT)),
  );
  const off = Math.max(0, Math.floor(Number(offset) || 0));
  const all = Array.isArray(guilds) ? guilds : sortedGuilds();
  return all.slice(off, off + lim).map((g, i) => publicGuildRankRow(g, off + i + 1));
}

export function computeGuildRank(guildId, guilds = null) {
  if (!guildId) return 0;
  const all = Array.isArray(guilds) ? guilds : sortedGuilds();
  const idx = all.findIndex((g) => g.id === guildId);
  return idx < 0 ? 0 : idx + 1;
}

export function getNearbyGuildEntries(
  guildId,
  { radius = DEFAULT_NEARBY_GUILD_RADIUS, guilds = null } = {},
) {
  const all = Array.isArray(guilds) ? guilds : sortedGuilds();
  const idx = guildId ? all.findIndex((g) => g.id === guildId) : -1;
  if (idx < 0) {
    return { player_guild_rank: 0, total: all.length, entries: [], radius };
  }
  const parsedRadius = Number(radius);
  const r = Math.max(
    0,
    Math.min(
      MAX_NEARBY_GUILD_RADIUS,
      Math.floor(
        Number.isFinite(parsedRadius) ? parsedRadius : DEFAULT_NEARBY_GUILD_RADIUS,
      ),
    ),
  );
  const start = Math.max(0, idx - r);
  const end = Math.min(all.length, idx + r + 1);
  const entries = all.slice(start, end).map((g, i) =>
    publicGuildRankRow(g, start + i + 1, { is_self: g.id === guildId }),
  );
  return {
    player_guild_rank: idx + 1,
    total: all.length,
    entries,
    radius: r,
  };
}
