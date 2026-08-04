// ═══════════════════════════════════════════
// GUILD ENGINE — weekly challenges + guild wars
// ═══════════════════════════════════════════
import { api } from "@/api/gameClient";
import { simulateBattle } from "@/lib/arenaEngine";

export const GUILD_WAR_COST = 5000; // stardust war chest (legacy sim path)
export const GUILD_WAR_READY_HOURS = 24;
export const GUILD_WAR_DECLARE_COST = 5000; // stardust — declare is a real sink, not a farm

const RIVAL_GUILD_NAMES = [
  "Void Reapers", "Stellar Syndicate", "Crimson Nebula", "Iron Orbit",
  "Quantum Corsairs", "Solar Fang", "The Forgotten", "Stellar Guard",
  "Drift Cartel", "Star Wraiths", "Eclipse Order", "Helix Marauders",
];
const RIVAL_TAGS = ["VR", "SS", "CN", "IO", "QC", "SF", "TF", "NC", "DC", "SW", "EO", "HM"];

const CHALLENGE_TIERS = [
  { title: "Weekly Operations", baseGoal: 20, stardust: 5000, guildXp: 600 },
  { title: "Strike Directive", baseGoal: 35, stardust: 9000, guildXp: 1000 },
  { title: "Galactic Offensive", baseGoal: 55, stardust: 15000, guildXp: 1600 },
  { title: "Apex Crusade", baseGoal: 80, stardust: 24000, guildXp: 2600 },
];

const FIGHTER_CLASSES = ["Vanguard", "Technomancer", "Shadow Operative", "Astral Warden", "Void Runner", "Cosmic Engineer"];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

/** ET Monday-based week key — matches server getWeekKey (America/New_York). */
export function getWeekKey(date = new Date()) {
  const zone = "America/New_York";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(date);
  const map = Object.fromEntries(parts.filter((p) => p.type !== "literal").map((p) => [p.type, p.value]));
  const y = Number(map.year);
  const m = Number(map.month);
  const d = Number(map.day);
  const wd = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[map.weekday] ?? 0;
  const sinceMon = (wd + 6) % 7;
  // Approximate Monday by UTC noon walk (good enough for week label; server is authoritative)
  const noonGuess = Date.UTC(y, m - 1, d - sinceMon, 12, 0, 0);
  const monParts = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(noonGuess));
  const mp = Object.fromEntries(monParts.filter((p) => p.type !== "literal").map((p) => [p.type, p.value]));
  const my = Number(mp.year);
  const mm = Number(mp.month);
  const md = Number(mp.day);
  const monday = new Date(Date.UTC(my, mm - 1, md));
  const dayNum = (monday.getUTCDay() + 6) % 7;
  monday.setUTCDate(monday.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(monday.getUTCFullYear(), 0, 4));
  const week =
    1 +
    Math.round(
      ((monday - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7
    );
  return `${monday.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Next Monday 00:00 America/New_York as ISO UTC (matches server weekEndUtc). */
export function weekEndDate() {
  const zone = "America/New_York";
  const now = Date.now();
  // Find next ET midnight that is a Monday
  let t = now;
  for (let i = 0; i < 8 * 24; i++) {
    t += 60 * 60 * 1000;
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(t));
    const map = Object.fromEntries(parts.filter((p) => p.type !== "literal").map((p) => [p.type, p.value]));
    if (map.weekday === "Mon" && map.hour === "00" && map.minute === "00") {
      // Snap to that hour boundary
      return new Date(Math.floor(t / 3600000) * 3600000).toISOString();
    }
  }
  // Fallback: +7d from now
  return new Date(now + 7 * 86400000).toISOString();
}

// ── Weekly challenges ──

export async function ensureWeeklyChallenge(guild) {
  void guild;
  const res = await api.functions.invoke("EnsureGuildChallenge", {});
  const data = res?.data || res || {};
  if (data.error) throw new Error(data.error);
  return data.challenge;
}

export async function addChallengeProgress(guild, amount = 1) {
  void guild;
  void amount;
  // Progress is applied inside ContributeGuildMission / ContributeGuildArenaWin.
  const challenge = await ensureWeeklyChallenge(guild);
  return {
    challenge,
    completed: challenge?.status === "completed",
    reward_stardust: 0,
  };
}

export async function applyGuildXp(guildId, xpAmount) {
  void guildId;
  void xpAmount;
  // Guild XP is applied only by Node contribute / challenge RPCs.
  return { level: null, leveled: false };
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
  // Keep win payout below declare cost so wars aren't net-positive farming.
  const base = (120 + (rivalGuild.level || 1) * 25) * 10;
  if (playerWon) return { stardust: base, guild_xp: Math.round(base * 0.8) };
  return { stardust: 0, guild_xp: 0 };
}

export async function applyWarResult(guild, members, rival, simulation, character) {
  void members;
  const playerWon = simulation.winner === "attacker";
  const rivalRes = await api.functions.invoke("ApplyRivalGuildWarResult", {
    won: playerWon,
    rival_id: rival.id,
    rival_name: rival.name,
    rival_level: rival.level || 1,
    atk_power: simulation.atkPower || 0,
    def_power: simulation.defPower || 0,
    events: simulation.events || [],
  });
  const rivalData = rivalRes?.data || rivalRes || {};
  if (rivalData.error) throw new Error(rivalData.error);

  const payout = await api.functions.invoke("ApplyGuildWarResult", {
    won: playerWon,
  });
  const payData = payout?.data || payout || {};
  if (payData.error) throw new Error(payData.error);
  const patch = payData.patch || {};
  if (character && Object.keys(patch).length) {
    Object.assign(character, patch);
  }

  const rewards = rivalData.rewards || { stardust: 0, guild_xp: 0 };
  const g = rivalData.guild || guild;
  return {
    playerWon,
    rewards,
    leveled: (g.level || 1) > (guild.level || 1),
    newLevel: g.level || guild.level || 1,
    character: payData.character || character,
  };
}

// ═══════════════════════════════════════════
// GUILD WARS (real gauntlet battles)
// Any guild vs any guild. Members ready up within 24h, then the war
// resolves as a gauntlet: attacker #1 fights down the defender line
// until they fall; attacker #2 picks up where #1 left off, and so on.
// Ranking is by character level (highest first).
// ═══════════════════════════════════════════

export async function declareGuildWar(attackerGuild, defenderGuild, character) {
  void attackerGuild;
  void character;
  const res = await api.functions.invoke("DeclareGuildWar", {
    defender_guild_id: defenderGuild.id,
  });
  const data = res?.data || res || {};
  if (data.error) throw new Error(data.error);
  return data.war || data;
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
  void character;
  void membership;
  const res = await api.functions.invoke("ToggleGuildWarReady", { war_id: war.id });
  const data = res?.data || res || {};
  if (data.error) throw new Error(data.error);
  return { ready: !!data.ready };
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
  // Prestige payout — kept under declare cost so declaring stays a sink.
  const base = (80 + totalFighters * 15) * 10;
  return { stardust: base, guild_xp: Math.round(base * 0.8) };
}

export async function resolveGuildWar(war) {
  if (war.status === "completed") return war;
  if (war.status !== "readying") return war;
  if (!isWarReadyExpired(war)) return war;

  const res = await api.functions.invoke("ResolveGuildWar", { war_id: war.id });
  const data = res?.data || res || {};
  if (data.error) throw new Error(data.error);
  return data.war || {
    ...war,
    status: "completed",
    winner_side: data.winner_side,
    battle_log: data.battle_log || [],
    reward_stardust: data.rewards?.stardust,
    reward_guild_xp: data.rewards?.guild_xp,
  };
}