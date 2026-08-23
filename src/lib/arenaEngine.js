// ═══════════════════════════════════════════
// ARENA ENGINE — async PvP simulation
// ═══════════════════════════════════════════
import { RACES, CLASSES, generateClassWeapon, getArenaStardustReward, getArenaXpReward } from "@/lib/gameData";
import {
  computeTotalStats,
  computeCombatantTotalStats,
  getClassWeights,
  CRIT_MULT,
} from "@/lib/statEngine";
import {
  derivedCombatStats,
  inferCombatContent,
  resistFraction,
  rollUniversalVariance,
  roundCombatDamage,
  contextMultiplierFor,
  rawAttack,
  STANDARD_ATTACK_FLAT,
  DAMAGE_CHANNEL,
} from "@/lib/combatMath";
import {
  onCombatStart,
  onTurnStart,
  activateKineticTantrum,
  beginNormalAttackModifiers,
  endNormalAttackModifiers,
  tryPhantomSignalMiss,
  overclockDealtMultiplier,
  overclockTakenMultiplier,
  tickOverclockAfterAttempt,
  removeOverclockStacks,
  applyDamageWithBarrier,
  maybeOrbitalAssistant,
  maybeUnlockDirtyTricks,
  consumeStimOpening,
  OVERCLOCK_CRIT_STACK_LOSS,
  CRIT_DAMAGE_MULT,
  passiveNameForClass,
  createPassiveState,
  snapshotPassiveHud,
} from "@/lib/classPassives";
import { EYES, EARS, MOUTHS, NOSES, BROWS, MARKINGS } from "@/lib/avatarFeatures";
import { generateArenaBot, ARENA_BOT_CLASSES } from "@/lib/arenaBotGenerator";

// First 10 arena battles each day are free (grant xp + stardust + rating on wins only).
// Losses never grant XP or stardust. Beyond the free quota, each battle costs nova
// crystals and yields rating only, but can be fought indefinitely to climb.
const MILLISECONDS_PER_SECOND = 1_000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const MINUTES_PER_DAY = MINUTES_PER_HOUR * HOURS_PER_DAY;
const MILLISECONDS_PER_MINUTE = MILLISECONDS_PER_SECOND * SECONDS_PER_MINUTE;
const MILLISECONDS_PER_HOUR = MILLISECONDS_PER_MINUTE * MINUTES_PER_HOUR;
const PERCENT_SCALE = 100;
const EVEN_CHANCE = 0.5;

export const DEFAULT_ARENA_RATING = 1_000;
export const ARENA_DAILY_FREE_BATTLES = 10;
export const ARENA_PAID_BATTLE_COST = 15; // nova crystals per battle after the free quota
export const ARENA_REFRESH_HOURS = 2;
export const ARENA_REFRESH_MS = ARENA_REFRESH_HOURS * MILLISECONDS_PER_HOUR;
export const ARENA_REFRESH_COST = 500; // stardust (10× scale) — unused; kept for catalog compatibility
export const ARENA_BATTLE_COOLDOWN_MINUTES = 10;
export const ARENA_BATTLE_COOLDOWN_MS = ARENA_BATTLE_COOLDOWN_MINUTES * MILLISECONDS_PER_MINUTE;
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

const DEFAULT_CLASS_STAT_WEIGHT = 0.1;
const ARENA_POWER_PER_LEVEL = 10;
const ARENA_POWER_PER_WEIGHTED_ATTRIBUTE = 7.5;
const ARENA_LEVEL_GAP_SCORE_WEIGHT = 28;
const CANDIDATE_RECENT_THRESHOLD_MINUTES = 60;
const CANDIDATE_ACTIVE_THRESHOLD_MINUTES = MINUTES_PER_DAY;
const CANDIDATE_STALE_THRESHOLD_MINUTES = 7 * MINUTES_PER_DAY;
const CANDIDATE_UNKNOWN_AGE_MINUTES = 14 * MINUTES_PER_DAY;
const CANDIDATE_RECENT_SCORE_BONUS = 18;
const CANDIDATE_ACTIVE_SCORE_BONUS = 8;
const CANDIDATE_STALE_SCORE_PENALTY = 45;
const RANKED_CANDIDATE_PICK_BAND_SIZE = 5;
const BOT_RATING_VARIANCE = 40;
const BOT_WIN_RATING_DIVISOR = 4;
const BOT_RANDOM_WIN_BONUS_LIMIT = 20;
const BOT_LOSS_RATIO_MIN = 0.4;
const BOT_LOSS_RATIO_RANGE = 0.6;
const BOT_GUILD_MEMBERSHIP_CHANCE = 0.6;
const BOT_LAST_ONLINE_MAX_DAYS = 3;
const LADDER_BOT_LAST_ONLINE_MAX_MINUTES = 180;
const AVATAR_SPECIES_COUNT = 30;
const AVATAR_SPECIES_INDEX_MULTIPLIER = 7;
const COMBAT_ROUND_LIMIT = 5_000;
/** Log shows resist mitigation when the absorbed amount exceeds this HP. */
const COMBAT_LOG_RESIST_NOTE_THRESHOLD = 0.5;
const ELO_RATING_SCALE = 400;
const ELO_EXPECTED_SCORE_BASE = 10;

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
  const a = e?.appearance || {};
  return {
    race: e.race,
    skinColor: e.skinColor || a.skinColor || a.skin_color,
    eyeStyle: e.eyeStyle || a.eyeStyle || a.eye_style,
    ears: e.ears || a.ears,
    mouth: e.mouth || a.mouth,
    nose: e.nose || a.nose,
    eyebrows: e.eyebrows || a.eyebrows,
    marking: e.marking || a.marking,
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
  const total = computeCombatantTotalStats(character, equippedItems);
  const weighted = POWER_STAT_KEYS.reduce(
    (sum, k) => sum + (total[k] || 0) * (w[k] ?? DEFAULT_CLASS_STAT_WEIGHT),
    0,
  );
  return Math.round(
    (character.level || 1) * ARENA_POWER_PER_LEVEL
    + weighted * ARENA_POWER_PER_WEIGHTED_ATTRIBUTE,
  );
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

function botGearId(slot) {
  return `bot-${slot}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Cosmetic weapon only — empty stats so bot combat power comes from the
 * generated attribute snapshot (ExpectedPlayerAttributes × 0.85–1.15).
 */
export function pickGearForBot(_catalogItems, classKey, level) {
  const gearLevel = Math.max(1, level || 1);
  const weaponBase = generateClassWeapon(classKey, "common", gearLevel);
  return [{
    ...weaponBase,
    id: botGearId("weapon"),
    is_equipped: true,
    stats: {},
  }];
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
  const weighted = POWER_STAT_KEYS.reduce(
    (sum, k) => sum + (stats[k] || 0) * (w[k] ?? DEFAULT_CLASS_STAT_WEIGHT),
    0,
  );
  const power = Math.round(
    (char.level || 1) * ARENA_POWER_PER_LEVEL
    + weighted * ARENA_POWER_PER_WEIGHTED_ATTRIBUTE,
  );
  const lastOnlineMins = char.updated_date
    ? Math.max(0, Math.floor((Date.now() - new Date(char.updated_date).getTime()) / MILLISECONDS_PER_MINUTE))
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
    arena_rating: char.arena_rating || DEFAULT_ARENA_RATING,
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
  const myRating = player.arena_rating || DEFAULT_ARENA_RATING;
  const theirRating = candidate.arena_rating || DEFAULT_ARENA_RATING;
  const ratingGap = Math.abs(theirRating - myRating);
  const levelGap = Math.abs((candidate.level || 1) - (player.level || 1));
  let score = ratingGap + levelGap * ARENA_LEVEL_GAP_SCORE_WEIGHT;
  const mins = candidate.updated_date
    ? Math.max(0, (Date.now() - new Date(candidate.updated_date).getTime()) / MILLISECONDS_PER_MINUTE)
    : CANDIDATE_UNKNOWN_AGE_MINUTES;
  if (mins <= CANDIDATE_RECENT_THRESHOLD_MINUTES) score -= CANDIDATE_RECENT_SCORE_BONUS;
  else if (mins <= CANDIDATE_ACTIVE_THRESHOLD_MINUTES) score -= CANDIDATE_ACTIVE_SCORE_BONUS;
  else if (mins > CANDIDATE_STALE_THRESHOLD_MINUTES) score += CANDIDATE_STALE_SCORE_PENALTY;
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
  const myRating = player.arena_rating || DEFAULT_ARENA_RATING;
  const eligible = candidates.filter((c) => Math.abs((c.level || 1) - myLevel) <= levelBand);
  const scored = eligible
    .map((c) => ({ c, score: scoreArenaCandidate(player, c) }))
    .sort((a, b) => a.score - b.score);

  const tight = [];
  const wide = [];
  const rest = [];
  for (const row of scored) {
    const gap = Math.abs((row.c.arena_rating || DEFAULT_ARENA_RATING) - myRating);
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
    const band = pool.slice(0, Math.min(RANKED_CANDIDATE_PICK_BAND_SIZE, pool.length));
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

export function generateOpponents(character, count = ARENA_CHALLENGER_SLOTS, catalogItems = []) {
  const myLevel = character.level || 1;
  const myRating = character.arena_rating || DEFAULT_ARENA_RATING;
  const used = new Set();
  const out = [];
  for (let i = 0; i < count; i++) {
    const raceKey = pick(Object.keys(RACES));
    const snap = generateArenaBot({ playerLevel: myLevel });
    const classKey = snap.class;
    const level = snap.level;
    // Opponent rating stays near the player's (±40) so fights stay competitive.
    const rating = Math.max(
      0,
      myRating + Math.floor(Math.random() * BOT_RATING_VARIANCE * 2) - BOT_RATING_VARIANCE, // magic-number-ok: symmetric ±variance window
    );
    const stats = snap.stats;
    const equippedItems = pickGearForBot(catalogItems, classKey, level);
    const power = computePower({ level, class: classKey, stats, isBot: true }, equippedItems);
    const wins = Math.max(
      0,
      Math.floor(rating / BOT_WIN_RATING_DIVISOR)
      + Math.floor(Math.random() * BOT_RANDOM_WIN_BONUS_LIMIT),
    );
    const losses = Math.floor(wins * (BOT_LOSS_RATIO_MIN + Math.random() * BOT_LOSS_RATIO_RANGE));
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
      guild: Math.random() < BOT_GUILD_MEMBERSHIP_CHANCE ? pick(BOT_GUILDS) : null,
      lastOnlineMins: Math.floor(Math.random() * MINUTES_PER_DAY * BOT_LAST_ONLINE_MAX_DAYS),
      appearance: randomAppearance(raceKey),
      isBot: true,
      speciesId: ((i * AVATAR_SPECIES_INDEX_MULTIPLIER + name.charCodeAt(0)) % AVATAR_SPECIES_COUNT) + 1,
      equippedItems,
      equippedItemIds: equippedItems.map((it) => it.id),
      buildKey: snap.buildKey,
      strengthMultiplier: snap.strengthMultiplier,
    });
  }
  return out;
}

/**
 * Convert a persistent ladder bot (from /api/arena/bots) into a fightable opponent.
 * Uses stored stats when present; otherwise regenerates via generateArenaBot.
 * Cosmetic weapon only — combat power comes from the attribute snapshot.
 */
export function ladderBotToOpponent(bot, catalogItems = []) {
  if (!bot) return null;
  let classKey = bot.class;
  // Migrate legacy class names from older ladder rows.
  const LEGACY = {
    Shadowblade: "Shadow Operative",
    Arcanist: "Technomancer",
    Warden: "Astral Warden",
    Gunslinger: "Void Runner",
    Mystic: "Cosmic Engineer",
  };
  if (LEGACY[bot.class]) classKey = LEGACY[bot.class];
  if (!ARENA_BOT_CLASSES.includes(classKey)) classKey = "Vanguard";

  const level = bot.level || 1;
  let stats = bot.stats && Object.keys(bot.stats).length ? bot.stats : null;
  if (!stats) {
    const snap = generateArenaBot({ playerLevel: level, level, className: classKey });
    stats = snap.stats;
    classKey = snap.class;
  }
  const equippedItems = pickGearForBot(catalogItems, classKey, level);
  const power = computePower({ level, class: classKey, stats, isBot: true }, equippedItems);
  return {
    id: bot.id,
    arena_bot_id: bot.arena_bot_id || bot.id,
    name: bot.name,
    race: bot.race,
    class: classKey,
    level,
    arena_rating: bot.arena_rating || DEFAULT_ARENA_RATING,
    stats,
    power,
    arena_wins: bot.arena_wins || 0,
    arena_losses: bot.arena_losses || 0,
    guild: bot.guild || null,
    lastOnlineMins: bot.lastOnlineMins ?? Math.floor(Math.random() * LADDER_BOT_LAST_ONLINE_MAX_MINUTES),
    appearance: bot.appearance || randomAppearance(bot.race),
    isBot: true,
    speciesId: bot.speciesId ?? (((bot.name?.charCodeAt(0) || 1) % AVATAR_SPECIES_COUNT) + 1),
    equippedItems,
    equippedItemIds: equippedItems.map((it) => it.id),
  };
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
    arena_bot_id: opp.arena_bot_id || null,
    equippedItemIds,
    equippedItems,
    lastOnlineMins: opp.lastOnlineMins ?? 0,
  };
}

export function buildFighter(c, items, side, opts = {}) {
  // Effective totals — Stim multipliers apply as the final attribute step (Phase 5 owns Stim product).
  const stats = computeCombatantTotalStats(c, items);
  const cls = CLASSES[c.class] || CLASSES.Vanguard;
  const className = cls.name;
  const suppress = !!(c.suppressClassPassive || c.missionEnemy || c.dungeonEnemy);
  const derived = derivedCombatStats(c.level || 1, stats, className, {
    missionEnemy: !!c.missionEnemy,
    dungeonEnemy: !!c.dungeonEnemy,
  });
  const content = opts.content || "arena";
  const role = side === "player" ? "player" : "enemy";
  const contextMult = contextMultiplierFor(content, role, c.level || 1);
  const damageTypeEnum = derived.archetype === "Reflex"
    ? "REFLEX"
    : derived.archetype === "Tech"
      ? "TECH"
      : "MIGHT";
  return {
    side,
    name: c.name,
    className: suppress ? null : className,
    level: c.level || 1,
    hp: derived.maxHp,
    maxHp: derived.maxHp,
    barrier: 0,
    primaryValue: derived.primaryValue,
    intellectValue: derived.intellectValue,
    vitalityValue: derived.vitalityValue,
    archetype: derived.archetype,
    standardAttack: derived.standardAttack,
    canonicalDamage: derived.canonicalDamage,
    damageBase: derived.damageBase,
    crit: derived.crit,
    critMult: CRIT_DAMAGE_MULT || CRIT_MULT,
    dodge: derived.dodge,
    resists: derived.resists,
    damageChannel: derived.damageChannel,
    damageType: damageTypeEnum,
    contextMult,
    content,
    stats,
    suppressClassPassive: suppress,
    passive: suppress ? null : passiveNameForClass(className),
    passiveState: createPassiveState(),
  };
}

/**
 * Resolve one basic hit after dodge/miss has already been resolved.
 * Order (Test 18 / Phase 3):
 * canonical/raw → variance → Overclock outgoing → Crit/Tantrum → 3-channel resist
 * → Overclock incoming → context multiplier → round.
 * Player and Dungeon/Wormhole-enemy canonical damage is the native combat-scale
 * polynomial; player context is ×1, Dungeon/Wormhole enemy context is ×1.10.
 */
export function resolveBasicHit(attacker, defender, {
  canCrit = true,
  forceCrit = false,
  critChanceBonus = 0,
  critMultOverride = null,
  damageTypeForMitigation = attacker.damageChannel,
  outgoingMult = 1,
  incomingTakenMult = 1,
  contextMult = attacker.contextMult != null ? attacker.contextMult : 1,
  rng = Math.random,
  variance = null,
} = {}) {
  const flat = attacker.damageBase != null ? attacker.damageBase : STANDARD_ATTACK_FLAT;
  const raw = attacker.canonicalDamage != null
    ? Number(attacker.canonicalDamage)
    : rawAttack(attacker.primaryValue, flat);
  const rolledVariance = rollUniversalVariance(rng, variance);
  let damage = raw * rolledVariance;
  damage *= outgoingMult;

  let crit = false;
  if (canCrit) {
    const critChance = Math.max(0, (attacker.crit || 0) + (critChanceBonus || 0));
    crit = forceCrit || rng() < critChance;
    if (crit) {
      const mult = critMultOverride != null ? critMultOverride : (attacker.critMult || CRIT_DAMAGE_MULT);
      damage *= mult;
    }
  }

  const channel = String(damageTypeForMitigation || attacker.damageChannel || "might").toLowerCase();
  const resistPct = channel === DAMAGE_CHANNEL.True ? 0 : resistFraction(defender.resists, channel);
  const beforeResist = damage;
  damage *= (1 - resistPct);
  const resistedAmount = beforeResist - damage;
  damage *= incomingTakenMult;
  damage *= contextMult;

  const finalDamage = roundCombatDamage(damage);
  return {
    finalDamage,
    crit,
    variance: rolledVariance,
    resistPercent: resistPct,
    resistedAmount,
    damageChannel: channel,
    raw,
  };
}

export function applyHealing(target, healAmount) {
  const amount = Math.max(0, healAmount || 0);
  const missing = Math.max(0, (target.maxHp || 0) - target.hp);
  const healed = Math.min(missing, amount);
  target.hp = target.hp + healed;
  return { healed };
}

function damageTypeEnumFor(attacker, forcedDamageTypeEnum) {
  if (forcedDamageTypeEnum) return forcedDamageTypeEnum;
  if (attacker.damageType === "MIGHT" || attacker.damageType === "REFLEX" || attacker.damageType === "TECH") {
    return attacker.damageType;
  }
  if (attacker.archetype === "Tech" || attacker.damageChannel === "tech") return "TECH";
  if (attacker.archetype === "Reflex" || attacker.damageChannel === "reflex") return "REFLEX";
  return "MIGHT";
}

function channelForEnum(damageTypeEnum) {
  if (damageTypeEnum === "TRUE") return "true";
  if (damageTypeEnum === "TECH") return "tech";
  if (damageTypeEnum === "REFLEX") return "reflex";
  return "might";
}

/**
 * Execute one normal attack from attacker → defender.
 * Returns { killed, events appended to shared events array }.
 */
export function resolveNormalAttack(attacker, defender, events, {
  rng,
  forcedDamageTypeEnum = null,
  forcedCanDodge = true,
  totalTurn = null,
  ownTurn = null,
} = {}) {
  const damageTypeEnum = damageTypeEnumFor(attacker, forcedDamageTypeEnum);
  const canCritBase = damageTypeEnum !== "TRUE";
  const channel = channelForEnum(damageTypeEnum);
  const mods = beginNormalAttackModifiers(attacker);

  const stamp = (ev) => {
    if (!ev) return ev;
    if (totalTurn != null) ev.totalTurn = totalTurn;
    if (ownTurn != null) ev.ownTurn = ownTurn;
    return ev;
  };

  /** After any normal-attack attempt (hit/miss/dodge): consume mods, Overclock, Orbital. */
  const finishNormalAttackAttempt = (outcome, killed = false) => {
    endNormalAttackModifiers(attacker, mods, events);
    if (attacker.className === "Technomancer") {
      tickOverclockAfterAttempt(attacker, events);
    }
    if (!killed && defender.hp > 0 && attacker.hp > 0) {
      maybeOrbitalAssistant(attacker, defender, events, rng);
    }
    return { killed, outcome };
  };

  // Phantom Signal: forced miss (not a dodge) — does not trigger Kinetic Tantrum.
  if (forcedCanDodge !== false) {
    const phantom = tryPhantomSignalMiss(defender, events);
    if (phantom.forcedMiss) {
      const last = events[events.length - 1];
      if (last) {
        last.attacker = attacker.side;
        last.defender = defender.side;
        last.isNormalAttack = true;
        stamp(last);
      }
      return finishNormalAttackAttempt("miss", false);
    }
  }

  // Dodge (skipped on guaranteed hit / Strong Kinetic Tantrum).
  const canDodge = forcedCanDodge && !mods.guaranteedHit;
  if (canDodge) {
    const dodgeRoll = rng();
    if (dodgeRoll < defender.dodge) {
      events.push(stamp({
        type: "dodge",
        attacker: attacker.side,
        defender: defender.side,
        dodged: true,
        missed: false,
        damageType: damageTypeEnum,
        canDodge: true,
        canCrit: canCritBase,
        damage: 0,
        crit: false,
        shieldHit: false,
        ability: attacker.passive,
        isNormalAttack: true,
        naturalDodge: true,
        text: `${defender.name} dodges`,
      }));

      if (defender.className === "Vanguard") {
        activateKineticTantrum(defender, "normal", events);
      }
      if (attacker.className === "Vanguard") {
        activateKineticTantrum(attacker, "strong", events);
      }

      return finishNormalAttackAttempt("dodge", false);
    }
  }

  const hit = resolveBasicHit(attacker, defender, {
    canCrit: canCritBase,
    forceCrit: mods.guaranteedCrit,
    critChanceBonus: mods.critBonusFlat,
    critMultOverride: mods.critMultOverride,
    damageTypeForMitigation: channel,
    outgoingMult: overclockDealtMultiplier(attacker),
    incomingTakenMult: overclockTakenMultiplier(defender),
    contextMult: attacker.contextMult != null ? attacker.contextMult : 1,
    rng,
  });

  const res = applyDamageWithBarrier(defender, hit.finalDamage, events, { isDamagingHit: true });

  const resistNote = hit.resistedAmount > COMBAT_LOG_RESIST_NOTE_THRESHOLD
    ? ` · resist −${roundCombatDamage(hit.resistedAmount)}`
    : "";
  events.push(stamp({
    type: "attack",
    attacker: attacker.side,
    defender: defender.side,
    damage: res.hpDamage,
    barrierAbsorbed: res.barrierAbsorbed,
    shieldHit: res.shieldHit,
    crit: hit.crit,
    dodged: false,
    missed: false,
    ability: attacker.passive,
    damageType: damageTypeEnum,
    canDodge,
    canCrit: canCritBase,
    finalDamage: hit.finalDamage,
    isNormalAttack: true,
    guaranteedHit: !!mods.guaranteedHit,
    guaranteedCrit: !!mods.guaranteedCrit,
    critMultOverride: mods.critMultOverride,
    kineticMode: mods.kineticMode,
    resistPercent: hit.resistPercent,
    resistedAmount: hit.resistedAmount,
    variance: hit.variance,
    damageChannel: hit.damageChannel,
    text: `${attacker.name} hits ${defender.name} for ${res.hpDamage}${hit.crit ? " CRIT" : ""}${resistNote}`,
  }));

  if (hit.crit && defender.className === "Technomancer") {
    removeOverclockStacks(defender, OVERCLOCK_CRIT_STACK_LOSS, events);
  }

  return finishNormalAttackAttempt("hit", defender.hp <= 0);
}

export function simulateBattle(player, opp, playerItems = [], oppItems = [], opts = {}) {
  const { rng = Math.random } = opts || {};
  const forcedDamageTypeEnum = opts?.forceDamageTypeEnum ?? null;
  const forcedCanDodge = typeof opts?.forceCanDodge === "boolean" ? opts.forceCanDodge : true;
  const content = inferCombatContent(opts, player, opp);

  const A = buildFighter(player, playerItems, "player", { content });
  const B = buildFighter(opp, oppItems, "opponent", { content });

  const events = [];
  events.push(...onCombatStart(A, rng));
  events.push(...onCombatStart(B, rng));

  let attacker;
  let defender;
  let initiativeFirstSide;

  const aOpening = A.passiveState?.openingCharges || 0;
  const bOpening = B.passiveState?.openingCharges || 0;
  if (aOpening > 0 && bOpening > 0) {
    attacker = rng() < EVEN_CHANCE ? A : B;
    defender = attacker === A ? B : A;
    initiativeFirstSide = attacker.side;
  } else if (aOpening > 0) {
    attacker = A;
    defender = B;
    initiativeFirstSide = "player";
  } else if (bOpening > 0) {
    attacker = B;
    defender = A;
    initiativeFirstSide = "opponent";
  } else {
    const playerGoesFirst = rng() < EVEN_CHANCE;
    attacker = playerGoesFirst ? A : B;
    defender = playerGoesFirst ? B : A;
    initiativeFirstSide = attacker.side;
  }

  if (aOpening > 0 || bOpening > 0) {
    events.push({
      type: "passive",
      passive: "Dirty Tricks",
      kind: "stim_injector_turn_order",
      side: initiativeFirstSide,
      text: `Stim Injector takes the next two attack turns`,
    });
  }

  events.push({
    type: "initiative",
    opening_side: initiativeFirstSide,
    attacker: initiativeFirstSide,
    text: `${initiativeFirstSide === "player" ? A.name : B.name} opens combat`,
  });

  const telemetry = {
    totalTurns: 0,
    playerTurns: 0,
    opponentTurns: 0,
    playerDamage: 0,
    opponentDamage: 0,
    critCount: 0,
    dodgeCount: 0,
    forcedMissCount: 0,
    passiveActivations: 0,
  };

  let round = 0;
  while (A.hp > 0 && B.hp > 0 && round < COMBAT_ROUND_LIMIT) {
    round++;
    telemetry.totalTurns = round;
    if (attacker.side === "player") telemetry.playerTurns += 1;
    else telemetry.opponentTurns += 1;

    const stimStoleTurn = maybeUnlockDirtyTricks(A, round, rng, events)
      || maybeUnlockDirtyTricks(B, round, rng, events);
    if (stimStoleTurn) {
      if ((A.passiveState?.openingCharges || 0) > 0 && attacker !== A) {
        attacker = A;
        defender = B;
      } else if ((B.passiveState?.openingCharges || 0) > 0 && attacker !== B) {
        attacker = B;
        defender = A;
      }
    }

    const ownTurn = attacker.side === "player" ? telemetry.playerTurns : telemetry.opponentTurns;
    events.push(...onTurnStart(attacker, rng));

    const eventStart = events.length;
    const result = resolveNormalAttack(attacker, defender, events, {
      rng,
      forcedDamageTypeEnum,
      forcedCanDodge,
      totalTurn: round,
      ownTurn,
    });

    for (let i = eventStart; i < events.length; i++) {
      const ev = events[i];
      if (ev?.type === "dodge") telemetry.dodgeCount += 1;
      if (ev?.type === "miss") telemetry.forcedMissCount += 1;
      if (ev?.crit) telemetry.critCount += 1;
      if ((ev?.type === "attack" || ev?.kind === "fire_support") && Number(ev.damage || 0) > 0) {
        if (ev.attacker === "player") telemetry.playerDamage += Number(ev.damage);
        else if (ev.attacker === "opponent") telemetry.opponentDamage += Number(ev.damage);
      }
      if (ev?.type === "passive") telemetry.passiveActivations += 1;
    }

    if (result.killed || A.hp <= 0 || B.hp <= 0) break;

    if (consumeStimOpening(attacker, events)) {
      continue;
    }

    [attacker, defender] = [defender, attacker];
  }

  const winner = A.hp > 0 ? "player" : "opponent";
  return {
    events,
    winner,
    playerMaxHp: A.maxHp,
    opponentMaxHp: B.maxHp,
    initiativeFirstSide,
    content,
    telemetry,
    playerEnd: { hp: A.hp, barrier: A.barrier, ...snapshotPassiveHud(A) },
    opponentEnd: { hp: B.hp, barrier: B.barrier, ...snapshotPassiveHud(B) },
  };
}

// Elo K-factor and soft clamps keep climbs meaningful without runaway swings.
export const ARENA_ELO_K = 28;
export const ARENA_RATING_DELTA_MIN = 6;
export const ARENA_RATING_DELTA_MAX = 36;

/** Expected win chance for `playerRating` vs `oppRating` (classic Elo). */
export function eloExpectedScore(playerRating, oppRating) {
  return 1 / (
    1 + ELO_EXPECTED_SCORE_BASE ** (((oppRating || DEFAULT_ARENA_RATING) - (playerRating || DEFAULT_ARENA_RATING)) / ELO_RATING_SCALE)
  );
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
  if (!free || !won) return { experience: 0, stardust: 0 };
  const pl = player.level || 1;
  // Design: Arena SD = ARENA_WIN_FUEL_EQUIVALENT × SD/F; Arena XP = XP/F × 5/7.
  return {
    experience: getArenaXpReward(pl),
    stardust: getArenaStardustReward(pl),
  };
}

export function computeRewards(player, opp, won, free = true) {
  const ratingDelta = eloRatingDelta(
    player.arena_rating || DEFAULT_ARENA_RATING,
    opp.arena_rating || DEFAULT_ARENA_RATING,
    won,
  );
  const loot = lootForOutcome(player, opp, won, free);
  return {
    won,
    free,
    experience: loot.experience,
    stardust: loot.stardust,
    arena_rating_delta: ratingDelta,
  };
}

/** Pre-fight stakes preview used by challenger cards. */
export function previewArenaMatch(player, opp, { free = true } = {}) {
  const onWin = computeRewards(player, opp, true, free);
  const onLoss = computeRewards(player, opp, false, free);
  return { onWin, onLoss };
}
