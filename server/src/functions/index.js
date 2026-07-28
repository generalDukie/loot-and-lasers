import { applyCharacterRewards, DAILY_REWARDS, redeemPromoCode, expForLevel, getStatPointsForLevelRange } from "../shared/rewards.js";
import { ACHIEVEMENTS, evaluateUnlocked } from "../shared/achievements.js";
import { createService, entities } from "../entities.js";
import { db, nowIso, withTransactionAsync } from "../db.js";
import { getUserById } from "../auth.js";
import { ECONOMY_HANDLERS } from "./economy.js";

const CYCLE_THEMES = ["Stardust Voyage", "Nebula Reckoning", "Void Ascension", "Quasar Dawn"];

function todayET() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

async function myCharacter(user) {
  const list = entities.Character.filter({ created_by_id: user.id }, "-created_date", 1);
  return list[0] || null;
}

function svc(user) {
  return createService(user);
}

export async function ClaimDailyLogin(user) {
  const character = await myCharacter(user);
  if (!character) return { status: 404, body: { error: "No character" } };

  const game = svc(user);
  const today = todayET();

  try {
    const body = await withTransactionAsync(async () => {
      const existing = entities.DailyLogin.filter({ character_id: character.id });
      let progress = existing[0];

      if (progress && progress.last_claim_date === today) {
        const err = new Error("Already claimed today");
        err.status = 409;
        err.progress = progress;
        throw err;
      }

      if (!progress) {
        progress = entities.DailyLogin.create({
          character_id: character.id,
          last_claim_date: "",
          current_day: 1,
          claimed_days: [],
          cycle_theme: CYCLE_THEMES[0],
        });
      }

      const day = progress.current_day || 1;
      const rewardEntry = DAILY_REWARDS[(day - 1)] || DAILY_REWARDS[0];

      // Claim flag first — concurrent requests hit 409 on re-read.
      const claimedDays = [...(progress.claimed_days || []), day];
      const wrapped = day >= 30;
      const nextDay = wrapped ? 1 : day + 1;
      const newTheme = wrapped
        ? CYCLE_THEMES[(CYCLE_THEMES.indexOf(progress.cycle_theme || CYCLE_THEMES[0]) + 1) % CYCLE_THEMES.length]
        : progress.cycle_theme;

      const updated = entities.DailyLogin.update(progress.id, {
        last_claim_date: today,
        current_day: nextDay,
        claimed_days: wrapped ? [] : claimedDays,
        cycle_theme: newTheme,
      });

      const { patch, items } = await applyCharacterRewards(game, character.id, rewardEntry.rewards || {});

      return {
        success: true,
        claimed_day: day,
        rewards: rewardEntry.rewards,
        applied: patch,
        items,
        progress: updated,
        wrapped,
      };
    });
    return { status: 200, body };
  } catch (err) {
    if (err.status === 409) {
      return { status: 409, body: { error: err.message, progress: err.progress } };
    }
    throw err;
  }
}

export async function ClaimMailReward(user, body) {
  const mailId = body.mail_id;
  if (!mailId) return { status: 400, body: { error: "Missing mail_id" } };

  const character = await myCharacter(user);
  if (!character) return { status: 404, body: { error: "No character" } };

  try {
    const result = await withTransactionAsync(async () => {
      const mail = entities.Mail.get(mailId);
      if (!mail) {
        const err = new Error("Mail not found");
        err.status = 404;
        throw err;
      }
      if (mail.owner_id !== character.id) {
        const err = new Error("Not your mail");
        err.status = 403;
        throw err;
      }
      if (!mail.has_rewards) {
        const err = new Error("No rewards attached");
        err.status = 400;
        throw err;
      }
      if (mail.claimed) {
        const err = new Error("Rewards already claimed");
        err.status = 409;
        throw err;
      }
      if (mail.expires_at && new Date(mail.expires_at) < new Date()) {
        const err = new Error("This mail has expired.");
        err.status = 403;
        throw err;
      }

      // Mark claimed before granting so double-submit cannot both grant.
      entities.Mail.update(mailId, { claimed: true, read: true });
      const { patch, items } = await applyCharacterRewards(svc(user), character.id, mail.rewards || {});
      return { success: true, applied: patch, items };
    });
    return { status: 200, body: result };
  } catch (err) {
    if (err.status) return { status: err.status, body: { error: err.message } };
    throw err;
  }
}

export async function RedeemPromoCode(user, body) {
  const character = await myCharacter(user);
  if (!character) return { status: 404, body: { error: "No character" } };

  const code = (body?.code || "").trim();
  if (!code) return { status: 400, body: { error: "Missing code" } };

  const game = svc(user);
  const found = entities.PromoCode.filter({ code });
  const pc = found[0];
  if (pc) {
    try {
      const result = await withTransactionAsync(async () => {
        const fresh = entities.PromoCode.get(pc.id) || pc;
        if (!fresh.active) {
          const err = new Error("This code is no longer active");
          err.status = 410;
          throw err;
        }
        const redeemedBy = fresh.redeemed_by || [];
        if (redeemedBy.includes(character.id)) {
          const err = new Error("Code already redeemed");
          err.status = 409;
          throw err;
        }
        if (fresh.max_redemptions && fresh.max_redemptions > 0 && redeemedBy.length >= fresh.max_redemptions) {
          const err = new Error("Redemption limit reached");
          err.status = 410;
          throw err;
        }
        entities.PromoCode.update(fresh.id, { redeemed_by: [...redeemedBy, character.id] });
        const { patch, items } = await applyCharacterRewards(game, character.id, fresh.rewards || {});
        return { success: true, code, label: fresh.label, patch, items };
      });
      return { status: 200, body: result };
    } catch (err) {
      if (err.status) return { status: err.status, body: { error: err.message } };
      throw err;
    }
  }

  const result = await redeemPromoCode(game, character, code);
  if (!result.ok) return { status: result.status, body: { error: result.error } };
  return { status: 200, body: { success: true, ...result } };
}

export async function SyncAchievements(user, body = {}) {
  const character = await myCharacter(user);
  if (!character) return { status: 404, body: { error: "No character" } };

  const unlocked = evaluateUnlocked(character);
  const existing = new Set(character.unlocked_achievements || []);
  const titles = new Set(character.unlocked_titles || []);
  for (const id of unlocked) {
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    if (a?.title) titles.add(a.title);
  }

  const patch = {};
  const sortArr = (arr) => [...arr].sort();
  if (JSON.stringify(sortArr(unlocked)) !== JSON.stringify(sortArr([...existing]))) {
    patch.unlocked_achievements = unlocked;
  }
  if (JSON.stringify(sortArr([...titles])) !== JSON.stringify(sortArr(character.unlocked_titles || []))) {
    patch.unlocked_titles = [...titles];
  }

  if (body.title !== undefined) {
    if (body.title === "" || titles.has(body.title)) {
      patch.active_title = body.title;
    } else {
      return { status: 403, body: { error: "Title not unlocked" } };
    }
  }

  let updated = character;
  if (Object.keys(patch).length) {
    updated = entities.Character.update(character.id, patch);
  }

  return {
    status: 200,
    body: {
      success: true,
      character: updated,
      newly_unlocked: unlocked.filter((id) => !existing.has(id)),
    },
  };
}

// ── SendMessage ──────────────────────────────────────────────
const MAX_LEN = 280;
const GLOBAL_COOLDOWN_MS = 2000;
const PRIVATE_COOLDOWN_MS = 1000;
const SPAM_WINDOW_MS = 10000;
const SPAM_THRESHOLD = 5;
const SPAM_MUTE_MS = 3 * 60 * 1000;

function applyFilter(content, words) {
  let out = content;
  for (const w of words || []) {
    if (!w) continue;
    const re = new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    out = out.replace(re, "****");
  }
  return out;
}

export async function SendMessage(user, body) {
  const channel = body.channel;
  const content = (body.content || "").toString().trim();
  const recipientId = body.recipient_id;
  if (!channel || !content) return { status: 400, body: { error: "Missing channel or content" } };
  if (content.length > MAX_LEN) return { status: 400, body: { error: "Message too long" } };

  const character = await myCharacter(user);
  if (!character) return { status: 404, body: { error: "No character found" } };

  const modList = entities.PlayerModeration.filter({ character_id: character.id });
  const mod = modList[0];
  if (mod) {
    if (mod.chat_banned) return { status: 403, body: { error: "You are banned from chat." } };
    if (mod.chat_muted_until && new Date(mod.chat_muted_until) > new Date()) {
      return { status: 403, body: { error: "You are temporarily silenced." } };
    }
  }

  const sinceMs = Date.now() - SPAM_WINDOW_MS;
  const recentChats = entities.ChatMessage.filter({ sender_id: character.id }, "-created_date", 10);
  const recentPrivs = entities.PrivateMessage.filter({ sender_id: character.id }, "-created_date", 10);
  const recentMails = entities.Mail.filter({ from_id: character.id, mail_type: "player" }, "-created_date", 10);
  const countSince = (list) => (list || []).filter((m) => new Date(m.created_date).getTime() > sinceMs).length;
  if (countSince(recentChats) + countSince(recentPrivs) + countSince(recentMails) >= SPAM_THRESHOLD) {
    const mutedUntil = new Date(Date.now() + SPAM_MUTE_MS).toISOString();
    if (mod) entities.PlayerModeration.update(mod.id, { chat_muted_until: mutedUntil });
    else entities.PlayerModeration.create({ character_id: character.id, chat_muted_until: mutedUntil });
    return { status: 429, body: { error: "You are sending messages too fast. You have been muted for 3 minutes." } };
  }

  const cfgList = entities.ModerationConfig.filter({ singleton: true });
  const filtered = applyFilter(content, cfgList[0]?.filtered_words || []);

  if (channel === "global") {
    const last = entities.ChatMessage.filter({ sender_id: character.id }, "-created_date", 1)[0];
    if (last && Date.now() - new Date(last.created_date).getTime() < GLOBAL_COOLDOWN_MS) {
      return { status: 429, body: { error: "Slow down — chat cooldown active." } };
    }
    const membership = entities.GuildMember.filter({ character_id: character.id })[0];
    let guildTag = "";
    if (membership) {
      const g = entities.Guild.get(membership.guild_id);
      guildTag = g?.tag || "";
    }
    const msg = entities.ChatMessage.create({
      sender_id: character.id,
      sender_name: character.name,
      sender_level: character.level || 1,
      sender_class: character.class,
      sender_guild_tag: guildTag,
      sender_avatar_url: character.avatar_url || "",
      content: filtered,
    }, { created_by_id: user.id, created_by: user.email });
    return { status: 200, body: { message: msg } };
  }

  if (channel === "private") {
    if (!recipientId) return { status: 400, body: { error: "Missing recipient_id" } };
    if (recipientId === character.id) return { status: 400, body: { error: "Cannot message yourself" } };
    if (entities.Block.filter({ blocker_id: recipientId, blocked_id: character.id }).length) {
      return { status: 403, body: { error: "You cannot message this player." } };
    }
    const last = entities.PrivateMessage.filter({ sender_id: character.id }, "-created_date", 1)[0];
    if (last && Date.now() - new Date(last.created_date).getTime() < PRIVATE_COOLDOWN_MS) {
      return { status: 429, body: { error: "Slow down — chat cooldown active." } };
    }

    const convs = entities.PrivateConversation.list(null, 10000);
    let conversation = convs.find((c) => {
      const p = c.participant_ids || [];
      return p.includes(character.id) && p.includes(recipientId);
    });
    if (!conversation) {
      conversation = entities.PrivateConversation.create({
        participant_ids: [character.id, recipientId],
        last_message_preview: filtered.slice(0, 80),
        last_message_at: nowIso(),
        last_sender_id: character.id,
      });
    } else {
      conversation = entities.PrivateConversation.update(conversation.id, {
        last_message_preview: filtered.slice(0, 80),
        last_message_at: nowIso(),
        last_sender_id: character.id,
      });
    }

    const msg = entities.PrivateMessage.create({
      conversation_id: conversation.id,
      sender_id: character.id,
      recipient_id: recipientId,
      content: filtered,
      read_by_recipient: false,
    });

    entities.AppNotification.create({
      owner_id: recipientId,
      type: "private_message",
      title: character.name,
      body: filtered.slice(0, 80),
      related_id: conversation.id,
      read: false,
    });

    return { status: 200, body: { message: msg, conversation_id: conversation.id } };
  }

  return { status: 400, body: { error: "Unknown channel" } };
}

// ── ResolveNexusAssault ──────────────────────────────────────
const RARITY_WEIGHT = { common: 1, uncommon: 2, rare: 4, epic: 8, legendary: 16 };
const HOLD_HOURS = 24;
const ASSAULT_COOLDOWN_MS = 30 * 60 * 1000;
const GARRISON_BASE = 1200;

function memberPower(members) {
  return (members || []).reduce((a, m) => a + ((m.character_level || 1) * 12), 0);
}
function guildUpgrades(guild) {
  return (guild.level || 1) * 80;
}
function equipmentQuality(memberIds, items) {
  const set = new Set(memberIds);
  return (items || []).filter((it) => set.has(it.character_id)).reduce((a, it) => a + (RARITY_WEIGHT[it.rarity] || 1), 0);
}
function strengthOf(guild, members, equip, participation, randomness) {
  const base = memberPower(members) + equip + guildUpgrades(guild);
  const activeBonus = Math.log2(1 + (members || []).length) * 50;
  return Math.max(1, Math.round((base + activeBonus) * participation * randomness));
}
function rand(min, max) { return min + Math.random() * (max - min); }
function daysBetween(a, b) { return Math.max(0, Math.round((new Date(b) - new Date(a)) / 86400000)); }

function buildEvents(atkName, defName, atkStrength, defStrength, attackerWon) {
  const atkShare = atkStrength / (atkStrength + defStrength);
  const ev = [];
  ev.push({ phase: "arrival", side: "attacker", emoji: "🛸", text: `${atkName}'s fleet drops out of warp above the Galactic Command Nexus.` });
  ev.push({ phase: "bombardment", side: "attacker", emoji: "💥", text: `Orbital laser batteries rain fire on ${defName}'s defensive platforms.` });
  ev.push({ phase: "turrets", side: "defender", emoji: "🛡️", text: `${defName}'s auto-turrets return fire, shredding attacker screens.` });
  if (atkShare > 0.5) ev.push({ phase: "breach", side: "attacker", emoji: "👾", text: `${atkName}'s alien assault marines breach the station corridors.` });
  else ev.push({ phase: "breach", side: "defender", emoji: "🪖", text: `${defName} repels the boarding parties at the airlock.` });
  ev.push({ phase: "explosion", side: "both", emoji: "🔥", text: `A reactor core detonates — debris and casualties on both sides!` });
  if (atkShare > 0.45) ev.push({ phase: "turning", side: "attacker", emoji: "⚡", text: `${atkName} breaks through the inner defensive ring.` });
  else ev.push({ phase: "turning", side: "defender", emoji: "🧱", text: `${defName} holds the line — the assault falters.` });
  if (attackerWon) {
    ev.push({ phase: "climax", side: "attacker", emoji: "🏁", text: `${atkName} overruns the command deck!` });
    ev.push({ phase: "victory", side: "attacker", emoji: "👑", text: `${atkName} seizes control of the Galactic Command Nexus!` });
  } else {
    ev.push({ phase: "climax", side: "defender", emoji: "🚫", text: `${atkName}'s offensive collapses under sustained fire.` });
    ev.push({ phase: "victory", side: "defender", emoji: "👑", text: `${defName} holds the Galactic Command Nexus!` });
  }
  return ev;
}

export async function ResolveNexusAssault(user, body) {
  const attackerGuildId = body.attacker_guild_id;
  const characterId = body.character_id;
  if (!attackerGuildId || !characterId) {
    return { status: 400, body: { error: "Missing attacker_guild_id or character_id" } };
  }

  const character = entities.Character.get(characterId);
  if (!character || character.created_by_id !== user.id) {
    return { status: 403, body: { error: "Character does not belong to caller" } };
  }

  const membership = entities.GuildMember.filter({ character_id: characterId })[0];
  if (!membership || membership.guild_id !== attackerGuildId || !["leader", "officer"].includes(membership.role)) {
    return { status: 403, body: { error: "Only guild leaders or officers may declare an assault" } };
  }

  const attackerGuild = entities.Guild.get(attackerGuildId);
  const attackerMembers = entities.GuildMember.filter({ guild_id: attackerGuildId });

  let nexus = entities.Nexus.filter({ singleton: true })[0];
  if (!nexus) {
    nexus = entities.Nexus.create({ singleton: true, status: "vulnerable", defense_streak: 0 });
  }

  const now = new Date();
  const nowIsoStr = now.toISOString();

  if (nexus.last_assault_at && (now - new Date(nexus.last_assault_at)) < ASSAULT_COOLDOWN_MS) {
    return { status: 409, body: { error: "The Nexus is still reeling from the last assault. Try again shortly." } };
  }

  const hasOwner = !!nexus.owner_guild_id;
  let defenderGuild = null;
  let defenderMembers = [];
  let defenderName = "Nexus Automated Garrison";
  let defenderIsGuild = false;

  if (hasOwner) {
    const heldMs = now - new Date(nexus.captured_at);
    if (heldMs < HOLD_HOURS * 3600 * 1000) {
      const hoursLeft = Math.ceil((HOLD_HOURS * 3600 * 1000 - heldMs) / 3600000);
      return { status: 409, body: { error: `The Nexus is not yet vulnerable. It can be attacked in ~${hoursLeft}h.` } };
    }
    defenderGuild = entities.Guild.get(nexus.owner_guild_id);
    defenderMembers = entities.GuildMember.filter({ guild_id: nexus.owner_guild_id });
    defenderName = defenderGuild.name;
    defenderIsGuild = true;
  }

  const allItems = entities.Item.filter({ is_equipped: true }, "-created_date", 500);
  const atkMemberIds = attackerMembers.map((m) => m.character_id);
  const defMemberIds = defenderMembers.map((m) => m.character_id);
  const atkEquip = equipmentQuality(atkMemberIds, allItems);
  const defEquip = defenderIsGuild ? equipmentQuality(defMemberIds, allItems) : 0;

  const atkStrength = strengthOf(attackerGuild, attackerMembers, atkEquip, rand(0.8, 1.0), rand(0.9, 1.1));
  const defStrength = defenderIsGuild
    ? strengthOf(defenderGuild, defenderMembers, defEquip, rand(0.8, 1.0), rand(0.9, 1.1))
    : Math.max(1, Math.round(GARRISON_BASE * rand(0.9, 1.1)));

  const atkShare = atkStrength / (atkStrength + defStrength);
  const attackerWon = Math.random() < atkShare;
  const events = buildEvents(attackerGuild.name, defenderName, atkStrength, defStrength, attackerWon);

  let ownershipChanged = false;
  let reignDays = 0;

  if (attackerWon) {
    if (defenderIsGuild) {
      reignDays = daysBetween(nexus.captured_at, nowIsoStr);
      const prevCaptures = entities.NexusHallOfFame.filter({ guild_id: defenderGuild.id }).length + 1;
      entities.NexusHallOfFame.create({
        guild_id: defenderGuild.id,
        guild_name: defenderGuild.name,
        guild_tag: defenderGuild.tag,
        leader_name: nexus.owner_guild_leader,
        captured_at: nexus.captured_at,
        lost_at: nowIsoStr,
        reign_days: reignDays,
        defenses: nexus.defense_streak || 0,
        captures: prevCaptures,
        lost_to: attackerGuild.name,
      });
    }
    entities.Nexus.update(nexus.id, {
      owner_guild_id: attackerGuild.id,
      owner_guild_name: attackerGuild.name,
      owner_guild_tag: attackerGuild.tag,
      owner_guild_leader: attackerGuild.leader_name,
      owner_member_count: attackerMembers.length,
      captured_at: nowIsoStr,
      defense_streak: 0,
      status: "controlled",
      last_assault_at: nowIsoStr,
    });
    ownershipChanged = true;
    entities.GalaxyNews.create({
      message: reignDays > 0
        ? `⚡ The Galactic Command Nexus has fallen! ${attackerGuild.name} defeated ${defenderGuild.name} after a ${reignDays}-day reign and now controls the Nexus!`
        : `⚡ ${attackerGuild.name} has captured the Galactic Command Nexus and is now recognized as the strongest guild in the galaxy!`,
      entry_type: "champion",
      character_name: attackerGuild.name,
    });
  } else {
    entities.Nexus.update(nexus.id, {
      defense_streak: (nexus.defense_streak || 0) + 1,
      last_assault_at: nowIsoStr,
      owner_member_count: defenderIsGuild ? defenderMembers.length : (nexus.owner_member_count || 0),
    });
  }

  entities.NexusAssault.create({
    attacker_guild_id: attackerGuild.id,
    attacker_guild_name: attackerGuild.name,
    attacker_guild_tag: attackerGuild.tag,
    defender_guild_id: defenderIsGuild ? defenderGuild.id : "",
    defender_guild_name: defenderName,
    attacker_strength: atkStrength,
    defender_strength: defStrength,
    winner: attackerWon ? "attacker" : "defender",
    events,
    ownership_changed: ownershipChanged,
    initiated_by: character.name,
  });

  return {
    status: 200,
    body: {
      winner: attackerWon ? "attacker" : "defender",
      events,
      attacker_strength: atkStrength,
      defender_strength: defStrength,
      defender_name: defenderName,
      ownership_changed: ownershipChanged,
      reign_days: reignDays,
      nexus: entities.Nexus.get(nexus.id),
    },
  };
}

// ── AdminModeration ──────────────────────────────────────────
export async function AdminModeration(user, body) {
  if (user.role !== "admin") return { status: 403, body: { error: "Admin only" } };
  const action = body.action;

  if (action === "mute") {
    const { character_id, minutes, reason } = body;
    const until = new Date(Date.now() + (minutes || 30) * 60000).toISOString();
    const list = entities.PlayerModeration.filter({ character_id });
    let rec = list[0];
    if (rec) rec = entities.PlayerModeration.update(rec.id, { chat_muted_until: until, notes: reason || rec.notes });
    else rec = entities.PlayerModeration.create({ character_id, chat_muted_until: until, chat_banned: false, notes: reason || "" });
    return { status: 200, body: { success: true, moderation: rec } };
  }

  if (action === "ban") {
    const { character_id, reason } = body;
    const list = entities.PlayerModeration.filter({ character_id });
    let rec = list[0];
    if (rec) rec = entities.PlayerModeration.update(rec.id, { chat_banned: true, chat_banned_reason: reason || "" });
    else rec = entities.PlayerModeration.create({ character_id, chat_banned: true, chat_banned_reason: reason || "" });
    return { status: 200, body: { success: true, moderation: rec } };
  }

  if (action === "unban" || action === "unmute") {
    const { character_id } = body;
    const list = entities.PlayerModeration.filter({ character_id });
    if (list[0]) {
      const patch = action === "unban" ? { chat_banned: false, chat_banned_reason: "" } : { chat_muted_until: null };
      const rec = entities.PlayerModeration.update(list[0].id, patch);
      return { status: 200, body: { success: true, moderation: rec } };
    }
    return { status: 200, body: { success: true } };
  }

  if (action === "delete_message") {
    const rec = entities.ChatMessage.update(body.message_id, { deleted: true, deleted_by: user.id, content: "[removed]" });
    return { status: 200, body: { success: true, message: rec } };
  }

  if (action === "edit_filter") {
    const list = entities.ModerationConfig.filter({ singleton: true });
    let rec = list[0];
    if (rec) rec = entities.ModerationConfig.update(rec.id, { filtered_words: body.words });
    else rec = entities.ModerationConfig.create({ singleton: true, filtered_words: body.words });
    return { status: 200, body: { success: true, config: rec } };
  }

  if (action === "send_system_mail") {
    const { subject, body: mailBody, rewards, recipients, expires_days } = body;
    let recipientIds = recipients || [];
    if (recipients === "all") {
      recipientIds = entities.Character.list("-created_date", 2000).map((c) => c.id);
    }
    const hasRewards = !!(rewards && Object.keys(rewards).length);
    const expiresAt = expires_days ? new Date(Date.now() + expires_days * 86400000).toISOString() : null;
    const records = recipientIds.map((rid) => ({
      owner_id: rid,
      from_id: "system",
      from_name: "Galactic Command",
      to_id: rid,
      to_name: "",
      subject: subject || "System Notice",
      body: mailBody || "",
      mail_type: "system",
      folder: "system",
      read: false,
      claimed: false,
      has_rewards: hasRewards,
      rewards: hasRewards ? rewards : undefined,
      expires_at: expiresAt,
    }));
    const created = entities.Mail.bulkCreate(records);
    return { status: 200, body: { success: true, count: created.length } };
  }

  if (action === "resolve_report") {
    const rec = entities.Report.update(body.report_id, { status: "resolved", action_taken: body.action_taken || "" });
    return { status: 200, body: { success: true, report: rec } };
  }

  if (action === "give_item") {
    const { character_id, item } = body;
    if (!item || !item.name || !item.type || !item.rarity) {
      return { status: 400, body: { error: "item requires name, type, rarity" } };
    }
    const ch = entities.Character.get(character_id);
    if (!ch) return { status: 404, body: { error: "Character not found" } };
    const created = entities.Item.create({
      ...item,
      owner_id: ch.created_by_id,
      character_id: ch.id,
      is_equipped: false,
    });
    return { status: 200, body: { success: true, item: created } };
  }

  if (action === "adjust_currency") {
    const { character_id, deltas } = body;
    const ch = entities.Character.get(character_id);
    if (!ch) return { status: 404, body: { error: "Character not found" } };
    const patch = {};
    if (deltas.stardust) {
      patch.stardust = Math.max(0, (ch.stardust || 0) + deltas.stardust);
      if (deltas.stardust > 0) patch.total_stardust_earned = (ch.total_stardust_earned || 0) + deltas.stardust;
    }
    if (deltas.nova_crystals) patch.nova_crystals = Math.max(0, (ch.nova_crystals || 0) + deltas.nova_crystals);
    if (deltas.fuel) patch.fuel = Math.max(0, Math.min(ch.max_fuel || 100, (ch.fuel || 0) + deltas.fuel));
    if (deltas.arena_attempts) {
      patch.arena_attempts_left = Math.max(0, (ch.arena_attempts_left || 0) + deltas.arena_attempts);
      patch.arena_attempts_date = todayET();
    }
    if (deltas.experience) {
      let newExp = (ch.experience || 0) + deltas.experience;
      let newLevel = ch.level || 1;
      let expToNext = ch.experience_to_next_level || expForLevel(newLevel);
      const prevLevel = newLevel;
      if (deltas.experience > 0) {
        while (newExp >= expToNext) {
          newExp -= expToNext;
          newLevel++;
          expToNext = expForLevel(newLevel);
        }
      } else {
        newExp = Math.max(0, newExp);
      }
      const statPoints = getStatPointsForLevelRange(prevLevel, newLevel);
      patch.experience = newExp;
      patch.level = newLevel;
      patch.experience_to_next_level = expToNext;
      if (statPoints > 0) patch.unspent_stat_points = (ch.unspent_stat_points || 0) + statPoints;
    }
    const updated = entities.Character.update(character_id, patch);
    return { status: 200, body: { success: true, character: updated } };
  }

  if (action === "reset_player") {
    const { character_id } = body;
    const ch = entities.Character.get(character_id);
    if (!ch) return { status: 404, body: { error: "Character not found" } };
    entities.Item.deleteMany({ character_id });
    const updated = entities.Character.update(character_id, {
      level: 1, experience: 0, experience_to_next_level: expForLevel(1),
      stardust: 0, nova_crystals: 0, unspent_stat_points: 0, attribute_purchases: 0,
      attribute_purchases_by_stat: { strength: 0, agility: 0, intellect: 0, vitality: 0, luck: 0 },
      discovered_species: [], collected_artifacts: [], collected_relics: [],
      arena_wins: 0, arena_losses: 0, arena_rating: 1000,
      arena_streak: 0, arena_max_streak: 0, arena_battles: 0,
      fuel: ch.max_fuel || 100, fuel_purchases: 0,
      equipped_items: {}, active_mission_id: "", mission_end_time: "",
      missions_completed: 0, highest_sector: 1, dungeon_clears: 0,
      highest_damage: 0, total_stardust_earned: 0,
      promo_codes_redeemed: [], active_buffs: [],
    });
    return { status: 200, body: { success: true, character: updated } };
  }

  if (action === "set_role") {
    const { character_id, role } = body;
    const ch = entities.Character.get(character_id);
    if (!ch) return { status: 404, body: { error: "Character not found" } };
    const targetRole = role === "admin" ? "admin" : "user";
    if (ch.created_by_id === user.id) {
      return { status: 400, body: { error: "You cannot change your own role" } };
    }
    db.prepare("UPDATE users SET role = ?, updated_date = ? WHERE id = ?")
      .run(targetRole, nowIso(), ch.created_by_id);
    const updated = getUserById(ch.created_by_id);
    // Keep entity mirror in sync if present
    const userEnt = entities.User.get(ch.created_by_id);
    if (userEnt) entities.User.update(ch.created_by_id, { role: targetRole });
    return { status: 200, body: { success: true, role: updated.role } };
  }

  if (action === "transfer_guild") {
    const { guild_id, new_leader_id } = body;
    const guild = entities.Guild.get(guild_id);
    if (!guild) return { status: 404, body: { error: "Guild not found" } };
    const members = entities.GuildMember.filter({ guild_id });
    const newLeaderMember = members.find((m) => m.character_id === new_leader_id);
    if (!newLeaderMember) return { status: 400, body: { error: "New leader is not a member of this guild" } };
    for (const m of members) {
      if (m.role === "leader") entities.GuildMember.update(m.id, { role: "member" });
    }
    entities.GuildMember.update(newLeaderMember.id, { role: "leader" });
    const updated = entities.Guild.update(guild_id, {
      leader_id: new_leader_id,
      leader_name: newLeaderMember.character_name,
    });
    return { status: 200, body: { success: true, guild: updated } };
  }

  if (action === "create_promo_code") {
    const cleanCode = (body.code || "").trim();
    if (!cleanCode) return { status: 400, body: { error: "Code required" } };
    if (entities.PromoCode.filter({ code: cleanCode })[0]) {
      return { status: 409, body: { error: "Code already exists" } };
    }
    const created = entities.PromoCode.create({
      code: cleanCode,
      label: body.label || cleanCode,
      rewards: body.rewards || {},
      max_redemptions: body.max_redemptions || 0,
      active: true,
      redeemed_by: [],
    });
    return { status: 200, body: { success: true, promo_code: created } };
  }

  if (action === "delete_promo_code") {
    entities.PromoCode.delete(body.promo_code_id);
    return { status: 200, body: { success: true } };
  }

  if (action === "toggle_promo_code") {
    const updated = entities.PromoCode.update(body.promo_code_id, { active: body.active });
    return { status: 200, body: { success: true, promo_code: updated } };
  }

  return { status: 400, body: { error: "Unknown action" } };
}

export const FUNCTION_HANDLERS = {
  ClaimDailyLogin,
  ClaimMailReward,
  RedeemPromoCode,
  SyncAchievements,
  SendMessage,
  ResolveNexusAssault,
  AdminModeration,
  ...ECONOMY_HANDLERS,
};
