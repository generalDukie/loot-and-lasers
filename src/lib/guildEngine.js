// ═══════════════════════════════════════════
// GUILD ENGINE — weekly challenges + guild wars
// ═══════════════════════════════════════════
import { api } from "@/api/gameClient";
import { simulateBattle } from "@/lib/arenaEngine";

export const GUILD_WAR_COST = 100; // stardust war chest

const RIVAL_GUILD_NAMES = [
  "Void Reapers", "Stellar Syndicate", "Crimson Nebula", "Iron Orbit",
  "Quantum Corsairs", "Solar Fang", "The Forgotten", "Nova Corps",
  "Drift Cartel", "Star Wraiths", "Eclipse Order", "Helix Marauders",
];
const RIVAL_TAGS = ["VR", "SS", "CN", "IO", "QC", "SF", "TF", "NC", "DC", "SW", "EO", "HM"];

const CHALLENGE_TIERS = [
  { title: "Weekly Operations", baseGoal: 20, stardust: 500, guildXp: 600 },
  { title: "Strike Directive", baseGoal: 35, stardust: 900, guildXp: 1000 },
  { title: "Galactic Offensive", baseGoal: 55, stardust: 1500, guildXp: 1600 },
  { title: "Apex Crusade", baseGoal: 80, stardust: 2400, guildXp: 2600 },
];

const FIGHTER_CLASSES = ["Vanguard", "Technomancer", "Shadow Operative", "Astral Warden", "Cosmic Engineer"];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

export function getWeekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function weekEndDate() {
  const now = new Date();
  const dayNum = (now.getDay() + 6) % 7; // Mon=0..Sun=6
  const monday = new Date(now);
  monday.setDate(now.getDate() - dayNum);
  monday.setHours(0, 0, 0, 0);
  const nextMonday = new Date(monday);
  nextMonday.setDate(monday.getDate() + 7);
  return nextMonday.toISOString();
}

// ── Weekly challenges ──

export async function ensureWeeklyChallenge(guild) {
  const weekKey = getWeekKey();
  const existing = await api.entities.GuildChallenge.filter({ guild_id: guild.id, week_key: weekKey });
  if (existing.length > 0) return existing[0];

  const tierIdx = Math.min(CHALLENGE_TIERS.length - 1, Math.floor((guild.level || 1) / 3));
  const tier = CHALLENGE_TIERS[tierIdx];
  const goal = tier.baseGoal + (guild.member_count || 1) * 5;
  return await api.entities.GuildChallenge.create({
    guild_id: guild.id,
    week_key: weekKey,
    title: tier.title,
    goal,
    progress: 0,
    status: "active",
    reward_stardust: tier.stardust,
    reward_guild_xp: tier.guildXp,
    ends_at: weekEndDate(),
  });
}

export async function addChallengeProgress(guild, amount = 1) {
  let challenges = await api.entities.GuildChallenge.filter({ guild_id: guild.id, status: "active" });
  if (challenges.length === 0) {
    challenges = [await ensureWeeklyChallenge(guild)];
  }
  const ch = challenges[0];
  if (ch.status !== "active") return null;

  const newProgress = (ch.progress || 0) + amount;
  const completed = newProgress >= (ch.goal || 1);
  if (completed) {
    await api.entities.GuildChallenge.update(ch.id, { progress: ch.goal, status: "completed" });
    await applyGuildXp(guild.id, ch.reward_guild_xp || 0);
    return { challenge: { ...ch, progress: ch.goal, status: "completed" }, completed: true, reward_stardust: ch.reward_stardust || 0 };
  }
  await api.entities.GuildChallenge.update(ch.id, { progress: newProgress });
  return { challenge: { ...ch, progress: newProgress }, completed: false };
}

export async function applyGuildXp(guildId, xpAmount) {
  const g = await api.entities.Guild.get(guildId);
  let exp = (g.experience || 0) + xpAmount;
  let level = g.level || 1;
  let expToNext = g.experience_to_next || 1000;
  let leveled = false;
  while (exp >= expToNext) {
    exp -= expToNext;
    level++;
    expToNext = Math.floor(expToNext * 1.4);
    leveled = true;
  }
  await api.entities.Guild.update(guildId, { experience: exp, level, experience_to_next: expToNext });
  if (leveled) {
    await api.entities.GuildLog.create({
      guild_id: guildId,
      entry_type: "levelup",
      message: `reached Guild Level ${level}!`,
      character_name: "Challenge System",
    });
  }
  return { level, leveled };
}

// ── Guild battles ──

export function generateRivalGuild(playerGuild) {
  const lvl = Math.max(1, (playerGuild.level || 1) + Math.floor(Math.random() * 5) - 2);
  const memberCount = Math.max(3, Math.floor(2 + Math.random() * 8));
  const i = Math.floor(Math.random() * RIVAL_GUILD_NAMES.length);
  const avgLvl = lvl + Math.floor(Math.random() * 6);
  const power = avgLvl * 12 * memberCount + lvl * 80;
  return {
    id: `rival-${Date.now()}`,
    name: RIVAL_GUILD_NAMES[i],
    tag: RIVAL_TAGS[i],
    level: lvl,
    member_count: memberCount,
    power,
  };
}

export function computeGuildPower(guild, members) {
  const memberPower = (members || []).reduce((a, m) => a + ((m.character_level || 1) * 12), 0);
  return memberPower + (guild.level || 1) * 80;
}

export function simulateGuildBattle(attackerGuild, attackerMembers, defenderGuild) {
  const atkPower = computeGuildPower(attackerGuild, attackerMembers);
  const defPower = defenderGuild.power || (defenderGuild.level || 1) * 100;
  const total = atkPower + defPower || 1;
  const atkShare = atkPower / total;

  const events = [];
  const rounds = 5;
  let atkScore = 0;
  let defScore = 0;

  for (let r = 0; r < rounds; r++) {
    const atkWinsRound = Math.random() < atkShare;
    const fighter = FIGHTER_CLASSES[r % FIGHTER_CLASSES.length];
    if (atkWinsRound) {
      atkScore++;
      events.push({
        round: r + 1,
        side: "attacker",
        fighter,
        text: `${attackerGuild.name}'s ${fighter} breaks the line — ${defenderGuild.name} takes losses.`,
      });
    } else {
      defScore++;
      events.push({
        round: r + 1,
        side: "defender",
        fighter,
        text: `${defenderGuild.name}'s ${fighter} counterattacks — ${attackerGuild.name} falters.`,
      });
    }
  }

  let winner = atkScore > defScore ? "attacker" : atkScore < defScore ? "defender" : atkPower >= defPower ? "attacker" : "defender";
  return { events, winner, atkScore, defScore, atkPower, defPower };
}

export function computeGuildBattleRewards(playerGuild, rivalGuild, playerWon) {
  const base = 200 + (rivalGuild.level || 1) * 60;
  if (playerWon) return { stardust: base, guild_xp: Math.round(base * 0.8) };
  return { stardust: Math.round(base * 0.15), guild_xp: Math.round(base * 0.2) };
}

export async function applyWarResult(guild, members, rival, simulation, character) {
  const playerWon = simulation.winner === "attacker";
  const rewards = computeGuildBattleRewards(guild, rival, playerWon);

  const g = await api.entities.Guild.get(guild.id);
  let exp = (g.experience || 0) + rewards.guild_xp;
  let level = g.level || 1;
  let expToNext = g.experience_to_next || 1000;
  let leveled = false;
  while (exp >= expToNext) {
    exp -= expToNext;
    level++;
    expToNext = Math.floor(expToNext * 1.4);
    leveled = true;
  }

  await api.entities.Guild.update(guild.id, {
    experience: exp,
    level,
    experience_to_next: expToNext,
    war_wins: (g.war_wins || 0) + (playerWon ? 1 : 0),
    war_losses: (g.war_losses || 0) + (playerWon ? 0 : 1),
  });

  const fresh = await api.entities.Character.get(character.id);
  await api.entities.Character.update(character.id, {
    stardust: (fresh.stardust || 0) - GUILD_WAR_COST + rewards.stardust,
  });

  await api.entities.GuildBattle.create({
    attacker_guild_id: guild.id,
    defender_guild_id: rival.id,
    attacker_guild_name: guild.name,
    defender_guild_name: rival.name,
    attacker_guild_level: g.level,
    defender_guild_level: rival.level,
    attacker_power: simulation.atkPower,
    defender_power: simulation.defPower,
    winner_side: simulation.winner,
    events: simulation.events,
    reward_stardust: rewards.stardust,
    reward_guild_xp: rewards.guild_xp,
    initiated_by: character.name,
  });

  await api.entities.GuildLog.create({
    guild_id: guild.id,
    entry_type: "war",
    message: playerWon ? `defeated ${rival.name} in a guild war` : `lost a guild war to ${rival.name}`,
    character_name: character.name,
    amount: rewards.stardust,
  });

  void api.entities.GalaxyNews.create({
    message: playerWon ? `⚔️ ${guild.name} conquered ${rival.name} in a Guild War!` : `🛡️ ${rival.name} repelled ${guild.name}'s invasion.`,
    entry_type: playerWon ? "victory" : "defeat",
    character_name: guild.name,
  });

  return { playerWon, rewards, leveled, newLevel: level };
}

// ═══════════════════════════════════════════
// GUILD WARS (real gauntlet battles)
// Any guild vs any guild. Members ready up within 24h, then the war
// resolves as a gauntlet: attacker #1 fights down the defender line
// until they fall; attacker #2 picks up where #1 left off, and so on.
// Ranking is by character level (highest first).
// ═══════════════════════════════════════════
export const GUILD_WAR_READY_HOURS = 24;
export const GUILD_WAR_DECLARE_COST = 100; // stardust war chest

export async function declareGuildWar(attackerGuild, defenderGuild, character) {
  const now = new Date();
  const deadline = new Date(now.getTime() + GUILD_WAR_READY_HOURS * 3600 * 1000);
  return await api.entities.GuildWar.create({
    attacker_guild_id: attackerGuild.id,
    attacker_guild_name: attackerGuild.name,
    attacker_guild_tag: attackerGuild.tag || "",
    defender_guild_id: defenderGuild.id,
    defender_guild_name: defenderGuild.name,
    defender_guild_tag: defenderGuild.tag || "",
    status: "readying",
    declared_at: now.toISOString(),
    ready_deadline: deadline.toISOString(),
    initiated_by: character.name,
    attacker_ready_count: 0,
    defender_ready_count: 0,
  });
}

export async function listGuildWars(guildId) {
  const [asAttacker, asDefender] = await Promise.all([
    api.entities.GuildWar.filter({ attacker_guild_id: guildId }, "-declared_at", 20),
    api.entities.GuildWar.filter({ defender_guild_id: guildId }, "-declared_at", 20),
  ]);
  const seen = new Set();
  const all = [...asAttacker, ...asDefender].filter((w) => {
    if (seen.has(w.id)) return false;
    seen.add(w.id);
    return true;
  });
  all.sort((a, b) => new Date(b.declared_at) - new Date(a.declared_at));
  return all;
}

export async function getWarReadies(warId) {
  return await api.entities.GuildWarReady.filter({ war_id: warId });
}

export function isWarReadyExpired(war, now = Date.now()) {
  return now >= new Date(war.ready_deadline).getTime();
}

export async function toggleReady(war, character, membership) {
  const side = war.attacker_guild_id === membership.guild_id ? "attacker" : "defender";
  const existing = await api.entities.GuildWarReady.filter({ war_id: war.id, character_id: character.id });
  if (existing.length > 0) {
    await api.entities.GuildWarReady.delete(existing[0].id);
    return { ready: false };
  }
  await api.entities.GuildWarReady.create({
    war_id: war.id,
    guild_id: membership.guild_id,
    character_id: character.id,
    character_name: character.name,
    character_level: character.level || 1,
    side,
  });
  return { ready: true };
}

async function loadWarFighters(war, side) {
  const readies = await api.entities.GuildWarReady.filter({ war_id: war.id, side });
  const fighters = await Promise.all(
    readies.map(async (r) => {
      const character = await api.entities.Character.get(r.character_id);
      const items = await api.entities.Item.filter({ character_id: r.character_id, is_equipped: true });
      return { ready: r, character, items };
    })
  );
  // Rank by level only — highest first.
  fighters.sort((a, b) => (b.character.level || 1) - (a.character.level || 1));
  return fighters;
}

export function simulateGauntlet(attackerFighters, defenderFighters) {
  const duels = [];
  let defIdx = 0;
  let attackerWon = false;
  for (let aIdx = 0; aIdx < attackerFighters.length && defIdx < defenderFighters.length; aIdx++) {
    const atk = attackerFighters[aIdx];
    while (defIdx < defenderFighters.length) {
      const def = defenderFighters[defIdx];
      const battle = simulateBattle(atk.character, def.character, atk.items || [], def.items || []);
      const atkWon = battle.winner === "player";
      duels.push({
        attacker_name: atk.character.name,
        defender_name: def.character.name,
        attacker_level: atk.character.level || 1,
        defender_level: def.character.level || 1,
        winner: atkWon ? "attacker" : "defender",
        events: battle.events,
        playerMaxHp: battle.playerMaxHp,
        opponentMaxHp: battle.opponentMaxHp,
      });
      if (atkWon) defIdx++; // defender eliminated, attacker continues down the line
      else break; // attacker fell — next attacker picks up here
    }
    if (defIdx >= defenderFighters.length) { attackerWon = true; break; }
  }
  return { duels, winner: attackerWon ? "attacker" : "defender" };
}

function computeWarRewards(totalFighters, winnerSide) {
  const base = 200 + totalFighters * 30;
  return { stardust: base, guild_xp: Math.round(base * 0.8) };
}

export async function resolveGuildWar(war) {
  if (war.status !== "readying") return war;
  if (!isWarReadyExpired(war)) return war;

  const attackers = await loadWarFighters(war, "attacker");
  const defenders = await loadWarFighters(war, "defender");

  let winnerSide, duels;
  if (defenders.length === 0) {
    winnerSide = "attacker";
    duels = [];
  } else if (attackers.length === 0) {
    winnerSide = "defender";
    duels = [];
  } else {
    const gauntlet = simulateGauntlet(
      attackers.map((f) => ({ character: f.character, items: f.items })),
      defenders.map((f) => ({ character: f.character, items: f.items }))
    );
    winnerSide = gauntlet.winner;
    duels = gauntlet.duels;
  }

  const totalFighters = attackers.length + defenders.length;
  const rewards = computeWarRewards(totalFighters, winnerSide);
  const nowIso = new Date().toISOString();

  await api.entities.GuildWar.update(war.id, {
    status: "completed",
    winner_side: winnerSide,
    battle_log: duels,
    resolved_at: nowIso,
    attacker_ready_count: attackers.length,
    defender_ready_count: defenders.length,
    reward_stardust: rewards.stardust,
    reward_guild_xp: rewards.guild_xp,
  });

  const winGuildId = winnerSide === "attacker" ? war.attacker_guild_id : war.defender_guild_id;
  await applyGuildXp(winGuildId, rewards.guild_xp);

  const [atkGuild, defGuild] = await Promise.all([
    api.entities.Guild.get(war.attacker_guild_id),
    api.entities.Guild.get(war.defender_guild_id),
  ]);
  await api.entities.Guild.update(war.attacker_guild_id, {
    war_wins: (atkGuild.war_wins || 0) + (winnerSide === "attacker" ? 1 : 0),
    war_losses: (atkGuild.war_losses || 0) + (winnerSide === "attacker" ? 0 : 1),
  });
  await api.entities.Guild.update(war.defender_guild_id, {
    war_wins: (defGuild.war_wins || 0) + (winnerSide === "defender" ? 1 : 0),
    war_losses: (defGuild.war_losses || 0) + (winnerSide === "defender" ? 0 : 1),
  });

  await api.entities.GuildLog.create({
    guild_id: winGuildId,
    entry_type: "war",
    message:
      winnerSide === "attacker"
        ? `defeated ${war.defender_guild_name} in a guild war`
        : `repelled ${war.attacker_guild_name}'s invasion`,
    character_name: war.initiated_by,
    amount: rewards.stardust,
  });
  void api.entities.GalaxyNews.create({
    message:
      winnerSide === "attacker"
        ? `⚔️ ${war.attacker_guild_name} conquered ${war.defender_guild_name} in a Guild War!`
        : `🛡️ ${war.defender_guild_name} repelled ${war.attacker_guild_name}'s invasion.`,
    entry_type: winnerSide === "attacker" ? "victory" : "defeat",
    character_name: war.attacker_guild_name,
  });

  return {
    ...war,
    status: "completed",
    winner_side: winnerSide,
    battle_log: duels,
    resolved_at: nowIso,
    reward_stardust: rewards.stardust,
    reward_guild_xp: rewards.guild_xp,
    attacker_ready_count: attackers.length,
    defender_ready_count: defenders.length,
  };
}