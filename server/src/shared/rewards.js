import { getCollectionPercentage, applyXpBonus } from "./collectionBonus.js";
import { mergeAchievementUnlocks } from "./achievements.js";
import {
  EQUIPMENT_SLOTS,
  rollItemStats,
  computeItemVendorValue,
} from "./itemGeneration.js";
import { XP_STARDUST_SCALE } from "./economyConstants.js";

export { XP_STARDUST_SCALE };

/** Prefer live getInventoryCap from economyFormulas (wired below / via hooks). */
function getInventoryCap(ch) {
  if (typeof globalThis.__llGetInventoryCap === "function") {
    return globalThis.__llGetInventoryCap(ch);
  }
  return 10;
}

const ITEM_NAMES = {
  weapon: ["Plasma Cutter", "Void Lance", "Pulse Blaster", "Quantum Repeater", "Starforged Blade", "Ion Carbine"],
  armor: ["Aegis Plate", "Nebula Weave", "Carbon Carapace", "Flux Barrier", "Void Shell", "Titan Plating"],
  helmet: ["Sensor Crown", "Visor of Foresight", "Neural Helm", "Starlit Mask", "Breach Visor"],
  boots: ["Gravity Greaves", "Photon Striders", "Comet Steps", "Drift Walkers", "Mag-Lock Treads"],
  legs: ["Void Greaves", "Plasma Leggings", "Titan Leg Plates", "Phase Treads", "Graviton Greaves"],
  neck: ["Quantum Amulet", "Void Collar", "Nebula Pendant", "Star Choker", "Plasma Torc"],
  accessory: ["Phase Ring", "Chrono Charm", "Lucky Comet", "Soul Capacitor", "Orbit Band"],
  ship_module: ["Warp Coil", "Shield Matrix", "Targeting Array", "Singularity Core", "Nav Beacon"],
};

function pick(arr, rng = Math.random) {
  return arr[Math.floor(rng() * arr.length)];
}

/**
 * Live loot / shop gear roller — budgeted attributes by level, slot, and rarity.
 * Pass `className` (player class) so Common–Epic use the per-item 60/40 favored pool.
 * Legendary ignores class and stays fully class-neutral.
 */
export function randomItem(rarity, level = 1, type, rng = Math.random, className) {
  const itemLevel = Math.max(1, level || 1);
  const t = type && EQUIPMENT_SLOTS.includes(type)
    ? type
    : pick(EQUIPMENT_SLOTS, rng);
  const names = ITEM_NAMES[t] || ITEM_NAMES.weapon;
  const { stats } = rollItemStats({ itemLevel, type: t, rarity, rng, className });
  const item = {
    name: pick(names, rng),
    type: t,
    rarity,
    level_requirement: itemLevel,
    stats,
    is_equipped: false,
  };
  item.sell_value = computeItemVendorValue(item);
  return item;
}

/** Bind randomItem to a player's class for shop stock / loot helpers. */
export function randomItemForClass(className) {
  return (rarity, level, type, rng) =>
    randomItem(rarity, level, type, typeof rng === "function" ? rng : Math.random, className);
}

function lerpWaypoints(level, points) {
  const L = Math.max(1, Math.floor(level || 1));
  if (L <= points[0][0]) return points[0][1];
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    if (L <= x1) {
      const t = (L - x0) / (x1 - x0);
      return y0 + (y1 - y0) * t;
    }
  }
  const [xA, yA] = points[points.length - 2];
  const [xB, yB] = points[points.length - 1];
  const slope = (yB - yA) / (xB - xA);
  return yB + slope * (L - xB);
}

/** XP to next: waypoint chart through 500, then closed-form forever.
 * Levels 1–4 are hand-curated overrides; Level 5+ uses the formula below unchanged.
 */
const XP_TO_NEXT_WAYPOINTS = [
  [1, 40], [5, 50], [10, 120], [15, 150], [25, 335],
  [50, 1135], [75, 1810], [100, 2590], [150, 4460],
  [200, 14300], [250, 19800], [300, 51700], [350, 65000],
  [400, 159000], [450, 190000], [500, 228000],
];

/** Existing XP-to-next formula (waypoints + closed form + L≤5 −20 easing). Do not alter. */
function existingExpForLevelFormula(L) {
  let xp;
  if (L <= 500) {
    xp = Math.max(1, Math.round(lerpWaypoints(L, XP_TO_NEXT_WAYPOINTS)));
  } else {
    xp = Math.max(1, Math.round(2.106 * (L ** 1.532) * (1 + (L / 266) ** 3.683)));
  }
  // Early easing only: −20 XP each for levels 1–5. Formula/waypoints unchanged.
  if (L <= 5) xp = Math.max(1, xp - 20);
  return xp;
}

export function expForLevel(level) {
  const L = Math.max(1, Math.floor(level || 1));
  let xp;
  switch (L) {
    case 1: xp = 10; break;
    case 2: xp = 15; break;
    case 3: xp = 25; break;
    case 4: xp = 40; break;
    default: xp = existingExpForLevelFormula(L);
  }
  return xp * XP_STARDUST_SCALE;
}

const MISSION_XP_PER_FUEL_WAYPOINTS = [
  [1, 10], [10, 16], [25, 29], [50, 57], [75, 90], [100, 130],
  [150, 223], [200, 334], [250, 461], [300, 603], [350, 758],
  [400, 927], [450, 1108], [500, 1301],
];

const MISSION_SD_PER_FUEL_WAYPOINTS = [
  [1, 4], [5, 5], [10, 8], [15, 12], [20, 18], [25, 25],
  [50, 60], [75, 120], [100, 225], [150, 600], [200, 1500],
  [250, 3500], [300, 7500], [325, 10135], [350, 13693],
  [375, 18502], [400, 25000], [425, 31746], [450, 40311],
  [475, 51188], [500, 65000],
];

export function getMissionXpPerFuel(level = 1) {
  return Math.max(1, Math.round(lerpWaypoints(level, MISSION_XP_PER_FUEL_WAYPOINTS))) * XP_STARDUST_SCALE;
}

export function getMissionStardustPerFuel(level = 1) {
  return Math.max(1, Math.round(lerpWaypoints(level, MISSION_SD_PER_FUEL_WAYPOINTS))) * XP_STARDUST_SCALE;
}

/** Scale flat XP grants (dailies/promos) with the XP/fuel chart. */
export function scaleXpReward(baseXp, level = 1) {
  const base = Math.max(0, Number(baseXp) || 0);
  const rate = getMissionXpPerFuel(level);
  const atOne = getMissionXpPerFuel(1);
  return Math.max(base > 0 ? 1 : 0, Math.round(base * (rate / atOne)));
}

export function getStatPointsForLevel(_level) {
  return 0;
}

export function getStatPointsForLevelRange(_fromLevel, _toLevel) {
  return 0;
}

export async function applyCharacterRewards(gameService, characterId, rewards) {
  const ch = await gameService.asServiceRole.entities.Character.get(characterId);
  const patch = {};
  const items = [];

  if (rewards.stardust) {
    patch.stardust = (ch.stardust || 0) + rewards.stardust;
    patch.total_stardust_earned = (ch.total_stardust_earned || 0) + rewards.stardust;
  }
  if (rewards.nova_crystals) patch.nova_crystals = (ch.nova_crystals || 0) + rewards.nova_crystals;
  if (rewards.fuel) patch.fuel = Math.min(ch.max_fuel || 100, (ch.fuel || 0) + rewards.fuel);
  if (rewards.experience) {
    const allItems = await gameService.asServiceRole.entities.Item.filter({}, null, 500);
    const collectPct = getCollectionPercentage(ch, allItems.length);
    const scaled = scaleXpReward(rewards.experience, ch.level || 1);
    const boostedXp = applyXpBonus(scaled, collectPct);
    let newExp = (ch.experience || 0) + boostedXp;
    let newLevel = ch.level || 1;
    let expToNext = ch.experience_to_next_level || expForLevel(newLevel);
    const prevLevel = newLevel;
    while (newExp >= expToNext) {
      newExp -= expToNext;
      newLevel++;
      expToNext = expForLevel(newLevel);
    }
    const statPoints = getStatPointsForLevelRange(prevLevel, newLevel);
    patch.experience = newExp;
    patch.level = newLevel;
    patch.experience_to_next_level = expToNext;
    if (statPoints > 0) patch.unspent_stat_points = (ch.unspent_stat_points || 0) + statPoints;
  }

  if (rewards.item_rarity) {
    const owned = await gameService.asServiceRole.entities.Item.filter({ character_id: ch.id });
    const bagCount = owned.filter((i) => !i.is_equipped).length;
    if (bagCount >= getInventoryCap(ch)) {
      const comp = {
        common: 8 * XP_STARDUST_SCALE,
        uncommon: 20 * XP_STARDUST_SCALE,
        rare: 50 * XP_STARDUST_SCALE,
        epic: 120 * XP_STARDUST_SCALE,
        legendary: 280 * XP_STARDUST_SCALE,
      }[rewards.item_rarity] || (8 * XP_STARDUST_SCALE);
      patch.stardust = (patch.stardust ?? ch.stardust ?? 0) + comp;
      patch.total_stardust_earned = (patch.total_stardust_earned ?? ch.total_stardust_earned ?? 0) + comp;
    } else {
      const it = randomItem(rewards.item_rarity, ch.level || 1, undefined, Math.random, ch.class);
      const created = await gameService.asServiceRole.entities.Item.create({
        ...it, owner_id: ch.created_by_id, character_id: ch.id,
      });
      items.push(created);
    }
  }
  if (rewards.collectible) {
    const c = rewards.collectible;
    if (c.type === "consumable") {
      const owned = await gameService.asServiceRole.entities.Item.filter({ character_id: ch.id });
      const bagCount = owned.filter((i) => !i.is_equipped).length;
      if (bagCount >= getInventoryCap(ch)) {
        const comp = c.sell_value || (25 * XP_STARDUST_SCALE);
        patch.stardust = (patch.stardust ?? ch.stardust ?? 0) + comp;
        patch.total_stardust_earned = (patch.total_stardust_earned ?? ch.total_stardust_earned ?? 0) + comp;
      } else {
        const created = await gameService.asServiceRole.entities.Item.create({
          name: c.name,
          type: "consumable",
          rarity: c.rarity || "uncommon",
          level_requirement: 1,
          stats: {},
          consumable: c.consumable,
          flavor_text: c.flavor_text || "Granted via promo code.",
          sell_value: c.sell_value || (25 * XP_STARDUST_SCALE),
          is_equipped: false,
          owner_id: ch.created_by_id,
          character_id: ch.id,
        });
        items.push(created);
      }
    }
    if (c.kind === "species" && c.id) patch.discovered_species = [...(ch.discovered_species || []), c.id];
    if (c.kind === "artifact" && c.id) patch.collected_artifacts = [...(ch.collected_artifacts || []), c.id];
    if (c.kind === "relic" && c.id) patch.collected_relics = [...(ch.collected_relics || []), c.id];
  }

  const ach = mergeAchievementUnlocks(ch, patch);
  Object.assign(patch, ach.patch);

  await gameService.asServiceRole.entities.Character.update(characterId, patch);
  return { patch, items, newly_unlocked: ach.newly_unlocked };
}

export const DAILY_REWARDS = [
  { day: 1, rewards: { stardust: 500 } },
  { day: 2, rewards: { experience: 800 } },
  { day: 3, rewards: { stardust: 600 } },
  { day: 4, rewards: { fuel: 25 } },
  { day: 5, rewards: { item_rarity: "rare" } },
  { day: 6, rewards: { nova_crystals: 3 } },
  { day: 7, rewards: { stardust: 1500 } },
  { day: 8, rewards: { stardust: 800 } },
  { day: 9, rewards: { experience: 1000 } },
  { day: 10, rewards: { collectible: { type: "consumable", name: "Minor Strength Stim", rarity: "uncommon", consumable: { stat: "strength", mult: 0.05, duration_hours: 6, tier: "minor" }, flavor_text: "Boosts Strength by 5% for 6 hours.", sell_value: 250 } } },
  { day: 11, rewards: { stardust: 1000 } },
  { day: 12, rewards: { fuel: 30 } },
  { day: 13, rewards: { nova_crystals: 4 } },
  { day: 14, rewards: { experience: 1200 } },
  { day: 15, rewards: { item_rarity: "rare" } },
  { day: 16, rewards: { stardust: 2000 } },
  { day: 17, rewards: { stardust: 1200 } },
  { day: 18, rewards: { collectible: { type: "consumable", name: "Minor Agility Stim", rarity: "uncommon", consumable: { stat: "agility", mult: 0.05, duration_hours: 6, tier: "minor" }, flavor_text: "Boosts Agility by 5% for 6 hours.", sell_value: 250 } } },
  { day: 19, rewards: { experience: 1500 } },
  { day: 20, rewards: { nova_crystals: 8 } },
  { day: 21, rewards: { item_rarity: "rare", stardust: 1500 } },
  { day: 22, rewards: { experience: 2000 } },
  { day: 23, rewards: { collectible: { type: "consumable", name: "Major Vitality Stim", rarity: "rare", consumable: { stat: "vitality", mult: 0.15, duration_hours: 12, tier: "major" }, flavor_text: "Boosts Vitality by 15% for 12 hours.", sell_value: 600 } } },
  { day: 24, rewards: { stardust: 2000 } },
  { day: 25, rewards: { item_rarity: "epic" } },
  { day: 26, rewards: { nova_crystals: 10 } },
  { day: 27, rewards: { experience: 2500 } },
  { day: 28, rewards: { stardust: 3000 } },
  { day: 29, rewards: { stardust: 3000, fuel: 40 } },
  { day: 30, rewards: { item_rarity: "legendary" } },
];

export const PROMO_CODES = {
  FoundersOnly: {
    label: "Founders Pack",
    // Nova capped — was 50k and wrecked hard-currency scarcity before IAP.
    rewards: { level: 150, nova_crystals: 100, fullLegendary: true },
  },
  XP90K: {
    label: "90,000 Experience Dump",
    rewards: { experience: 900000 },
  },
};

export async function redeemPromoCode(gameService, character, code) {
  const entry = PROMO_CODES[code] || PROMO_CODES[Object.keys(PROMO_CODES).find((k) => k.toLowerCase() === String(code).toLowerCase())];
  if (!entry) return { ok: false, status: 404, error: "Invalid promo code" };
  const canonical = Object.keys(PROMO_CODES).find((k) => PROMO_CODES[k] === entry) || code;
  const redeemed = character.promo_codes_redeemed || [];
  if (redeemed.includes(canonical) || redeemed.includes(code)) {
    return { ok: false, status: 409, error: "Code already redeemed" };
  }

  const r = entry.rewards || {};
  const standard = {};
  if (r.experience) standard.experience = r.experience;
  if (r.stardust) standard.stardust = r.stardust;
  if (r.nova_crystals && !r.level) standard.nova_crystals = r.nova_crystals;
  if (r.fuel) standard.fuel = r.fuel;

  let patch = {};
  let items = [];
  if (Object.keys(standard).length) {
    const applied = await applyCharacterRewards(gameService, character.id, standard);
    patch = { ...applied.patch };
    items = applied.items || [];
  }

  // Re-read after standard apply so special rewards stack cleanly.
  const ch = await gameService.asServiceRole.entities.Character.get(character.id);
  const special = {};
  if (r.nova_crystals && r.level) {
    special.nova_crystals = (ch.nova_crystals || 0) + r.nova_crystals;
  }
  if (r.level) {
    special.level = r.level;
    special.experience = 0;
    special.experience_to_next_level = expForLevel(r.level);
    const gained = r.level - (ch.level || 1);
    if (gained > 0) {
      special.unspent_stat_points =
        (ch.unspent_stat_points || 0) + getStatPointsForLevelRange(ch.level || 1, r.level);
    }
  }
  if (r.fullLegendary) {
    const slots = ["weapon", "armor", "helmet", "boots", "accessory", "ship_module"];
    const equipped = { ...(ch.equipped_items || {}) };
    const lvl = r.level || ch.level || 1;
    for (const type of slots) {
      const it = randomItem("legendary", lvl, type, Math.random, ch.class);
      const created = await gameService.asServiceRole.entities.Item.create({
        ...it, owner_id: ch.created_by_id, character_id: ch.id, is_equipped: true,
      });
      items.push(created);
      equipped[type] = created.id;
    }
    special.equipped_items = equipped;
  }
  special.promo_codes_redeemed = [...(ch.promo_codes_redeemed || redeemed), canonical];
  await gameService.asServiceRole.entities.Character.update(ch.id, special);
  return { ok: true, patch: { ...patch, ...special }, items, code: canonical, label: entry.label };
}
