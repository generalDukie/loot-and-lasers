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

export function expForLevel(level) {
  return Math.floor(60 * Math.pow(1.42, level - 1));
}

export async function applyCharacterRewards(base44, characterId, rewards) {
  const ch = await base44.asServiceRole.entities.Character.get(characterId);
  const patch = {};
  const items = [];

  if (rewards.stardust) {
    patch.stardust = (ch.stardust || 0) + rewards.stardust;
    patch.total_stardust_earned = (ch.total_stardust_earned || 0) + rewards.stardust;
  }
  if (rewards.nova_crystals) patch.nova_crystals = (ch.nova_crystals || 0) + rewards.nova_crystals;
  if (rewards.fuel) patch.fuel = Math.min(ch.max_fuel || 100, (ch.fuel || 0) + rewards.fuel);
  if (rewards.experience) {
    const allItems = await base44.asServiceRole.entities.Item.filter({}, null, 500);
    const collectPct = getCollectionPercentage(ch, allItems.length);
    const boostedXp = applyXpBonus(rewards.experience, collectPct);
    let newExp = (ch.experience || 0) + boostedXp;
    let newLevel = ch.level || 1;
    let expToNext = ch.experience_to_next_level || expForLevel(newLevel);
    let statPoints = 0;
    while (newExp >= expToNext) {
      newExp -= expToNext;
      newLevel++;
      statPoints += 4;
      expToNext = expForLevel(newLevel);
    }
    patch.experience = newExp;
    patch.level = newLevel;
    patch.experience_to_next_level = expToNext;
    if (statPoints > 0) patch.unspent_stat_points = (ch.unspent_stat_points || 0) + statPoints;
  }

  if (rewards.item_rarity) {
    const owned = await base44.asServiceRole.entities.Item.filter({ character_id: ch.id });
    if (owned.length >= getInventoryCap(ch)) {
      const comp = { common: 8, uncommon: 20, rare: 50, epic: 120, legendary: 280 }[rewards.item_rarity] || 8;
      patch.stardust = (patch.stardust ?? ch.stardust ?? 0) + comp;
      patch.total_stardust_earned = (patch.total_stardust_earned ?? ch.total_stardust_earned ?? 0) + comp;
    } else {
      const it = randomItem(rewards.item_rarity, ch.level || 1);
      const created = await base44.asServiceRole.entities.Item.create({
        ...it, owner_id: ch.created_by_id, character_id: ch.id,
      });
      items.push(created);
    }
  }
  if (rewards.collectible) {
    const c = rewards.collectible;
    if (c.type === "consumable") {
      const owned = await base44.asServiceRole.entities.Item.filter({ character_id: ch.id });
      if (owned.length >= getInventoryCap(ch)) {
        const comp = c.sell_value || 25;
        patch.stardust = (patch.stardust ?? ch.stardust ?? 0) + comp;
        patch.total_stardust_earned = (patch.total_stardust_earned ?? ch.total_stardust_earned ?? 0) + comp;
      } else {
        const created = await base44.asServiceRole.entities.Item.create({
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

  await base44.asServiceRole.entities.Character.update(characterId, patch);
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
    rewards: { level: 150, nova_crystals: 50000, fullLegendary: true },
  },
};

export async function redeemPromoCode(base44, character, code) {
  const entry = PROMO_CODES[code];
  if (!entry) return { ok: false, status: 404, error: "Invalid promo code" };
  const redeemed = character.promo_codes_redeemed || [];
  if (redeemed.includes(code)) return { ok: false, status: 409, error: "Code already redeemed" };

  const patch = {};
  if (entry.rewards.nova_crystals) patch.nova_crystals = (character.nova_crystals || 0) + entry.rewards.nova_crystals;
  if (entry.rewards.level) {
    patch.level = entry.rewards.level;
    patch.experience = 0;
    patch.experience_to_next_level = expForLevel(entry.rewards.level);
    const gained = entry.rewards.level - (character.level || 1);
    if (gained > 0) patch.unspent_stat_points = (character.unspent_stat_points || 0) + gained * 4;
  }
  const items = [];
  if (entry.rewards.fullLegendary) {
    const slots = ["weapon", "armor", "helmet", "boots", "accessory", "ship_module"];
    const equipped = { ...(character.equipped_items || {}) };
    const lvl = entry.rewards.level || character.level || 1;
    for (const type of slots) {
      const it = randomItem("legendary", lvl, type);
      const created = await base44.asServiceRole.entities.Item.create({
        ...it, owner_id: character.created_by_id, character_id: character.id, is_equipped: true,
      });
      items.push(created);
      equipped[type] = created.id;
    }
    patch.equipped_items = equipped;
  }
  patch.promo_codes_redeemed = [...redeemed, code];
  await base44.asServiceRole.entities.Character.update(character.id, patch);
  return { ok: true, patch, items, code, label: entry.label };
}
