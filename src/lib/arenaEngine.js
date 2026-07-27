// ═══════════════════════════════════════════
// ARENA ENGINE — async PvP simulation
// ═══════════════════════════════════════════
import { RACES, CLASSES } from "@/lib/gameData";
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

// Determines which class an item's stat distribution favours (for bot gear matching).
function classForItem(item) {
  const s = item.stats || {};
  let top = null, topVal = 0;
  for (const [k, v] of Object.entries(s)) {
    if ((v || 0) > topVal) { topVal = v || 0; top = k; }
  }
  const map = { strength: "Vanguard", agility: "Shadow Operative", intellect: "Technomancer", vitality: "Astral Warden", luck: "Cosmic Engineer" };
  return map[top] || null;
}

// Picks 2-3 catalog item IDs that suit the bot's class and level — these are
// the gear pieces the enemy is "wearing," which the player can discover in battle.
function pickGearForBot(catalogItems, classKey, level) {
  if (!catalogItems || !catalogItems.length) return [];
  const underLevel = catalogItems.filter((it) => (it.level_requirement || 1) <= level);
  const suitable = underLevel.filter((it) => classForItem(it) === classKey);
  const pool = suitable.length >= 2 ? suitable : underLevel;
  if (!pool.length) return [];
  const picks = new Set();
  // Always equip a weapon so the enemy's actual weapon shows in combat.
  const weapons = pool.filter((it) => it.type === "weapon");
  if (weapons.length) picks.add(weapons[Math.floor(Math.random() * weapons.length)].id);
  const num = 1 + Math.floor(Math.random() * 2);
  for (let i = 0; i < num; i++) picks.add(pool[Math.floor(Math.random() * pool.length)].id);
  return [...picks];
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
    guild: guildTag,
    lastOnlineMins,
    appearance: char.appearance || {},
    avatar_url: char.avatar_url,
    active_title: char.active_title,
    isBot: false,
    equippedItems,
    speciesId: null,
  };
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
    const w = getClassWeights(classKey);
    const weighted = POWER_STAT_KEYS.reduce((sum, k) => sum + (stats[k] || 0) * (w[k] ?? 0.1), 0);
    const power = Math.round(level * 10 + weighted * 7.5);
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
      equippedItemIds: pickGearForBot(catalogItems, classKey, level),
    });
  }
  return out;
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

export function computeRewards(player, opp, won, free = true) {
  const levelDiff = (opp.level || 1) - (player.level || 1);
  const ratingDiff = (opp.arena_rating || 1000) - (player.arena_rating || 1000);

  if (won) {
    const upsetBonus = ratingDiff > 0 ? Math.min(20, Math.floor(ratingDiff / 15)) : 0;
    const ratingDelta = 18 + upsetBonus + Math.max(0, Math.floor(ratingDiff / 20));
    if (free) {
      const xp = 40 + (opp.level || 1) * 8 + Math.max(0, levelDiff * 5);
      const stardust = 50 + (opp.level || 1) * 12;
      return { won: true, free: true, experience: xp, stardust, arena_rating_delta: ratingDelta };
    }
    // Paid battles (beyond the daily free quota) yield rating only.
    return { won: true, free: false, experience: 0, stardust: 0, arena_rating_delta: ratingDelta };
  }

  const ratingDelta = Math.max(-25, -(10 + Math.max(0, Math.floor(-ratingDiff / 30))));
  if (free) {
    const xp = 12 + (opp.level || 1) * 3;
    const stardust = 15 + (opp.level || 1) * 2;
    return { won: false, free: true, experience: xp, stardust, arena_rating_delta: ratingDelta };
  }
  return { won: false, free: false, experience: 0, stardust: 0, arena_rating_delta: ratingDelta };
}