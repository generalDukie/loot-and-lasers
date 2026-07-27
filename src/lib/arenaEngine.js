// ═══════════════════════════════════════════
// ARENA ENGINE — async PvP simulation
// ═══════════════════════════════════════════
import { RACES, CLASSES, generateItem, generateClassWeapon, scaleCombatXp } from "@/lib/gameData";
import { computeTotalStats, computeDerivedStats, getClassWeights, CLASS_ATK_MULT } from "@/lib/statEngine";
import { EYES, EARS, MOUTHS, NOSES, BROWS, MARKINGS } from "@/components/game/CharacterAvatar";

// First 10 arena battles each day are free (grant xp + stardust + rating).
// Beyond that, each battle costs nova crystals and yields rating only, but can
// be fought indefinitely to climb the leaderboard.
export const ARENA_DAILY_FREE_BATTLES = 10;
export const ARENA_PAID_BATTLE_COST = 5; // nova crystals per battle after the free quota
export const ARENA_REFRESH_MS = 5 * 60 * 1000;
export const ARENA_REFRESH_COST = 50; // stardust
export const ARENA_BATTLE_COOLDOWN_MS = 5 * 60 * 1000; // 5-minute cooldown between battles
export const ARENA_SKIP_COST = 1; // nova crystals to skip the cooldown
export const ARENA_CHALLENGER_SLOTS = 3;
/** Prefer this many real players when the population supports it (rest filled with bots). */
export const ARENA_MAX_REAL_OPPONENTS = 2;
/** Soft rating band for "fair" matches before widening the search. */
export const ARENA_RATING_BAND = 120;
export const ARENA_RATING_BAND_WIDE = 280;
export const ARENA_LEVEL_BAND = 8;
/** Personal match log size (oldest pruned after each fight). */
export const ARENA_HISTORY_LIMIT = 10;

const BOT_NAMES = [
  "Vrax'Nok", "Zyx-7", "Kaelith", "Drogath", "Nebulon", "Zyr'kara", "Cygnus",
  "Mordok", "Lyra-9", "Threx", "Zarvok", "Pixie-Δ", "Garrak", "Sylph",
  "Onyx-3", "Brak'tor", "Vesper", "Krellix", "Astra", "Mungo", "RustBeard",
  "VoidCaptain", "Nova", "Zara", "Keagan",
];
const BOT_GUILDS = [
  "Void Reapers", "Stellar Syndicate", "Crimson Nebula", "Iron Orbit",
  "Quantum Corsairs", "Solar Fang", "The Forgotten", "Stellar Guard",
  "Drift Cartel", "Star Wraiths",
];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// The canonical class special name (from CLASSES[class].special.name) is the
// single, consistent ability label shown in combat — no divergent flavor names.
function classSpecialName(className) {
  return CLASSES[className]?.special?.name || "Special";
}

const POWER_STAT_KEYS = ["strength", "agility", "intellect", "vitality", "luck"];

export function avatarPropsFor(e) {
  return {
    race: e.race,
    skinColor: e.skinColor || e.appearance?.skin_color,
    eyeStyle: e.eyeStyle || e.appearance?.eye_style,
    ears: e.ears || e.appearance?.ears,
    mouth: e.mouth || e.appearance?.mouth,
    nose: e.nose || e.appearance?.nose,
    eyebrows: e.eyebrows || e.appearance?.eyebrows,
    marking: e.marking || e.appearance?.marking,
  };
}

export function getSeason() {
  const d = new Date();
  const monthName = d.toLocaleString("en-US", { month: "long" });
  return {
    name: `${monthName} ${d.getFullYear()}`,
    endsAt: new Date(d.getFullYear(), d.getMonth() + 1, 1).toISOString(),
  };
}

// Combat power weights each attribute by how well it suits the character's class:
// a primary stat counts ~20× an off-stat, so a Vanguard's Strength drives power far
// more than their Intellect. Gear is folded in via computeTotalStats, so a primary-
// stat weapon boosts power noticeably while off-stat loot barely moves it.
export function computePower(character, equippedItems = []) {
  const w = getClassWeights(character?.class);
  const total = computeTotalStats(character, equippedItems);
  const weighted = POWER_STAT_KEYS.reduce((sum, k) => sum + (total[k] || 0) * (w[k] ?? 0.1), 0);
  return Math.round((character.level || 1) * 10 + weighted * 7.5);
}

function randomAppearance(raceKey) {
  const race = RACES[raceKey] || RACES.Synthara;
  return {
    race: raceKey,
    skinColor: pick(race.skinColors),
    eyeStyle: pick(EYES),
    ears: pick(EARS),
    mouth: pick(MOUTHS),
    nose: pick(NOSES),
    eyebrows: pick(BROWS),
    marking: pick(MARKINGS),
  };
}

function botStats(level, cls) {
  const base = cls.baseStats;
  const bonus = Math.floor(level * 1.2);
  const out = {};
  for (const k of Object.keys(base)) {
    out[k] = base[k] + Math.floor(bonus * (0.6 + Math.random() * 0.8));
  }
  return out;
}

const BOT_EXTRA_SLOTS = ["armor", "helmet", "boots", "legs", "neck", "accessory"];

function rollBotRarity(level) {
  const roll = Math.random();
  if (level >= 12 && roll < 0.06) return "legendary";
  if (level >= 8 && roll < 0.18) return "epic";
  if (level >= 4 && roll < 0.4) return "rare";
  if (roll < 0.55) return "uncommon";
  return "common";
}

function botGearId(slot) {
  return `bot-${slot}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Build real gear objects for a bot (not DB Item ids). Always includes a weapon
 * so combat stats and the overlay weapon match the card's power readout.
 */
export function pickGearForBot(_catalogItems, classKey, level) {
  const gearLevel = Math.max(1, level || 1);
  const items = [];

  const weaponRarity = rollBotRarity(gearLevel);
  const weaponBase = Math.random() < 0.6
    ? generateClassWeapon(classKey, weaponRarity, gearLevel)
    : generateItem(weaponRarity, gearLevel, "weapon");
  items.push({ ...weaponBase, id: botGearId("weapon"), is_equipped: true });

  const extras = [...BOT_EXTRA_SLOTS].sort(() => Math.random() - 0.5);
  const extraCount = 1 + Math.floor(Math.random() * 2);
  for (let i = 0; i < extraCount; i++) {
    const type = extras[i];
    const piece = generateItem(rollBotRarity(gearLevel), gearLevel, type);
    items.push({ ...piece, id: botGearId(type), is_equipped: true });
  }
  return items;
}

/** Resolve opponent gear for combat — prefers live equippedItems, else catalog ids. */
export function resolveOpponentItems(opp, catalogItems = []) {
  if (opp?.equippedItems?.length) return opp.equippedItems;
  if (opp?.equippedItemIds?.length) {
    return opp.equippedItemIds
      .map((id) => catalogItems.find((c) => c.id === id))
      .filter(Boolean);
  }
  return [];
}

// Converts a real player's Character record (+ equipped gear) into the same
// opponent shape generateOpponents produces, so real players can appear among
// the bot challengers in the Arena.
export function characterToOpponent(char, equippedItems = [], guildTag = null) {
  const stats = computeTotalStats(char, equippedItems);
  const w = getClassWeights(char.class);
  const weighted = POWER_STAT_KEYS.reduce((sum, k) => sum + (stats[k] || 0) * (w[k] ?? 0.1), 0);
  const power = Math.round((char.level || 1) * 10 + weighted * 7.5);
  const lastOnlineMins = char.updated_date
    ? Math.max(0, Math.floor((Date.now() - new Date(char.updated_date).getTime()) / 60000))
    : 0;
  const guild = guildTag
    ? (String(guildTag).startsWith("[") ? guildTag : `[${guildTag}]`)
    : null;
  return {
    id: `real-${char.id}`,
    realCharacterId: char.id,
    name: char.name,
    race: char.race,
    class: char.class,
    level: char.level || 1,
    arena_rating: char.arena_rating || 1000,
    stats: char.stats || {},
    power,
    arena_wins: char.arena_wins || 0,
    arena_losses: char.arena_losses || 0,
    guild,
    lastOnlineMins,
    appearance: char.appearance || {},
    avatar_url: char.avatar_url,
    active_title: char.active_title,
    isBot: false,
    equippedItems,
    speciesId: null,
  };
}

/**
 * Lower score = better match. Prefers similar rating, then level, then recent activity.
 */
export function scoreArenaCandidate(player, candidate) {
  const myRating = player.arena_rating || 1000;
  const theirRating = candidate.arena_rating || 1000;
  const ratingGap = Math.abs(theirRating - myRating);
  const levelGap = Math.abs((candidate.level || 1) - (player.level || 1));
  let score = ratingGap + levelGap * 28;
  const mins = candidate.updated_date
    ? Math.max(0, (Date.now() - new Date(candidate.updated_date).getTime()) / 60000)
    : 14 * 24 * 60;
  if (mins <= 60) score -= 18;
  else if (mins <= 24 * 60) score -= 8;
  else if (mins > 7 * 24 * 60) score += 45;
  return score;
}

/**
 * Rank eligible characters into a preferred match list.
 * Tight rating band first, then wide band, then remaining level-eligible players.
 */
export function rankArenaCandidates(player, candidates, {
  levelBand = ARENA_LEVEL_BAND,
  tightBand = ARENA_RATING_BAND,
  wideBand = ARENA_RATING_BAND_WIDE,
} = {}) {
  const myLevel = player.level || 1;
  const myRating = player.arena_rating || 1000;
  const eligible = candidates.filter((c) => Math.abs((c.level || 1) - myLevel) <= levelBand);
  const scored = eligible
    .map((c) => ({ c, score: scoreArenaCandidate(player, c) }))
    .sort((a, b) => a.score - b.score);

  const tight = [];
  const wide = [];
  const rest = [];
  for (const row of scored) {
    const gap = Math.abs((row.c.arena_rating || 1000) - myRating);
    if (gap <= tightBand) tight.push(row);
    else if (gap <= wideBand) wide.push(row);
    else rest.push(row);
  }
  return [...tight, ...wide, ...rest].map((r) => r.c);
}

/**
 * Weighted pick from the top of a ranked list so matches stay fair but not identical every refresh.
 */
export function pickRankedCandidates(ranked, count) {
  const pool = [...ranked];
  const out = [];
  while (out.length < count && pool.length) {
    const band = pool.slice(0, Math.min(5, pool.length));
    const weights = band.map((_, i) => band.length - i);
    let roll = Math.random() * weights.reduce((a, b) => a + b, 0);
    let idx = 0;
    for (let i = 0; i < weights.length; i++) {
      roll -= weights[i];
      if (roll <= 0) { idx = i; break; }
    }
    const chosen = band[idx];
    out.push(chosen);
    pool.splice(pool.indexOf(chosen), 1);
  }
  return out;
}

export function generateOpponents(character, count = 3, catalogItems = []) {
  const myLevel = character.level || 1;
  const myRating = character.arena_rating || 1000;
  const used = new Set();
  const out = [];
  for (let i = 0; i < count; i++) {
    const raceKey = pick(Object.keys(RACES));
    const classKey = pick(Object.keys(CLASSES));
    const level = Math.max(1, myLevel + Math.floor(Math.random() * 7) - 3);
    // Opponent rating stays near the player's (±40) so fights stay competitive.
    const rating = Math.max(0, myRating + Math.floor(Math.random() * 80) - 40);
    const stats = botStats(level, CLASSES[classKey]);
    const equippedItems = pickGearForBot(catalogItems, classKey, level);
    const power = computePower({ level, class: classKey, stats }, equippedItems);
    const wins = Math.max(0, Math.floor(rating / 4) + Math.floor(Math.random() * 20));
    const losses = Math.floor(wins * (0.4 + Math.random() * 0.6));
    let name = pick(BOT_NAMES);
    while (used.has(name)) name = pick(BOT_NAMES);
    used.add(name);
    out.push({
      id: `bot-${i}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      race: raceKey,
      class: classKey,
      level,
      arena_rating: rating,
      stats,
      power,
      arena_wins: wins,
      arena_losses: losses,
      guild: Math.random() < 0.6 ? pick(BOT_GUILDS) : null,
      lastOnlineMins: Math.floor(Math.random() * 60 * 24 * 3),
      appearance: randomAppearance(raceKey),
      isBot: true,
      speciesId: ((i * 7 + name.charCodeAt(0)) % 30) + 1,
      equippedItems,
      equippedItemIds: equippedItems.map((it) => it.id),
    });
  }
  return out;
}

/** Serializable opponent copy for revenge rematches (bots + real fallback). */
export function snapshotOpponent(opp) {
  const equippedItems = (opp.equippedItems || []).map((it) => ({
    id: it.id,
    name: it.name,
    type: it.type,
    rarity: it.rarity,
    stats: it.stats,
    level_requirement: it.level_requirement,
    base_name: it.base_name,
    emoji: it.emoji,
  }));
  const equippedItemIds = opp.equippedItemIds?.length
    ? [...opp.equippedItemIds]
    : equippedItems.map((it) => it.id).filter(Boolean);
  return {
    id: opp.id,
    realCharacterId: opp.realCharacterId || null,
    name: opp.name,
    race: opp.race,
    class: opp.class,
    level: opp.level,
    arena_rating: opp.arena_rating,
    stats: opp.stats,
    power: opp.power,
    arena_wins: opp.arena_wins || 0,
    arena_losses: opp.arena_losses || 0,
    guild: opp.guild || null,
    appearance: opp.appearance || {},
    avatar_url: opp.avatar_url || null,
    active_title: opp.active_title || null,
    isBot: !!opp.isBot,
    speciesId: opp.speciesId ?? null,
    equippedItemIds,
    equippedItems,
    lastOnlineMins: opp.lastOnlineMins ?? 0,
  };
}

function buildFighter(c, items, side) {
  // Uses the shared stat engine so the character sheet's combat stats exactly
  // match what happens in battle — no duplicate formula drift.
  const stats = computeTotalStats(c, items);
  const cls = CLASSES[c.class] || CLASSES.Vanguard;
  const derived = computeDerivedStats(stats, c);
  const className = cls.name;
  // Astral Warden — Cosmic Barrier: starting shield = 20% max HP (cannot be restored once broken)
  const shieldMax = className === "Astral Warden" ? Math.round(derived.health * 0.2) : 0;
  return {
    side, name: c.name, className,
    hp: derived.health, maxHp: derived.health,
    atk: derived.damage,
    crit: derived.critChance / 100,   // convert % → 0-1 for battle rolls
    dodge: derived.dodgeChance / 100,
    armor: derived.armor / 100,
    stats,
    attackCount: 0,        // per-fighter turn counter (drives class specials)
    shadowstepBuff: false, // Shadow Operative — Shadowstep damage boost pending
    shield: shieldMax,
    shieldMax,
    shieldBroken: shieldMax === 0,
  };
}

// Applies damage to a fighter, absorbing it through the Astral Warden shield first.
function applyDamage(target, dmg) {
  if (target.shield > 0 && !target.shieldBroken) {
    if (dmg >= target.shield) {
      const overflow = dmg - target.shield;
      target.shield = 0;
      target.shieldBroken = true;
      target.hp -= overflow;
      return { hpDamage: overflow, shieldHit: false, shieldBroken: true };
    }
    target.shield -= dmg;
    return { hpDamage: 0, shieldHit: true, shieldBroken: false };
  }
  target.hp -= dmg;
  return { hpDamage: dmg, shieldHit: false, shieldBroken: false };
}

export function simulateBattle(player, opp, playerItems = [], oppItems = []) {
  const A = buildFighter(player, playerItems, "player");
  const B = buildFighter(opp, oppItems, "opponent");
  // B lacks items; small level-based attack compensation (only when no items provided)
  if (!oppItems || oppItems.length === 0) B.atk += (opp.level || 1) * 2;

  const events = [];
  let attacker = A.stats.agility >= B.stats.agility ? A : B;
  let defender = attacker === A ? B : A;
  let round = 0;

  // Per-battle tempo: randomizes how long the duel takes. Closer-level fights
  // tend to drag out (lower tempo), lopsided matchups resolve faster (higher tempo).
  const levelGap = Math.abs((player.level || 1) - (opp.level || 1));
  const tempo = (0.78 + Math.random() * 0.55) + Math.min(0.25, levelGap * 0.02);

  while (A.hp > 0 && B.hp > 0 && round < 45) {
    round++;
    attacker.attackCount++;

    // Astral Warden — Cosmic Barrier: regenerates 2% max HP at the start of each of its turns
    if (attacker.className === "Astral Warden" && attacker.hp < attacker.maxHp) {
      const regen = Math.max(1, Math.round(attacker.maxHp * 0.02));
      const before = attacker.hp;
      attacker.hp = Math.min(attacker.maxHp, attacker.hp + regen);
      const gained = attacker.hp - before;
      if (gained > 0) {
        events.push({ type: "regen", attacker: attacker.side, defender: attacker.side, heal: gained, dodged: false });
      }
    }

    // Cosmic Engineer — Combat Drone: fires every other turn for 30% weapon damage (untargetable)
    if (attacker.className === "Cosmic Engineer" && attacker.attackCount % 2 === 0 && defender.hp > 0) {
      const droneDmg = Math.max(1, Math.floor(attacker.atk * 0.4));
      const res = applyDamage(defender, droneDmg);
      events.push({
        type: "drone",
        attacker: attacker.side,
        defender: defender.side,
        damage: res.hpDamage,
        shieldHit: res.shieldHit,
        ability: "Combat Drone",
        crit: false,
        dodged: false,
      });
      if (defender.hp <= 0) break;
    }

    const useAbility = round % 4 === 0;
    const dodgeRoll = Math.random();

    if (dodgeRoll < defender.dodge) {
      events.push({
        type: "dodge",
        attacker: attacker.side,
        defender: defender.side,
        dodged: true,
        text: `${defender.name} dodges!`,
      });
      // Shadow Operative — Shadowstep: a successful dodge empowers the next attack
      if (defender.className === "Shadow Operative") defender.shadowstepBuff = true;
    } else {
      // Class specials keyed off this fighter's own attack count
      const unstoppable = attacker.className === "Vanguard" && attacker.attackCount % 4 === 0;       // 200% dmg, ignores 25% armor
      const overcharge = attacker.className === "Technomancer" && attacker.attackCount % 3 === 0;   // guaranteed crit, ignores 20% armor
      const shadowstep = attacker.className === "Shadow Operative" && attacker.shadowstepBuff;     // +25% dmg after a dodge

      let crit = overcharge ? true : Math.random() < attacker.crit;
      let base = attacker.atk * (0.85 + Math.random() * 0.3) * tempo;
      if (unstoppable) base *= 2;
      if (shadowstep) base *= 1.25;
      let dmg = Math.max(1, Math.floor(base * (crit ? 2 : 1)));

      // Armor reduction from the stat engine (Vitality-based %), with specials
      // that partially ignore armor/shields.
      let armorReduction = defender.armor || 0;
      if (unstoppable) armorReduction *= 0.75;
      if (overcharge) armorReduction *= 0.8;
      dmg = Math.max(1, Math.floor(dmg * (1 - armorReduction)));

      const res = applyDamage(defender, dmg);
      attacker.shadowstepBuff = false; // consumed

      const abilityName = unstoppable ? "Unstoppable"
        : overcharge ? "Overcharge"
        : shadowstep ? "Shadowstep"
        : useAbility ? classSpecialName(attacker.className)
        : null;

      events.push({
        type: abilityName ? "ability" : "attack",
        attacker: attacker.side,
        defender: defender.side,
        damage: res.hpDamage,
        shieldHit: res.shieldHit,
        crit,
        dodged: false,
        ability: abilityName,
      });
    }
    [attacker, defender] = [defender, attacker];
  }

  const winner = A.hp > 0 ? "player" : "opponent";
  return { events, winner, playerMaxHp: A.maxHp, opponentMaxHp: B.maxHp };
}

// Elo K-factor and soft clamps keep climbs meaningful without runaway swings.
export const ARENA_ELO_K = 28;
export const ARENA_RATING_DELTA_MIN = 6;
export const ARENA_RATING_DELTA_MAX = 36;

/** Expected win chance for `playerRating` vs `oppRating` (classic Elo). */
export function eloExpectedScore(playerRating, oppRating) {
  return 1 / (1 + 10 ** (((oppRating || 1000) - (playerRating || 1000)) / 400));
}

/**
 * Balanced rating change: beating weaker foes pays less; upsets pay more.
 * Losses mirror that (smashing down hurts more than falling to a favorite).
 */
export function eloRatingDelta(playerRating, oppRating, won, k = ARENA_ELO_K) {
  const expected = eloExpectedScore(playerRating, oppRating);
  const raw = Math.round(k * ((won ? 1 : 0) - expected));
  if (won) {
    return Math.max(ARENA_RATING_DELTA_MIN, Math.min(ARENA_RATING_DELTA_MAX, raw));
  }
  return Math.max(-ARENA_RATING_DELTA_MAX, Math.min(-ARENA_RATING_DELTA_MIN, raw));
}

function lootForOutcome(player, opp, won, free) {
  if (!free) return { experience: 0, stardust: 0 };
  const pl = player.level || 1;
  const oppLevel = opp.level || 1;
  const levelDiff = oppLevel - pl;
  const ratingDiff = (opp.arena_rating || 1000) - (player.arena_rating || 1000);
  // Slight loot tilt toward tougher matchups so farming down isn't optimal.
  const challengeBonus = Math.max(0, Math.floor(ratingDiff / 40)) + Math.max(0, levelDiff);
  const contentLevel = Math.max(1, Math.round((pl + oppLevel) / 2));
  if (won) {
    const rawXp = 36 + oppLevel * 7 + Math.max(0, levelDiff * 4) + challengeBonus * 3;
    return {
      experience: scaleCombatXp(rawXp, pl, contentLevel),
      stardust: 50 + oppLevel * 12 + challengeBonus * 4,
    };
  }
  const rawXp = 10 + oppLevel * 2.5 + Math.max(0, Math.floor(challengeBonus / 2));
  return {
    experience: scaleCombatXp(rawXp, pl, contentLevel),
    stardust: 15 + oppLevel * 2 + Math.max(0, Math.floor(challengeBonus / 2)),
  };
}

export function computeRewards(player, opp, won, free = true) {
  const ratingDelta = eloRatingDelta(player.arena_rating || 1000, opp.arena_rating || 1000, won);
  const loot = lootForOutcome(player, opp, won, free);
  return {
    won,
    free,
    experience: loot.experience,
    stardust: loot.stardust,
    arena_rating_delta: ratingDelta,
  };
}

/**
 * Risk label from blended rating + power gap (not the same as Elo payout).
 * Gives an honest "how hard is this fight?" read next to the reward chip.
 */
export function assessMatchRisk(playerPower, oppPower, playerRating, oppRating) {
  const ratingGap = (oppRating || 1000) - (playerRating || 1000);
  const powerGap = (oppPower || 0) - (playerPower || 0);
  // Power weighs a bit more than raw rating for fight feel.
  const score = ratingGap / 20 + powerGap / 18;
  if (score <= -35) return { id: "favored", label: "FAVORED", tone: "emerald" };
  if (score <= -12) return { id: "edge", label: "EDGE", tone: "cyan" };
  if (score <= 12) return { id: "even", label: "EVEN", tone: "amber" };
  if (score <= 35) return { id: "underdog", label: "UNDERDOG", tone: "orange" };
  return { id: "danger", label: "DANGER", tone: "rose" };
}

/** Pre-fight stakes preview used by challenger cards. */
export function previewArenaMatch(player, opp, { free = true, playerPower } = {}) {
  const myRating = player.arena_rating || 1000;
  const theirRating = opp.arena_rating || 1000;
  const onWin = computeRewards(player, opp, true, free);
  const onLoss = computeRewards(player, opp, false, free);
  const risk = assessMatchRisk(playerPower ?? player.power, opp.power, myRating, theirRating);
  const winChance = Math.round(eloExpectedScore(myRating, theirRating) * 100);
  return { onWin, onLoss, risk, winChance };
}