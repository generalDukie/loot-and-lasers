/**
 * Server-authoritative economy function handlers (Critical #2).
 */
import { entities } from "../entities.js";
import { withTransactionAsync } from "../db.js";
import { randomItem } from "../shared/rewards.js";
import { getCollectionPercentage, applyXpBonus } from "../shared/collectionBonus.js";
import {
  ATTR_STAT_KEYS,
  getNextAttributePointCost,
  computeStardustValue,
  FUEL_MAX,
  FUEL_PURCHASE_AMOUNT,
  FUEL_PURCHASE_COST,
  FUEL_PURCHASE_MAX,
  checkFuelReset,
  MAX_FUEL_MOUNTS,
  getFuelMountById,
  getActiveFuelMounts,
  getEffectiveFuelCost,
  getEffectiveMissionDuration,
  getModEffectTotal,
  normalizeMissionEfficiency,
  rollMissionEfficiency,
  computeMissionXpFromFuel,
  computeMissionStardustFromFuel,
  skipCostFor,
  SHOP_REFRESH_COST,
  getShopWindow,
  todayET,
  rollHaggle,
  normalizeShopMeta,
  shopGearSeed,
  shopConsSeed,
  generateSimpleGearStock,
  generateSimpleConsStock,
  generateSimpleHotDeal,
  prepareConsumableBuffs,
  rollItemRarity,
  applyXpToCharacter,
  getInventoryCap,
  randomConsumable,
  progressWeeklyNovaQuest,
} from "../shared/economyFormulas.js";
import { ECONOMY_FOLLOW_ON_HANDLERS } from "./economyFollowOn.js";

function httpErr(status, message) {
  const e = new Error(message);
  e.status = status;
  throw e;
}

function requireMyChar(user) {
  const list = entities.Character.filter({ created_by_id: user.id }, "-created_date", 50);
  if (!list.length) httpErr(404, "No character");
  const activeId = user.active_character_id;
  if (activeId) {
    const active = list.find((c) => c.id === activeId);
    if (active) return active;
  }
  return list[0];
}

function applyFuelResetIfNeeded(ch) {
  const reset = checkFuelReset(ch);
  if (!reset) return { ch, resetPatch: null };
  const updated = entities.Character.update(ch.id, reset);
  return { ch: updated, resetPatch: reset };
}

function grantOrCompensate(ch, itemPayload, patch) {
  const cap = getInventoryCap(ch);
  const owned = entities.Item.filter({ character_id: ch.id }, null, 500);
  const unequipped = owned.filter((i) => !i.is_equipped).length;
  if (unequipped >= cap) {
    const comp = computeStardustValue(itemPayload);
    patch.stardust = (patch.stardust ?? ch.stardust ?? 0) + comp;
    patch.total_stardust_earned = (patch.total_stardust_earned ?? ch.total_stardust_earned ?? 0) + comp;
    return { item: null, compensated: comp };
  }
  const created = entities.Item.create({
    ...itemPayload,
    owner_id: ch.created_by_id,
    character_id: ch.id,
    is_equipped: false,
  });
  return { item: created, compensated: 0 };
}

function stripShopFields(slot) {
  const {
    _slotId, cost, nova_cost, _hotDeal, _bundle, bundle_items, _cost,
    ...itemData
  } = slot;
  return itemData;
}

function computeMissionGains(character, mission, nexusBonus) {
  const bonusMult = nexusBonus ? 1.05 : 1;
  const stardustMult = 1 + getModEffectTotal(character, "mission_stardust_mult");
  const xpMult = 1 + getModEffectTotal(character, "mission_xp_mult");
  const percentage = getCollectionPercentage(character, 0);
  const fuelCost = getEffectiveFuelCost(character, mission);
  const sdEff = normalizeMissionEfficiency(mission?.stardust_efficiency);
  const xpEff = normalizeMissionEfficiency(mission?.xp_efficiency);
  const chartXp = computeMissionXpFromFuel(fuelCost, character.level, xpEff);
  const chartSd = computeMissionStardustFromFuel(fuelCost, character.level, sdEff);
  const baseXp = Math.round(chartXp * xpMult);
  return {
    bonusMult,
    fuelCost,
    efficiency: sdEff,
    xpEfficiency: xpEff,
    stardustGain: Math.round(chartSd * bonusMult * stardustMult),
    stardustBase: chartSd,
    xpBase: chartXp,
    xpGain: applyXpBonus(baseXp, percentage),
    collectionPct: percentage,
  };
}

// ── DissolveItem ─────────────────────────────────────────────
export async function DissolveItem(user, body) {
  const itemId = body?.item_id;
  if (!itemId) return { status: 400, body: { error: "Missing item_id" } };

  try {
    const result = await withTransactionAsync(async () => {
      const ch = requireMyChar(user);
      const item = entities.Item.get(itemId);
      if (!item) httpErr(404, "Item not found");
      if (item.character_id !== ch.id) httpErr(403, "Not your item");
      if (item.locked) httpErr(400, "Item is locked");
      if (item.is_equipped) httpErr(400, "Unequip item before dissolving");

      const gained = computeStardustValue(item);
      entities.Item.delete(itemId);
      const patch = {
        stardust: (ch.stardust || 0) + gained,
        total_stardust_earned: (ch.total_stardust_earned || 0) + gained,
      };
      const character = entities.Character.update(ch.id, patch);
      return { success: true, stardust_gained: gained, patch, character };
    });
    return { status: 200, body: result };
  } catch (err) {
    if (err.status) return { status: err.status, body: { error: err.message } };
    throw err;
  }
}

// ── DissolveJunk ─────────────────────────────────────────────
export async function DissolveJunk(user, body) {
  const ids = Array.isArray(body?.item_ids) ? body.item_ids : [];
  if (!ids.length) return { status: 400, body: { error: "Missing item_ids" } };

  try {
    const result = await withTransactionAsync(async () => {
      const ch = requireMyChar(user);
      let total = 0;
      const dissolved = [];
      for (const id of ids) {
        const item = entities.Item.get(id);
        if (!item || item.character_id !== ch.id) continue;
        if (item.locked || item.is_equipped) continue;
        total += computeStardustValue(item);
        entities.Item.delete(id);
        dissolved.push(id);
      }
      const patch = {
        stardust: (ch.stardust || 0) + total,
        total_stardust_earned: (ch.total_stardust_earned || 0) + total,
      };
      const character = entities.Character.update(ch.id, patch);
      return { success: true, stardust_gained: total, dissolved, patch, character };
    });
    return { status: 200, body: result };
  } catch (err) {
    if (err.status) return { status: err.status, body: { error: err.message } };
    throw err;
  }
}

// ── BuyAttribute ─────────────────────────────────────────────
export async function BuyAttribute(user, body) {
  const stat = body?.stat;
  if (!ATTR_STAT_KEYS.includes(stat)) {
    return { status: 400, body: { error: "Invalid stat" } };
  }

  try {
    const result = await withTransactionAsync(async () => {
      const ch = requireMyChar(user);
      const cost = getNextAttributePointCost(ch, stat);
      if ((ch.stardust || 0) < cost) httpErr(400, "Not enough stardust");

      const byStat = {
        strength: 0, agility: 0, intellect: 0, vitality: 0, luck: 0,
        ...(ch.attribute_purchases_by_stat || {}),
      };
      byStat[stat] = (byStat[stat] || 0) + 1;
      const stats = { ...(ch.stats || {}) };
      stats[stat] = (stats[stat] || 0) + 1;

      const patch = {
        stardust: (ch.stardust || 0) - cost,
        stats,
        attribute_purchases_by_stat: byStat,
        attribute_purchases: Object.values(byStat).reduce((a, b) => a + (b || 0), 0),
      };
      const character = entities.Character.update(ch.id, patch);
      return { success: true, cost, stat, patch, character };
    });
    return { status: 200, body: result };
  } catch (err) {
    if (err.status) return { status: err.status, body: { error: err.message } };
    throw err;
  }
}

// ── BuyFuel ──────────────────────────────────────────────────
export async function BuyFuel(user) {
  try {
    const result = await withTransactionAsync(async () => {
      let ch = requireMyChar(user);
      const { ch: resetCh, resetPatch } = applyFuelResetIfNeeded(ch);
      ch = resetCh;

      const purchases = ch.fuel_purchases || 0;
      if (purchases >= FUEL_PURCHASE_MAX) httpErr(400, "Fuel purchase limit reached this cycle");
      if ((ch.nova_crystals || 0) < FUEL_PURCHASE_COST) httpErr(400, "Not enough Nova Crystals");

      const max = ch.max_fuel || FUEL_MAX;
      const patch = {
        ...(resetPatch || {}),
        nova_crystals: (ch.nova_crystals || 0) - FUEL_PURCHASE_COST,
        fuel: Math.min(max, (ch.fuel || 0) + FUEL_PURCHASE_AMOUNT),
        fuel_purchases: purchases + 1,
        fuel_updated_at: new Date().toISOString(),
      };
      const character = entities.Character.update(ch.id, patch);
      return { success: true, patch, character };
    });
    return { status: 200, body: result };
  } catch (err) {
    if (err.status) return { status: err.status, body: { error: err.message } };
    throw err;
  }
}

// ── BuyFuelMount ─────────────────────────────────────────────
export async function BuyFuelMount(user, body) {
  const mountId = body?.mount_id;
  const mount = getFuelMountById(mountId);
  if (!mount) return { status: 400, body: { error: "Invalid mount_id" } };

  try {
    const result = await withTransactionAsync(async () => {
      const ch = requireMyChar(user);
      if ((ch.stardust || 0) < mount.stardust) httpErr(400, "Not enough stardust");
      if (mount.crystals && (ch.nova_crystals || 0) < mount.crystals) {
        httpErr(400, "Not enough Nova Crystals");
      }

      const now = Date.now();
      const durationMs = mount.duration_hours * 3600 * 1000;
      const active = getActiveFuelMounts(ch);
      const activeMount = active[0] || null;

      if (activeMount && new Date(activeMount.expires_at).getTime() - now >= durationMs * MAX_FUEL_MOUNTS) {
        httpErr(400, `${mount.name} is already stacked to the max (${MAX_FUEL_MOUNTS}×)`);
      }

      let entry;
      if (!activeMount) {
        entry = {
          id: mount.id, name: mount.name, emoji: mount.emoji, speed: mount.speed,
          expires_at: new Date(now + durationMs).toISOString(),
        };
      } else {
        const baseExpiry = Math.max(now, new Date(activeMount.expires_at).getTime());
        const newExpiry = Math.min(baseExpiry + durationMs, now + durationMs * MAX_FUEL_MOUNTS);
        const speed = Math.max(activeMount.speed || 0, mount.speed);
        const rep = mount.speed >= (activeMount.speed || 0) ? mount : (getFuelMountById(activeMount.id) || mount);
        entry = {
          id: rep.id, name: rep.name, emoji: rep.emoji, speed,
          expires_at: new Date(newExpiry).toISOString(),
        };
      }

      const patch = {
        stardust: (ch.stardust || 0) - mount.stardust,
        nova_crystals: (ch.nova_crystals || 0) - (mount.crystals || 0),
        active_fuel_mounts: [entry],
      };
      const character = entities.Character.update(ch.id, patch);
      return { success: true, mount: entry, patch, character };
    });
    return { status: 200, body: result };
  } catch (err) {
    if (err.status) return { status: err.status, body: { error: err.message } };
    throw err;
  }
}

// ── UseConsumable ────────────────────────────────────────────
export async function UseConsumable(user, body) {
  const itemId = body?.item_id;
  if (!itemId) return { status: 400, body: { error: "Missing item_id" } };

  try {
    const result = await withTransactionAsync(async () => {
      const ch = requireMyChar(user);
      const item = entities.Item.get(itemId);
      if (!item) httpErr(404, "Item not found");
      if (item.character_id !== ch.id) httpErr(403, "Not your item");

      const prepared = prepareConsumableBuffs(ch, item);
      if (!prepared.ok) httpErr(400, prepared.reason);

      entities.Item.delete(itemId);
      const patch = { active_buffs: prepared.buffs };
      const character = entities.Character.update(ch.id, patch);
      return { success: true, patch, character };
    });
    return { status: 200, body: result };
  } catch (err) {
    if (err.status) return { status: err.status, body: { error: err.message } };
    throw err;
  }
}

// ── SyncFuelCycle ────────────────────────────────────────────
export async function SyncFuelCycle(user) {
  try {
    const result = await withTransactionAsync(async () => {
      const ch = requireMyChar(user);
      const reset = checkFuelReset(ch);
      if (!reset) {
        return { success: true, patch: {}, character: ch };
      }
      const character = entities.Character.update(ch.id, reset);
      return { success: true, patch: reset, character };
    });
    return { status: 200, body: result };
  } catch (err) {
    if (err.status) return { status: err.status, body: { error: err.message } };
    throw err;
  }
}

// ── LaunchMission ────────────────────────────────────────────
export async function LaunchMission(user, body) {
  const template = body?.template;
  if (!template?.name || !template?.duration_seconds) {
    return { status: 400, body: { error: "Missing template fields" } };
  }

  try {
    const result = await withTransactionAsync(async () => {
      let ch = requireMyChar(user);
      if (ch.active_mission_id) httpErr(409, "Already on a mission");
      if (ch.mining_end_time && new Date(ch.mining_end_time) > new Date()) {
        httpErr(409, "Mining in progress");
      }

      const { ch: resetCh, resetPatch } = applyFuelResetIfNeeded(ch);
      ch = resetCh;

      const draft = {
        ...template,
        duration_seconds: template.duration_seconds,
        fuel_cost: typeof template.fuel_cost === "number" ? template.fuel_cost : undefined,
      };
      const duration = getEffectiveMissionDuration(ch, draft);
      const fuelCost = getEffectiveFuelCost(ch, { ...draft, duration_seconds: duration });
      const currentFuel = Math.round((ch.fuel ?? FUEL_MAX) * 100) / 100;
      if (currentFuel < fuelCost) httpErr(400, "Not enough fuel");

      const sdEff = template.stardust_efficiency != null
        ? normalizeMissionEfficiency(template.stardust_efficiency)
        : rollMissionEfficiency();
      const xpEff = template.xp_efficiency != null
        ? normalizeMissionEfficiency(template.xp_efficiency)
        : rollMissionEfficiency();

      const LOOT_TYPES = ["weapon", "armor", "helmet", "boots", "legs", "neck", "accessory", "ship_module"];
      const lootType = LOOT_TYPES[String(template.name).length % 8];
      const chance = template.rewards?.item_rarity_chance || "common";
      const lootRarity = rollItemRarity(chance, ch.level || 1);
      const lootDrops = Math.random() < Math.min(0.85, 0.4 + Math.min(0.25, (ch.level || 1) * 0.01));

      const startNow = new Date();
      const endTime = new Date(startNow.getTime() + duration * 1000);

      const mission = entities.Mission.create({
        character_id: ch.id,
        name: template.name,
        description: template.description || "",
        location: template.location || "",
        sector: template.sector || 1,
        duration_seconds: duration,
        status: "in_progress",
        start_time: startNow.toISOString(),
        end_time: endTime.toISOString(),
        rewards: {
          ...(template.rewards || {}),
          loot_rarity: lootRarity,
          loot_type: lootType,
          loot_drops: lootDrops,
        },
        level_requirement: template.level_requirement || 1,
        patron: template.patron || null,
        fuel_cost: fuelCost,
        stardust_efficiency: sdEff,
        xp_efficiency: xpEff,
      }, { created_by_id: user.id, created_by: user.email });

      const patch = {
        ...(resetPatch || {}),
        active_mission_id: mission.id,
        mission_end_time: endTime.toISOString(),
        fuel: Math.round((currentFuel - fuelCost) * 100) / 100,
        fuel_updated_at: startNow.toISOString(),
      };
      const character = entities.Character.update(ch.id, patch);
      return { success: true, mission, patch, character };
    });
    return { status: 200, body: result };
  } catch (err) {
    if (err.status) return { status: err.status, body: { error: err.message } };
    throw err;
  }
}

// ── ClaimMission / FailMission ───────────────────────────────
export async function ClaimMission(user, body) {
  const missionId = body?.mission_id;
  const won = body?.won !== false && body?.won !== "false";
  if (!missionId) return { status: 400, body: { error: "Missing mission_id" } };

  try {
    const result = await withTransactionAsync(async () => {
      const ch = requireMyChar(user);
      let mission = entities.Mission.get(missionId);
      if (!mission) httpErr(404, "Mission not found");
      if (mission.character_id !== ch.id) httpErr(403, "Not your mission");
      if (mission.status === "claimed" || mission.status === "failed") {
        httpErr(409, "Mission already resolved");
      }

      const now = Date.now();
      if (mission.status === "in_progress") {
        if (mission.end_time && new Date(mission.end_time).getTime() > now) {
          httpErr(400, "Mission not finished yet");
        }
        mission = entities.Mission.update(mission.id, { status: "completed" });
      }

      if (!won) {
        entities.Mission.update(mission.id, { status: "failed" });
        const patch = { active_mission_id: "", mission_end_time: "" };
        const character = entities.Character.update(ch.id, patch);
        return { success: true, won: false, patch, character, items: [], gains: null };
      }

      const nexusBonus = !!body?.nexus_bonus;
      const gains = computeMissionGains(ch, mission, nexusBonus);
      const patch = {
        stardust: (ch.stardust || 0) + gains.stardustGain,
        total_stardust_earned: (ch.total_stardust_earned || 0) + gains.stardustGain,
        missions_completed: (ch.missions_completed || 0) + 1,
        highest_sector: Math.max(ch.highest_sector || 1, mission.sector || 1),
        active_mission_id: "",
        mission_end_time: "",
      };
      applyXpToCharacter(ch, gains.xpGain, patch);

      if (body?.species_id) {
        const discovered = new Set(ch.discovered_species || []);
        if (!discovered.has(body.species_id)) {
          patch.discovered_species = [...discovered, body.species_id];
        }
      }

      const weekly = progressWeeklyNovaQuest(ch, "missions", 1);
      if (weekly) patch.weekly_nova_quests = weekly;

      const items = [];
      const rewards = mission.rewards || {};
      if (rewards.loot_drops !== false) {
        const rarity = rewards.loot_rarity || rollItemRarity(rewards.item_rarity_chance || "common", ch.level || 1);
        const gear = randomItem(rarity, ch.level || 1, rewards.loot_type);
        const { item } = grantOrCompensate(ch, gear, patch);
        if (item) items.push(item);
      }

      if (rewards.collectible?.name) {
        const junkStats = 1 + Math.floor(Math.random() * 4);
        const { item } = grantOrCompensate(ch, {
          name: rewards.collectible.name,
          type: "material",
          rarity: "uncommon",
          level_requirement: Math.max(1, ch.level || 1),
          stats: { luck: junkStats },
          flavor_text: "A curious trinket recovered on mission.",
          sell_value: 15,
        }, patch);
        if (item) items.push(item);
      }

      if (Math.random() < 0.15) {
        const { _cost, ...consItem } = randomConsumable();
        const { item } = grantOrCompensate(ch, consItem, patch);
        if (item) items.push(item);
      }

      entities.Mission.update(mission.id, { status: "claimed" });
      const character = entities.Character.update(ch.id, patch);
      return {
        success: true,
        won: true,
        patch,
        character,
        items,
        gains: {
          stardust: gains.stardustGain,
          experience: gains.xpGain,
          stardustBase: gains.stardustBase,
          xpBase: gains.xpBase,
          efficiency: gains.efficiency,
          xpEfficiency: gains.xpEfficiency,
          collectionPct: gains.collectionPct,
          fuelSpent: gains.fuelCost,
        },
      };
    });
    return { status: 200, body: result };
  } catch (err) {
    if (err.status) return { status: err.status, body: { error: err.message } };
    throw err;
  }
}

export async function FailMission(user, body) {
  return ClaimMission(user, { ...body, won: false });
}

// ── SkipMission ──────────────────────────────────────────────
export async function SkipMission(user, body) {
  const missionId = body?.mission_id;
  if (!missionId) return { status: 400, body: { error: "Missing mission_id" } };

  try {
    const result = await withTransactionAsync(async () => {
      const ch = requireMyChar(user);
      const mission = entities.Mission.get(missionId);
      if (!mission) httpErr(404, "Mission not found");
      if (mission.character_id !== ch.id) httpErr(403, "Not your mission");
      if (mission.status !== "in_progress") httpErr(400, "Mission is not in progress");

      const cost = skipCostFor(mission);
      if ((ch.nova_crystals || 0) < cost) httpErr(400, "Not enough Nova Crystals");

      entities.Mission.update(mission.id, { status: "completed" });
      const patch = {
        nova_crystals: (ch.nova_crystals || 0) - cost,
        mission_end_time: new Date().toISOString(),
      };
      const character = entities.Character.update(ch.id, patch);
      const updatedMission = entities.Mission.get(mission.id);
      return { success: true, skip_cost: cost, mission: updatedMission, patch, character };
    });
    return { status: 200, body: result };
  } catch (err) {
    if (err.status) return { status: err.status, body: { error: err.message } };
    throw err;
  }
}

// ── EnsureShop ───────────────────────────────────────────────
function buildShopStock(ch, meta, win) {
  const level = ch.level || 1;
  const gearSeed = shopGearSeed(meta, win);
  const consSeed = shopConsSeed(meta, win);
  const day = meta.hot_day || todayET();
  return {
    ...meta,
    gear_stock: generateSimpleGearStock(gearSeed, level, randomItem),
    cons_stock: generateSimpleConsStock(consSeed),
    hot_deal: generateSimpleHotDeal(day, level, randomItem),
  };
}

export async function EnsureShop(user) {
  try {
    const result = await withTransactionAsync(async () => {
      const ch = requireMyChar(user);
      const win = getShopWindow();
      const day = todayET();
      let meta = normalizeShopMeta(ch, win, day);
      const needsStock =
        !Array.isArray(meta.gear_stock) || !meta.gear_stock.length
        || !Array.isArray(meta.cons_stock) || !meta.cons_stock.length
        || !meta.hot_deal
        || ch.shop_meta?.window_idx !== win.idx
        || ch.shop_meta?.hot_day !== day;

      if (needsStock) {
        meta = buildShopStock(ch, meta, win);
      }

      const patch = { shop_meta: meta };
      const character = entities.Character.update(ch.id, patch);
      return { success: true, shop_meta: meta, patch, character };
    });
    return { status: 200, body: result };
  } catch (err) {
    if (err.status) return { status: err.status, body: { error: err.message } };
    throw err;
  }
}

// ── BuyShopGear ──────────────────────────────────────────────
export async function BuyShopGear(user, body) {
  const slotId = body?.slot_id;
  const haggle = !!body?.haggle;
  const isHot = !!body?.is_hot;
  if (!slotId) return { status: 400, body: { error: "Missing slot_id" } };

  try {
    const result = await withTransactionAsync(async () => {
      const ch = requireMyChar(user);
      const win = getShopWindow();
      let meta = normalizeShopMeta(ch, win, todayET());
      if (!Array.isArray(meta.gear_stock) || !meta.gear_stock.length || !meta.hot_deal) {
        meta = buildShopStock(ch, meta, win);
      }

      let slot;
      if (isHot) {
        if (meta.hot_purchased) httpErr(409, "Hot deal already purchased");
        slot = meta.hot_deal;
        if (!slot || slot._slotId !== slotId) httpErr(404, "Hot deal slot not found");
      } else {
        if (meta.purchased?.[slotId]) httpErr(409, "Already purchased");
        slot = (meta.gear_stock || []).find((s) => s._slotId === slotId);
        if (!slot) httpErr(404, "Slot not found");
      }

      let stardustCost = slot.cost || 0;
      let haggleNote = null;
      if (haggle) {
        const outcome = rollHaggle();
        stardustCost = Math.max(1, Math.round(stardustCost * outcome.mult));
        haggleNote = outcome.label;
      }
      const novaCost = slot.nova_cost || 0;
      if ((ch.stardust || 0) < stardustCost) httpErr(400, "Not enough stardust");
      if (novaCost && (ch.nova_crystals || 0) < novaCost) httpErr(400, "Not enough Nova Crystals");

      const nextMeta = { ...meta };
      if (isHot) {
        nextMeta.hot_purchased = true;
      } else {
        nextMeta.purchased = { ...(meta.purchased || {}), [slotId]: true };
      }

      const patch = {
        stardust: (ch.stardust || 0) - stardustCost,
        shop_meta: nextMeta,
      };
      if (novaCost) patch.nova_crystals = (ch.nova_crystals || 0) - novaCost;

      const payloads = slot._bundle === "scrap_crate" && Array.isArray(slot.bundle_items)
        ? slot.bundle_items
        : [stripShopFields(slot)];

      const items = [];
      for (const p of payloads) {
        const { item } = grantOrCompensate(ch, p, patch);
        if (item) items.push(item);
      }

      const character = entities.Character.update(ch.id, patch);
      return {
        success: true,
        haggle_note: haggleNote,
        cost: stardustCost,
        nova_cost: novaCost,
        items,
        patch,
        character,
      };
    });
    return { status: 200, body: result };
  } catch (err) {
    if (err.status) return { status: err.status, body: { error: err.message } };
    throw err;
  }
}

// ── BuyShopConsumable ────────────────────────────────────────
export async function BuyShopConsumable(user, body) {
  const slotId = body?.slot_id;
  const slotIndex = body?.slot_index;
  if (slotId == null && slotIndex == null) {
    return { status: 400, body: { error: "Missing slot_id or slot_index" } };
  }

  try {
    const result = await withTransactionAsync(async () => {
      const ch = requireMyChar(user);
      const win = getShopWindow();
      let meta = normalizeShopMeta(ch, win, todayET());
      if (!Array.isArray(meta.cons_stock) || !meta.cons_stock.length) {
        meta = buildShopStock(ch, meta, win);
      }

      let idx = slotIndex;
      let slot;
      if (slotId != null) {
        idx = (meta.cons_stock || []).findIndex((s) => s._slotId === slotId);
        slot = meta.cons_stock[idx];
      } else {
        slot = meta.cons_stock[slotIndex];
      }
      if (!slot || idx < 0) httpErr(404, "Consumable slot not found");

      const cost = slot._cost ?? slot.sell_value ?? 25;
      if ((ch.stardust || 0) < cost) httpErr(400, "Not enough stardust");

      const patch = { stardust: (ch.stardust || 0) - cost };
      const payloads = slot._bundle === "stim_trio" && Array.isArray(slot.bundle_items)
        ? slot.bundle_items.map(({ _cost, _slotId, ...rest }) => rest)
        : [stripShopFields(slot)];

      const items = [];
      for (const p of payloads) {
        const { item } = grantOrCompensate(ch, p, patch);
        if (item) items.push(item);
      }

      // Replace purchased slot with a fresh stim (client UX parity).
      const nextStock = [...(meta.cons_stock || [])];
      const fresh = randomConsumable();
      nextStock[idx] = {
        ...fresh,
        _slotId: `cons-${shopConsSeed(meta, win)}-${idx}-${Date.now()}`,
        _cost: fresh._cost ?? fresh.sell_value ?? 25,
      };
      patch.shop_meta = { ...meta, cons_stock: nextStock };

      const character = entities.Character.update(ch.id, patch);
      return { success: true, cost, items, patch, character };
    });
    return { status: 200, body: result };
  } catch (err) {
    if (err.status) return { status: err.status, body: { error: err.message } };
    throw err;
  }
}

// ── RefreshShop ──────────────────────────────────────────────
export async function RefreshShop(user, body) {
  const which = body?.which;
  if (which !== "gear" && which !== "consumables") {
    return { status: 400, body: { error: "which must be 'gear' or 'consumables'" } };
  }

  try {
    const result = await withTransactionAsync(async () => {
      const ch = requireMyChar(user);
      if ((ch.nova_crystals || 0) < SHOP_REFRESH_COST) {
        httpErr(400, "Not enough Nova Crystals");
      }

      const win = getShopWindow();
      let meta = normalizeShopMeta(ch, win, todayET());
      if (which === "gear") {
        meta = {
          ...meta,
          gear_refresh: (meta.gear_refresh || 0) + 1,
          purchased: {},
        };
        meta.gear_stock = generateSimpleGearStock(shopGearSeed(meta, win), ch.level || 1, randomItem);
      } else {
        meta = {
          ...meta,
          cons_refresh: (meta.cons_refresh || 0) + 1,
        };
        meta.cons_stock = generateSimpleConsStock(shopConsSeed(meta, win));
      }

      const patch = {
        nova_crystals: (ch.nova_crystals || 0) - SHOP_REFRESH_COST,
        shop_meta: meta,
      };
      const character = entities.Character.update(ch.id, patch);
      return { success: true, which, shop_meta: meta, patch, character };
    });
    return { status: 200, body: result };
  } catch (err) {
    if (err.status) return { status: err.status, body: { error: err.message } };
    throw err;
  }
}

export const ECONOMY_HANDLERS = {
  DissolveItem,
  DissolveJunk,
  BuyAttribute,
  BuyFuel,
  BuyFuelMount,
  UseConsumable,
  SyncFuelCycle,
  LaunchMission,
  ClaimMission,
  FailMission,
  SkipMission,
  BuyShopGear,
  BuyShopConsumable,
  RefreshShop,
  EnsureShop,
  ...ECONOMY_FOLLOW_ON_HANDLERS,
};
