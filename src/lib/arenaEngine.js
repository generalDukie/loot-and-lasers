// ═══════════════════════════════════════════
// ARENA ENGINE — async PvP simulation
// ═══════════════════════════════════════════
import { RACES, CLASSES, generateItem, generateClassWeapon, getArenaStardustReward, getArenaXpReward } from "@/lib/gameData";
import {
  computeTotalStats,
  computePermanentTotalStats,
  computeDerivedStats,
  getClassWeights,
  rollBasicAttackDamage,
  mitigationForDamageType,
  CRIT_MULT,
} from "@/lib/statEngine";
import {
  onCombatStart,
  onTurnStart,
  activateKineticTantrum,
  beginNormalAttackModifiers,
  endNormalAttackModifiers,
  tryPhantomSignalMiss,
  overclockDealtMultiplier,
  overclockTakenMultiplier,
  gainOverclockStack,
  removeOverclockStacks,
  applyDamageWithBarrier,
  maybeOrbitalAssistant,
  hasStimInjector,
  OVERCLOCK_CRIT_STACK_LOSS,
  passiveNameForClass,
} from "@/lib/classPassives";
import { EYES, EARS, MOUTHS, NOSES, BROWS, MARKINGS } from "@/lib/avatarFeatures";

// First 10 arena battles each day are free (grant xp + stardust + rating on wins only).
// Losses never grant XP or stardust. Beyond the free quota, each battle costs nova
// crystals and yields rating only, but can be fought indefinitely to climb.
export const ARENA_DAILY_FREE_BATTLES = 10;
export const ARENA_PAID_BATTLE_COST = 5; // nova crystals per battle after the free quota
export const ARENA_REFRESH_MS = 5 * 60 * 1000;
export const ARENA_REFRESH_COST = 500; // stardust (10× scale)
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
    : generateItem(weaponRarity, gearLevel, "weapon", classKey);
  items.push({ ...weaponBase, id: botGearId("weapon"), is_equipped: true });

  const extras = [...BOT_EXTRA_SLOTS].sort(() => Math.random() - 0.5);
  const extraCount = 1 + Math.floor(Math.random() * 2);
  for (let i = 0; i < extraCount; i++) {
    const type = extras[i];
    const piece = generateItem(rollBotRarity(gearLevel), gearLevel, type, classKey);
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

/**
 * Convert a persistent ladder bot (from /api/arena/bots) into a fightable opponent.
 * Attaches generated gear so combat power matches ephemeral bots.
 */
export function ladderBotToOpponent(bot, catalogItems = []) {
  if (!bot) return null;
  const classKey = bot.class || "Vanguard";
  const level = bot.level || 1;
  const stats = bot.stats && Object.keys(bot.stats).length
    ? bot.stats
    : botStats(level, CLASSES[classKey] || CLASSES.Vanguard);
  const equippedItems = pickGearForBot(catalogItems, classKey, level);
  const power = computePower({ level, class: classKey, stats }, equippedItems);
  return {
    id: bot.id,
    arena_bot_id: bot.arena_bot_id || bot.id,
    name: bot.name,
    race: bot.race,
    class: classKey,
    level,
    arena_rating: bot.arena_rating || 1000,
    stats,
    power,
    arena_wins: bot.arena_wins || 0,
    arena_losses: bot.arena_losses || 0,
    guild: bot.guild || null,
    lastOnlineMins: bot.lastOnlineMins ?? Math.floor(Math.random() * 180),
    appearance: bot.appearance || randomAppearance(bot.race),
    isBot: true,
    speciesId: bot.speciesId ?? (((bot.name?.charCodeAt(0) || 1) % 30) + 1),
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

function buildFighter(c, items, side) {
  // Permanent totals only — stims stay off the combat attribute pipeline.
  const stats = computePermanentTotalStats(c, items);
  const cls = CLASSES[c.class] || CLASSES.Vanguard;
  const derived = computeDerivedStats(stats, c);
  const className = cls.name;
  // Mission enemies (and any suppressClassPassive combatant) keep class-family
  // damage/resist rules via computeDerivedStats(character.class) but must not
  // receive player class passives — blank className for passive hooks.
  const suppress = !!(c.suppressClassPassive || c.missionEnemy);
  return {
    side,
    name: c.name,
    className: suppress ? null : className,
    hp: derived.health,
    maxHp: derived.health,
    barrier: 0,
    primaryValue: derived.primaryValue,
    archetype: derived.archetype,
    /** Sheet expected attack (no variance) — used by secondary effects like Fire Support. */
    standardAttack: derived.damage,
    crit: derived.critChance / 100,
    critMult: derived.critMult || CRIT_MULT,
    dodge: derived.dodgeChance / 100,
    armorPercent: derived.armor || 0,
    techResistPercent: derived.techResist || 0,
    damageType: derived.damageType || "strength",
    stats,
    suppressClassPassive: suppress,
    passive: suppress ? null : passiveNameForClass(className),
    passiveState: null,
  };
}

/**
 * Resolve one basic hit after dodge/miss has already been resolved:
 * raw → optional outgoing mult (Overclock) → crit → mitigation → incoming taken mult → round.
 */
function resolveBasicHit(attacker, defender, {
  canCrit = true,
  forceCrit = false,
  critChanceBonus = 0,
  critMultOverride = null,
  damageTypeForMitigation = attacker.damageType,
  outgoingMult = 1,
  incomingTakenMult = 1,
  rng = Math.random,
} = {}) {
  let damage = rollBasicAttackDamage(attacker.archetype, attacker.primaryValue, rng);
  damage *= outgoingMult;

  let crit = false;
  if (canCrit) {
    const critChance = Math.max(0, (attacker.crit || 0) + (critChanceBonus || 0));
    crit = forceCrit || rng() < critChance;
    if (crit) {
      const mult = critMultOverride != null ? critMultOverride : (attacker.critMult || CRIT_MULT);
      damage *= mult;
    }
  }

  const mit = mitigationForDamageType(
    damageTypeForMitigation,
    defender.armorPercent,
    defender.techResistPercent,
  );
  damage *= (1 - mit);
  damage *= incomingTakenMult;

  const finalDamage = Math.max(0, Math.round(damage));
  return { finalDamage, crit };
}

function applyHealing(target, healAmount) {
  const amount = Math.max(0, healAmount || 0);
  const missing = Math.max(0, (target.maxHp || 0) - target.hp);
  const healed = Math.min(missing, amount);
  target.hp = target.hp + healed;
  return { healed };
}

function damageTypeEnumFor(attacker, forcedDamageTypeEnum) {
  if (forcedDamageTypeEnum) return forcedDamageTypeEnum;
  if (attacker.damageType === "strength") return "MIGHT";
  if (attacker.damageType === "tech") return "TECH";
  return "REFLEX";
}

function mitigationTypeForEnum(damageTypeEnum) {
  if (damageTypeEnum === "MIGHT") return "strength";
  if (damageTypeEnum === "TECH") return "tech";
  if (damageTypeEnum === "REFLEX") return "agility";
  return "true";
}

/**
 * Execute one normal attack from attacker → defender.
 * Returns { killed, events appended to shared events array }.
 */
function resolveNormalAttack(attacker, defender, events, {
  rng,
  forcedDamageTypeEnum = null,
  forcedCanDodge = true,
}) {
  const damageTypeEnum = damageTypeEnumFor(attacker, forcedDamageTypeEnum);
  const canCritBase = damageTypeEnum !== "TRUE";
  const mitigationType = mitigationTypeForEnum(damageTypeEnum);
  const mods = beginNormalAttackModifiers(attacker);

  // Phantom Signal: forced miss (not a dodge) — does not trigger Kinetic Tantrum.
  if (forcedCanDodge !== false) {
    const phantom = tryPhantomSignalMiss(defender, events);
    if (phantom.forcedMiss) {
      const last = events[events.length - 1];
      if (last) {
        last.attacker = attacker.side;
        last.defender = defender.side;
      }
      endNormalAttackModifiers(attacker, mods, events);
      return { killed: false, outcome: "miss" };
    }
  }

  // Dodge (skipped on guaranteed hit / Strong Kinetic Tantrum).
  const canDodge = forcedCanDodge && !mods.guaranteedHit;
  if (canDodge) {
    const dodgeRoll = rng();
    if (dodgeRoll < defender.dodge) {
      events.push({
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
        text: `${defender.name} dodges!`,
      });

      // Dodge-specific hooks (Kinetic Tantrum).
      if (defender.className === "Vanguard") {
        activateKineticTantrum(defender, "normal", events);
      }
      if (attacker.className === "Vanguard") {
        activateKineticTantrum(attacker, "strong", events);
      }

      endNormalAttackModifiers(attacker, mods, events);
      return { killed: false, outcome: "dodge" };
    }
  }

  const hit = resolveBasicHit(attacker, defender, {
    canCrit: canCritBase,
    forceCrit: mods.guaranteedCrit,
    critChanceBonus: mods.critBonusFlat,
    critMultOverride: mods.critMultOverride,
    damageTypeForMitigation: mitigationType,
    outgoingMult: overclockDealtMultiplier(attacker),
    incomingTakenMult: overclockTakenMultiplier(defender),
    rng,
  });

  const res = applyDamageWithBarrier(defender, hit.finalDamage, events, { isDamagingHit: true });

  events.push({
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
  });

  // Enemy Crit vs Technomancer removes Overclock stacks after crit is confirmed.
  if (hit.crit && defender.className === "Technomancer") {
    removeOverclockStacks(defender, OVERCLOCK_CRIT_STACK_LOSS, events);
  }

  endNormalAttackModifiers(attacker, mods, events);

  // After normal attack: Overclock gain, Orbital Assistant.
  if (attacker.className === "Technomancer") {
    gainOverclockStack(attacker, events);
  }
  maybeOrbitalAssistant(attacker, defender, events, rng);

  return { killed: defender.hp <= 0, outcome: "hit" };
}

/**
 * Build opening turn order when Stim Injector is active.
 * Returns null for normal initiative alternating.
 */
function buildStimTurnPlan(A, B, rng) {
  const aStim = hasStimInjector(A);
  const bStim = hasStimInjector(B);
  if (!aStim && !bStim) return null;
  let runner;
  let other;
  if (aStim && bStim) {
    runner = rng() < 0.5 ? A : B;
    other = runner === A ? B : A;
  } else if (aStim) {
    runner = A;
    other = B;
  } else {
    runner = B;
    other = A;
  }
  // Opening: runner, runner, other, then alternate starting with runner.
  return {
    kind: "stim_injector",
    runnerSide: runner.side,
    queue: [runner, runner, other],
    afterAlternateAttacker: runner,
  };
}

export function simulateBattle(player, opp, playerItems = [], oppItems = [], opts = {}) {
  const { rng = Math.random } = opts || {};
  const forcedDamageTypeEnum = opts?.forceDamageTypeEnum ?? null;
  const forcedCanDodge = typeof opts?.forceCanDodge === "boolean" ? opts.forceCanDodge : true;

  const A = buildFighter(player, playerItems, "player");
  const B = buildFighter(opp, oppItems, "opponent");

  const events = [];
  events.push(...onCombatStart(A, rng));
  events.push(...onCombatStart(B, rng));

  const stimPlan = buildStimTurnPlan(A, B, rng);
  let attacker;
  let defender;
  let initiativeFirstSide;
  let stimQueue = null;

  if (stimPlan) {
    stimQueue = [...stimPlan.queue];
    attacker = stimQueue.shift();
    defender = attacker === A ? B : A;
    initiativeFirstSide = stimPlan.runnerSide;
    events.push({
      type: "passive",
      passive: "Dirty Tricks",
      kind: "stim_injector_turn_order",
      side: stimPlan.runnerSide,
      text: `Stim Injector overrides opening turns`,
    });
  } else {
    const playerGoesFirst = rng() < 0.5;
    attacker = playerGoesFirst ? A : B;
    defender = playerGoesFirst ? B : A;
    initiativeFirstSide = attacker.side;
  }

  let round = 0;
  while (A.hp > 0 && B.hp > 0 && round < 5000) {
    round++;

    events.push(...onTurnStart(attacker, rng));

    const result = resolveNormalAttack(attacker, defender, events, {
      rng,
      forcedDamageTypeEnum,
      forcedCanDodge,
    });

    if (result.killed || A.hp <= 0 || B.hp <= 0) break;

    if (stimQueue && stimQueue.length > 0) {
      attacker = stimQueue.shift();
      defender = attacker === A ? B : A;
      continue;
    }

    // Normal alternating after stim opening (or always when no stim).
    [attacker, defender] = [defender, attacker];
  }

  const winner = A.hp > 0 ? "player" : "opponent";
  return {
    events,
    winner,
    playerMaxHp: A.maxHp,
    opponentMaxHp: B.maxHp,
    initiativeFirstSide,
    playerEnd: { hp: A.hp, barrier: A.barrier, passiveState: { ...A.passiveState } },
    opponentEnd: { hp: B.hp, barrier: B.barrier, passiveState: { ...B.passiveState } },
  };
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
  if (!free || !won) return { experience: 0, stardust: 0 };
  const pl = player.level || 1;
  // Design: Arena SD = SD/F × 5/3, Arena XP = XP/F × 5/7 (win amounts).
  return {
    experience: getArenaXpReward(pl),
    stardust: getArenaStardustReward(pl),
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