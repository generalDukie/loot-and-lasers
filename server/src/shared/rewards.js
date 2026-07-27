import { getCollectionPercentage, applyXpBonus } from "./collectionBonus.js";

const ITEM_TYPES = ["weapon", "armor", "helmet", "boots", "accessory", "ship_module"];
const ITEM_NAMES = {
  weapon: ["Plasma Cutter", "Void Lance", "Pulse Blaster", "Quantum Repeater"],
  armor: ["Aegis Plate", "Nebula Weave", "Carbon Carapace", "Flux Barrier"],
  helmet: ["Sensor Crown", "Visor of Foresight", "Neural Helm", "Starlit Mask"],
  boots: ["Gravity Greaves", "Photon Striders", "Comet Steps", "Drift Walkers"],
  accessory: ["Phase Ring", "Chrono Charm", "Lucky Comet", "Soul Capacitor"],
  ship_module: ["Warp Coil", "Shield Matrix", "Targeting Array", "Singularity Core"],
};
const STAT_KEYS = ["strength", "agility", "intellect", "vitality", "luck"];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function getInventoryCap(ch) {
  const shipId = ch.active_ship || "scout";
  const loadouts = ch.ship_mod_loadouts;
  const ids = (loadouts && Array.isArray(loadouts[shipId])) ? loadouts[shipId] : (ch.ship_mods || []);
  let bonus = 0;
  for (let i = 1; i <= 10; i++) if (ids.includes(`cargo_hold_${i}`)) bonus += 1;
  return Math.min(20, 10 + bonus);
}

export function randomItem(rarity, level = 1, type) {
  const t = type || pick(ITEM_TYPES);
  const names = ITEM_NAMES[t] || ITEM_NAMES.weapon;
  const statCount = rarity === "legendary" ? 5 : rarity === "epic" ? 4 : rarity === "rare" ? 3 : rarity === "uncommon" ? 2 : 1;
  const stats = {};
  for (let i = 0; i < statCount; i++) {
    const k = pick(STAT_KEYS);
    stats[k] = (stats[k] || 0) + (level + Math.floor(Math.random() * 8) + 2);
  }
  return {
    name: pick(names),
    type: t,
    rarity,
    level_requirement: Math.max(1, level - 2),
    stats,
    sell_value: { common: 10, uncommon: 30, rare: 80, epic: 200, legendary: 500 }[rarity] || 10,
    is_equipped: false,
  };
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

const XP_TO_NEXT_WAYPOINTS = [
  [1, 40], [5, 50], [10, 120], [15, 150], [25, 335],
  [50, 1135], [75, 1810], [100, 2590], [150, 4460],
  [200, 14300], [250, 19800], [300, 51700], [350, 65000],
  [400, 159000], [450, 190000], [500, 228000],
];

const MISSION_XP_PER_FUEL_WAYPOINTS = [
  [1, 10], [10, 16], [25, 29], [50, 57], [75, 90], [100, 130],
  [150, 223], [200, 334], [250, 461], [300, 603], [350, 758],
  [400, 927], [450, 1108], [500, 1301],
];

export function expForLevel(level) {
  return Math.max(1, Math.round(lerpWaypoints(level, XP_TO_NEXT_WAYPOINTS)));
}

export function getMissionXpPerFuel(level = 1) {
  return Math.max(1, Math.round(lerpWaypoints(level, MISSION_XP_PER_FUEL_WAYPOINTS)));
}

/** Scale flat XP grants (dailies/promos) with the XP/fuel chart. */
export function scaleXpReward(baseXp, level = 1) {
  const base = Math.max(0, Number(baseXp) || 0);
  const rate = getMissionXpPerFuel(level);
  const atOne = getMissionXpPerFuel(1);
  return Math.max(base > 0 ? 1 : 0, Math.round(base * (rate / atOne)));
}

export function getStatPointsForLevel(level) {
  const L = Math.max(1, level || 1);
  if (L <= 50) return 4;
  if (L <= 100) return 3;
  if (L <= 200) return 2;
  return 1;
}

export function getStatPointsForLevelRange(fromLevel, toLevel) {
  const from = Math.max(1, fromLevel || 1);
  const to = Math.max(from, toLevel || from);
  let pts = 0;
  for (let L = from + 1; L <= to; L++) pts += getStatPointsForLevel(L);
  return pts;
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
    if (owned.length >= getInventoryCap(ch)) {
      const comp = { common: 8, uncommon: 20, rare: 50, epic: 120, legendary: 280 }[rewards.item_rarity] || 8;
      patch.stardust = (patch.stardust ?? ch.stardust ?? 0) + comp;
      patch.total_stardust_earned = (patch.total_stardust_earned ?? ch.total_stardust_earned ?? 0) + comp;
    } else {
      const it = randomItem(rewards.item_rarity, ch.level || 1);
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
      if (owned.length >= getInventoryCap(ch)) {
        const comp = c.sell_value || 25;
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
          sell_value: c.sell_value || 25,
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

  await gameService.asServiceRole.entities.Character.update(characterId, patch);
  return { patch, items };
}

export const DAILY_REWARDS = [
  { day: 1, rewards: { stardust: 50 } },
  { day: 2, rewards: { experience: 80 } },
  { day: 3, rewards: { stardust: 60 } },
  { day: 4, rewards: { fuel: 25 } },
  { day: 5, rewards: { item_rarity: "rare" } },
  { day: 6, rewards: { nova_crystals: 3 } },
  { day: 7, rewards: { stardust: 150 } },
  { day: 8, rewards: { stardust: 80 } },
  { day: 9, rewards: { experience: 100 } },
  { day: 10, rewards: { collectible: { type: "consumable", name: "Minor Strength Stim", rarity: "uncommon", consumable: { stat: "strength", mult: 0.05, duration_hours: 6, tier: "minor" }, flavor_text: "Boosts Strength by 5% for 6 hours.", sell_value: 25 } } },
  { day: 11, rewards: { stardust: 100 } },
  { day: 12, rewards: { fuel: 30 } },
  { day: 13, rewards: { nova_crystals: 4 } },
  { day: 14, rewards: { experience: 120 } },
  { day: 15, rewards: { item_rarity: "rare" } },
  { day: 16, rewards: { stardust: 200 } },
  { day: 17, rewards: { stardust: 120 } },
  { day: 18, rewards: { collectible: { type: "consumable", name: "Minor Agility Stim", rarity: "uncommon", consumable: { stat: "agility", mult: 0.05, duration_hours: 6, tier: "minor" }, flavor_text: "Boosts Agility by 5% for 6 hours.", sell_value: 25 } } },
  { day: 19, rewards: { experience: 150 } },
  { day: 20, rewards: { nova_crystals: 8 } },
  { day: 21, rewards: { item_rarity: "rare", stardust: 150 } },
  { day: 22, rewards: { experience: 200 } },
  { day: 23, rewards: { collectible: { type: "consumable", name: "Major Vitality Stim", rarity: "rare", consumable: { stat: "vitality", mult: 0.15, duration_hours: 12, tier: "major" }, flavor_text: "Boosts Vitality by 15% for 12 hours.", sell_value: 60 } } },
  { day: 24, rewards: { stardust: 200 } },
  { day: 25, rewards: { item_rarity: "epic" } },
  { day: 26, rewards: { nova_crystals: 10 } },
  { day: 27, rewards: { experience: 250 } },
  { day: 28, rewards: { stardust: 300 } },
  { day: 29, rewards: { stardust: 300, fuel: 40 } },
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
    rewards: { experience: 90000 },
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
      const it = randomItem("legendary", lvl, type);
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
