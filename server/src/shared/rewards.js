import { getCollectionPercentage, applyXpBonus } from "./collectionBonus.js";
import { mergeAchievementUnlocks } from "./achievements.js";
import { mergeCollectionIds } from "./discovery.js";
import {
  EQUIPMENT_SLOTS,
  GenerateGearItem,
} from "./itemGeneration.js";
// LEGACY ECONOMY IMPLEMENTATION — PENDING SYSTEM-SPECIFIC MIGRATION/RECONCILIATION
import { XP_STARDUST_SCALE } from "./economyConstants.js";
import {
  xpToNext,
  missionXpPerFuel,
  roundHalfUp,
  MISSION_XPF_BASE,
  MISSION_XPF_LINEAR_COEFFICIENT,
  MISSION_XPF_POWER_COEFFICIENT,
  MISSION_XPF_EXPONENT,
} from "./productionMath.js";

export { XP_STARDUST_SCALE }; // legacy Stardust callers only — not XP
export { StardustPerFuel, StardustPerFuel as getMissionStardustPerFuel } from "./stardustEconomy.js";
export { GenerateGearItem } from "./itemGeneration.js";

const DEFAULT_INVENTORY_CAP = 10;
const POST_200_LEVEL_INTERVAL = 100;
const DEFAULT_MAX_FUEL = 100;
const REWARD_COLLECTION_QUERY_LIMIT = 500;
const LEGACY_COLLECTIBLE_SELL_VALUE = 25 * XP_STARDUST_SCALE; // Stardust sell, not XP

/** Prefer live getInventoryCap from economyFormulas (wired below / via hooks). */
function getInventoryCap(ch) {
  if (typeof globalThis.__llGetInventoryCap === "function") {
    return globalThis.__llGetInventoryCap(ch);
  }
  return DEFAULT_INVENTORY_CAP;
}

/** Keep in sync with src/lib/gameData.js ITEM_NAMES (Cosmic Vault keys). */
const ITEM_NAMES = {
  weapon: [
    "Plasma Rifle", "Ion Blaster", "Photon Cannon", "Pulse Repeater", "Neutrino Sniper", "Graviton Shotgun",
    "Phase Pistol", "Singularity Cannon", "Void Saber", "Photon Cleaver", "Starforged Blade", "Quantum Dagger",
    "Shadow Needle", "Phase Knife", "Nebula Bow", "Ion Longbow", "Graviton Axe", "Titan Maul", "Arc Staff", "Psionic Wand",
  ],
  armor: ["Nanoweave Suit", "Titan Plating", "Void Shell", "Quantum Mesh", "Stellar Guard", "Plasma Coat", "Crystal Carapace", "Shadow Shroud"],
  helmet: ["Neural Crown", "Scan Visor", "Astral Helm", "Combat HUD", "Psi Amplifier", "Void Mask", "Star Circlet", "Echo Chamber"],
  boots: ["Gravity Boots", "Phase Walkers", "Jet Treads", "Stealth Soles", "Mag-Lock Greaves", "Drift Runners", "Storm Striders", "Warp Steps"],
  legs: ["Void Greaves", "Plasma Leggings", "Titan Leg Plates", "Phase Treads", "Graviton Greaves"],
  neck: ["Quantum Amulet", "Void Collar", "Nebula Pendant", "Star Choker", "Plasma Torc"],
  accessory: ["Quantum Amulet", "Data Core Ring", "Nebula Charm", "Warp Beacon", "Chrono Band", "Star Shard Pendant", "Void Capacitor", "Neural Link"],
  ship_module: ["Warp Drive MK-I", "Shield Amplifier", "Cargo Expander", "Sensor Array", "Cloaking Module", "Turret System", "Engine Booster", "Hull Reinforcement"],
};

function pick(arr, rng = Math.random) {
  return arr[Math.floor(rng() * arr.length)];
}

/**
 * Live loot / shop gear roller — wraps shared GenerateGearItem + naming.
 * Pass `className` (player class) so Common–Epic use the per-item 60/40 favored pool.
 * Legendary ignores class and stays fully class-neutral.
 * generationContext is optional metadata (source id) and does not alter stats.
 */
export function randomItem(
  rarity,
  level = 1,
  type,
  rng = Math.random,
  className,
  generationContext = null,
) {
  const itemLevel = Math.max(1, level || 1);
  const t = type && EQUIPMENT_SLOTS.includes(type)
    ? type
    : pick(EQUIPMENT_SLOTS, rng);
  const names = ITEM_NAMES[t] || ITEM_NAMES.weapon;
  const base = GenerateGearItem({
    itemLevel,
    itemType: t,
    rarity,
    rng,
    className,
    generationContext,
  });
  const baseName = pick(names, rng);
  return {
    ...base,
    name: baseName,
    base_name: baseName,
  };
}

/** Bind randomItem to a player's class for shop stock / loot helpers. */
export function randomItemForClass(className) {
  return (rarity, level, type, rng) =>
    randomItem(rarity, level, type, typeof rng === "function" ? rng : Math.random, className);
}

/**
 * Live XP-to-next is productionMath.xpToNext (canonical 1:1 units).
 * Historical polynomial / Post-200 / early-game constants below are unused by
 * live progression — retained for the historical fit script only.
 */
export const XP_REQUIREMENT_MULTIPLIER = 1.35;
export const POST_200_START_LEVEL = 200;
export const POST_200_A = 0.8;
export const POST_200_P = 0.48;
export const POST_200_B = 0.79;
export const POST_200_Q = 0.71;
export const XP_GLOBAL_SLOWDOWN = 1.5;
export const EARLY_GAME_XP_START_BONUS = 0.2;
export const EARLY_GAME_XP_TAPER_LEVEL = 100;

/** @deprecated Historical — live XPToNext is productionMath.xpToNext. */
export function post200Growth(level) {
  const L = Math.max(1, Math.floor(Number(level) || 1));
  const X = Math.max(0, (L - POST_200_START_LEVEL) / POST_200_LEVEL_INTERVAL);
  return 1 + POST_200_A * X ** POST_200_P + POST_200_B * X ** POST_200_Q;
}

/** @deprecated Historical — live XPToNext is productionMath.xpToNext. */
export function earlyGameXpModifier(level) {
  const L = Math.max(1, Math.floor(Number(level) || 1));
  return 1 + EARLY_GAME_XP_START_BONUS * Math.max(0, 1 - L / EARLY_GAME_XP_TAPER_LEVEL);
}

export function expForLevel(level) {
  return xpToNext(level);
}

/** Coefficients match productionMath.missionXpPerFuel. */
export const XP_PER_FUEL_BASE = MISSION_XPF_BASE;
export const XP_PER_FUEL_LINEAR_COEFFICIENT = MISSION_XPF_LINEAR_COEFFICIENT;
export const XP_PER_FUEL_POWER_COEFFICIENT = MISSION_XPF_POWER_COEFFICIENT;
export const XP_PER_FUEL_EXPONENT = MISSION_XPF_EXPONENT;

/** Canonical mission XP per 1 Fuel — 1:1 units. Reward formulas stay later-phase. */
export function getMissionXpPerFuel(level = 1) {
  return Math.max(1, roundHalfUp(missionXpPerFuel(level)));
}

// StardustPerFuel / getMissionStardustPerFuel — see stardustEconomy.js (re-exported above).

/** Scale flat XP grants (dailies/promos) with the XP/fuel chart. */
export function scaleXpReward(baseXp, level = 1) {
  const base = Math.max(0, Number(baseXp) || 0);
  const rate = getMissionXpPerFuel(level);
  const atOne = getMissionXpPerFuel(1);
  return Math.max(base > 0 ? 1 : 0, Math.round(base * (rate / atOne)));
}

export {
  getStatPointsForLevel,
  getStatPointsForLevelRange,
  LEVEL_UP_ATTRS_PER_LEVEL,
} from "./characterProgression.js";
import { grantCharacterXp } from "./characterProgression.js";
import { createPendingLoot } from "../rewards/store.js";
import {
  creditNova,
  NOVA_HALF_UNITS_PER_NOVA,
  NovaBalanceTypes,
  toNovaHalfUnits,
} from "./currencyService.js";

export async function applyCharacterRewards(gameService, characterId, rewards) {
  const ch = await gameService.asServiceRole.entities.Character.get(characterId);
  const patch = {};
  const items = [];
  const pending_loot = [];
  let live = ch;

  if (rewards.stardust) {
    patch.stardust = (ch.stardust || 0) + rewards.stardust;
    patch.total_stardust_earned = (ch.total_stardust_earned || 0) + rewards.stardust;
  }
  if (rewards.nova_crystals) {
    // Display Nova → promotional bucket via authoritative ledger.
    const amount = Number(rewards.nova_crystals);
    if (Number.isFinite(amount) && amount > 0) {
      try {
        toNovaHalfUnits(amount);
      } catch {
        // Daily rewards historically used whole crystals; coerce to .0
      }
      const display = Math.floor(amount * NOVA_HALF_UNITS_PER_NOVA)
        / NOVA_HALF_UNITS_PER_NOVA;
      const mut = creditNova({
        user: { id: ch.created_by_id },
        character: live,
        amount: display,
        category: "reward_grant",
        reasonCode: rewards.reason_code || "promotional_reward",
        relatedEntityType: "character",
        relatedEntityId: ch.id,
        idempotencyKey: rewards.idempotencyKey || undefined,
        balanceType: rewards.nova_balance_type === "wagerable"
          ? NovaBalanceTypes.WAGERABLE
          : NovaBalanceTypes.PROMOTIONAL,
      });
      live = mut.character;
      Object.assign(patch, mut.patch);
    }
  }
  if (rewards.fuel) {
    patch.fuel = Math.min(ch.max_fuel || DEFAULT_MAX_FUEL, (ch.fuel || 0) + rewards.fuel);
  }
  if (rewards.experience) {
    const allItems = await gameService.asServiceRole.entities.Item.filter(
      {},
      null,
      REWARD_COLLECTION_QUERY_LIMIT,
    );
    const collectPct = getCollectionPercentage(ch, allItems.length);
    const scaled = scaleXpReward(rewards.experience, ch.level || 1);
    const boostedXp = applyXpBonus(scaled, collectPct);
    const granted = grantCharacterXp({
      character: ch,
      xpAmount: boostedXp,
      source: "applyCharacterRewards",
    });
    Object.assign(patch, granted.patch);
    if (granted.progression) patch.__progression = granted.progression;
  }

  if (rewards.item_rarity) {
    const it = randomItem(rewards.item_rarity, ch.level || 1, undefined, Math.random, ch.class);
    const payload = {
      ...it,
      owner_id: ch.created_by_id,
      character_id: ch.id,
      is_equipped: false,
    };
    const owned = await gameService.asServiceRole.entities.Item.filter({ character_id: ch.id });
    const bagCount = owned.filter((i) => !i.is_equipped).length;
    if (bagCount >= getInventoryCap(ch)) {
      const pl = createPendingLoot({
        accountId: ch.created_by_id,
        characterId: ch.id,
        item: payload,
      });
      pending_loot.push({ id: pl.id, item: pl.item });
    } else {
      const created = await gameService.asServiceRole.entities.Item.create(payload);
      items.push(created);
    }
  }
  if (rewards.collectible) {
    const c = rewards.collectible;
    if (c.type === "consumable") {
      const payload = {
        name: c.name,
        type: "consumable",
        rarity: c.rarity || "uncommon",
        level_requirement: 1,
        stats: {},
        consumable: c.consumable,
        flavor_text: c.flavor_text || "Granted via promo code.",
        sell_value: c.sell_value || LEGACY_COLLECTIBLE_SELL_VALUE,
        is_equipped: false,
        owner_id: ch.created_by_id,
        character_id: ch.id,
      };
      const owned = await gameService.asServiceRole.entities.Item.filter({ character_id: ch.id });
      const bagCount = owned.filter((i) => !i.is_equipped).length;
      if (bagCount >= getInventoryCap(ch)) {
        const pl = createPendingLoot({
          accountId: ch.created_by_id,
          characterId: ch.id,
          item: payload,
        });
        pending_loot.push({ id: pl.id, item: pl.item });
      } else {
        const created = await gameService.asServiceRole.entities.Item.create(payload);
        items.push(created);
      }
    }
    if (c.kind === "species" && c.id) {
      mergeCollectionIds(ch, patch, "discovered_species", [c.id]);
    }
    if (c.kind === "artifact" && c.id) {
      mergeCollectionIds(ch, patch, "collected_artifacts", [c.id]);
    }
    if (c.kind === "relic" && c.id) {
      mergeCollectionIds(ch, patch, "collected_relics", [c.id]);
    }
  }

  const ach = mergeAchievementUnlocks(ch, patch);
  Object.assign(patch, ach.patch);

  const progression = patch.__progression || null;
  delete patch.__progression;

  await gameService.asServiceRole.entities.Character.update(characterId, patch);
  return { patch, items, pending_loot, newly_unlocked: ach.newly_unlocked, progression };
}

export const DAILY_REWARDS = [
  { day: 1, rewards: { stardust: 100 } },
  { day: 2, rewards: { experience: 8000 } },
  { day: 3, rewards: { stardust: 600 } },
  { day: 4, rewards: { fuel: 25 } },
  { day: 5, rewards: { item_rarity: "rare" } },
  { day: 6, rewards: { nova_crystals: 3 } },
  { day: 7, rewards: { stardust: 1500 } },
  { day: 8, rewards: { stardust: 800 } },
  { day: 9, rewards: { experience: 10000 } },
  { day: 10, rewards: { collectible: { type: "consumable", name: "Uncommon Strength Stim", rarity: "uncommon", consumable: { stat: "strength", mult: 0.05, duration_hours: 6, tier: "uncommon" }, flavor_text: "Boosts Strength by 5% for 6 hours (stacks duration up to 18h).", sell_value: 250 } } },
  { day: 11, rewards: { stardust: 1000 } },
  { day: 12, rewards: { fuel: 30 } },
  { day: 13, rewards: { nova_crystals: 4 } },
  { day: 14, rewards: { experience: 12000 } },
  { day: 15, rewards: { item_rarity: "rare" } },
  { day: 16, rewards: { stardust: 2000 } },
  { day: 17, rewards: { stardust: 1200 } },
  { day: 18, rewards: { collectible: { type: "consumable", name: "Uncommon Agility Stim", rarity: "uncommon", consumable: { stat: "agility", mult: 0.05, duration_hours: 6, tier: "uncommon" }, flavor_text: "Boosts Agility by 5% for 6 hours (stacks duration up to 18h).", sell_value: 250 } } },
  { day: 19, rewards: { experience: 15000 } },
  { day: 20, rewards: { nova_crystals: 8 } },
  { day: 21, rewards: { item_rarity: "rare", stardust: 1500 } },
  { day: 22, rewards: { experience: 20000 } },
  { day: 23, rewards: { collectible: { type: "consumable", name: "Rare Vitality Stim", rarity: "rare", consumable: { stat: "vitality", mult: 0.10, duration_hours: 12, tier: "rare" }, flavor_text: "Boosts Vitality by 10% for 12 hours (stacks duration up to 36h).", sell_value: 600 } } },
  { day: 24, rewards: { stardust: 2000 } },
  { day: 25, rewards: { item_rarity: "epic" } },
  { day: 26, rewards: { nova_crystals: 10 } },
  { day: 27, rewards: { experience: 25000 } },
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
    rewards: { experience: 9000000 },
  },
};

export async function redeemPromoCode(gameService, character, code) {
  const raw = String(code || "").trim();
  const entry = PROMO_CODES[raw]
    || PROMO_CODES[Object.keys(PROMO_CODES).find((k) => k.toLowerCase() === raw.toLowerCase())];
  if (!entry) return { ok: false, status: 404, error: "Invalid promo code" };
  const canonical = (
    Object.keys(PROMO_CODES).find((k) => PROMO_CODES[k] === entry) || raw
  ).toUpperCase();
  const redeemed = character.promo_codes_redeemed || [];
  if (redeemed.some((c) => String(c || "").toUpperCase() === canonical)) {
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
  special.promo_codes_redeemed = [
    ...new Set([...(ch.promo_codes_redeemed || redeemed).map(String), canonical]),
  ];
  await gameService.asServiceRole.entities.Character.update(ch.id, special);
  return { ok: true, patch: { ...patch, ...special }, items, code: canonical, label: entry.label };
}
