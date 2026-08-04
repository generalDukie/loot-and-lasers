/**
 * Server-authoritative economy function handlers (Critical #2).
 */
import { entities } from "../entities.js";
import { db, withTransactionAsync } from "../db.js";
import { randomItem, randomItemForClass } from "../shared/rewards.js";
import { mergeAchievementUnlocks } from "../shared/achievements.js";
import { getCollectionPercentage, applyXpBonus } from "../shared/collectionBonus.js";
import { mergeDiscoveredGear } from "../shared/discovery.js";
import {
  auditShopPurchase,
  auditFuelPurchase,
  recordCurrencyChange,
  recordItemOwnershipChange,
  ActorTypes,
  newCorrelationId,
} from "../audit/index.js";
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
  computeMissionJunkSellValue,
  skipCostFor,
  SHOP_REFRESH_COST,
  HOT_DEAL_REFRESH_COUNT,
  getShopWindow,
  getShopGameDayKey,
  todayET,
  rollHaggle,
  normalizeShopMeta,
  shopGearSeed,
  shopConsSeed,
  generateSimpleGearStock,
  generateSimpleGearSlot,
  generateSimpleConsStock,
  generateSimpleShopStock,
  generateSimpleHotDeal,
  prepareConsumableBuffs,
  stimShopPurchasePrice,
  rollItemRarity,
  rollMissionGearRarity,
  rollMissionGearDrop,
  missionGearMissStreak,
  missionGearDropChance,
  MISSION_STIM_CHANCE_AFTER_GEAR_FAIL,
  MISSION_JUNK_CHANCE_AFTER_GEAR_AND_STIM_FAIL,
  applyXpToCharacter,
  getInventoryCap,
  randomConsumable,
  priceStimOffer,
  progressWeeklyNovaQuest,
} from "../shared/economyFormulas.js";
import { collectGrant, grantItemOrPending, countBagOccupancy } from "../shared/inventoryGrant.js";
import {
  isLaunchableMissionDuration,
} from "../../../src/lib/missionDuration.js";
import { ECONOMY_FOLLOW_ON_HANDLERS } from "./economyFollowOn.js";
import { clock, TimeErrors } from "../shared/time/index.js";
import {
  ClaimKeys,
  executeRewardClaim,
  resolveNexusBonus,
  detectSuspiciousRewardFields,
  createPendingLoot,
  getClaimByKey,
  RewardSources,
  secureRandom,
  snapshotDefinitionRef,
  RewardErrors,
} from "../rewards/index.js";

function httpErr(status, message, code) {
  const e = new Error(message);
  e.status = status;
  if (code) e.code = code;
  throw e;
}

function requireMyChar(user) {
  const list = entities.Character.filter({ created_by_id: user.id }, "-created_date", 50);
  if (!list.length) httpErr(404, "No character");
  const activeId = user.active_character_id;
  if (!activeId) httpErr(409, "No selected character");
  const active = list.find((c) => c.id === activeId);
  if (!active) httpErr(403, "Selected character is not owned by this account");
  return active;
}

function normalizeOperationKey(value) {
  const key = String(value || "").trim();
  if (!key) return "";
  if (key.length > 128 || !/^[A-Za-z0-9:_-]+$/.test(key)) {
    httpErr(400, "Invalid request_id");
  }
  return key;
}

function getWalletOperation(accountId, operationType, operationKey) {
  if (!operationKey) return null;
  const row = db.prepare(`
    SELECT result_json
    FROM wallet_operations
    WHERE account_id = ? AND operation_type = ? AND operation_key = ?
  `).get(accountId, operationType, operationKey);
  if (!row) return null;
  try {
    return JSON.parse(row.result_json);
  } catch {
    return {};
  }
}

function saveWalletOperation(accountId, operationType, operationKey, result) {
  if (!operationKey) return;
  db.prepare(`
    INSERT INTO wallet_operations (
      account_id, operation_type, operation_key, result_json, created_at
    ) VALUES (?, ?, ?, ?, ?)
  `).run(
    accountId,
    operationType,
    operationKey,
    JSON.stringify(result || {}),
    clock.nowIso(),
  );
}

function applyFuelResetIfNeeded(ch) {
  const reset = checkFuelReset(ch);
  if (!reset) return { ch, resetPatch: null };
  const updated = entities.Character.update(ch.id, reset);
  return { ch: updated, resetPatch: reset };
}

function grantOrCompensate(ch, itemPayload, _patch) {
  return grantItemOrPending(ch, itemPayload);
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
  const level = character.level || 1;
  const sdEff = normalizeMissionEfficiency(mission?.stardust_efficiency, level);
  const xpEff = normalizeMissionEfficiency(mission?.xp_efficiency, level);
  const chartXp = computeMissionXpFromFuel(fuelCost, level, xpEff);
  const chartSd = computeMissionStardustFromFuel(fuelCost, level, sdEff);
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

      const gained = computeStardustValue(item);
      const patch = {
        stardust: (ch.stardust || 0) + gained,
        total_stardust_earned: (ch.total_stardust_earned || 0) + gained,
      };
      // Allow dissolving equipped gear (needed when the bag is full and unequip is blocked).
      if (item.is_equipped) {
        const eq = { ...(ch.equipped_items || {}) };
        if (eq[item.type] === item.id) delete eq[item.type];
        patch.equipped_items = eq;
      }
      entities.Item.delete(itemId);
      const character = entities.Character.update(ch.id, patch);
      const corr = newCorrelationId();
      recordItemOwnershipChange({
        user,
        action: "item_destroyed",
        item,
        previousOwnerCharacterId: ch.id,
        newOwnerCharacterId: null,
        previousLocation: item.is_equipped ? "equipped" : "inventory",
        newLocation: "dissolved",
        correlationId: corr,
        actorType: ActorTypes.PLAYER,
      });
      recordCurrencyChange({
        user,
        character: ch,
        currencyType: "stardust",
        before: ch.stardust || 0,
        after: patch.stardust,
        amount: gained,
        reasonCode: "item_dissolve",
        source: "dissolve",
        correlationId: corr,
        actorType: ActorTypes.PLAYER,
      });
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
export async function BuyFuel(user, body = {}) {
  const requestId = normalizeOperationKey(body?.request_id || body?.idempotencyKey);
  try {
    const result = await withTransactionAsync(async () => {
      let ch = requireMyChar(user);
      const replay = getWalletOperation(user.id, "buy_fuel", requestId);
      if (replay) {
        return {
          success: true,
          ...replay,
          patch: {},
          character: ch,
          idempotent_replay: true,
        };
      }
      const { ch: resetCh, resetPatch } = applyFuelResetIfNeeded(ch);
      ch = resetCh;

      const purchases = ch.fuel_purchases || 0;
      if (purchases >= FUEL_PURCHASE_MAX) httpErr(400, "Fuel purchase limit reached this cycle");
      if ((ch.nova_crystals || 0) < FUEL_PURCHASE_COST) httpErr(400, "Not enough Nova Crystals");

      const max = ch.max_fuel || FUEL_MAX;
      const fuel = ch.fuel || 0;
      // Need room for a full pack — otherwise Nova would burn with little/no fuel gained.
      if (fuel > max - FUEL_PURCHASE_AMOUNT) {
        httpErr(400, `Tank too full — need ${max - FUEL_PURCHASE_AMOUNT} fuel or less to buy +${FUEL_PURCHASE_AMOUNT}`);
      }

      const beforeNova = ch.nova_crystals || 0;
      const beforeFuel = fuel;
      const patch = {
        ...(resetPatch || {}),
        nova_crystals: beforeNova - FUEL_PURCHASE_COST,
        fuel: Math.min(max, fuel + FUEL_PURCHASE_AMOUNT),
        fuel_purchases: purchases + 1,
        fuel_updated_at: new Date().toISOString(),
      };
      const character = entities.Character.update(ch.id, patch);
      auditFuelPurchase({
        user,
        character: ch,
        beforeNova,
        afterNova: patch.nova_crystals,
        beforeFuel,
        afterFuel: patch.fuel,
        cost: FUEL_PURCHASE_COST,
        correlationId: newCorrelationId(),
      });
      const receipt = {
        request_id: requestId,
        nova_debited: FUEL_PURCHASE_COST,
        fuel_granted: FUEL_PURCHASE_AMOUNT,
      };
      saveWalletOperation(user.id, "buy_fuel", requestId, receipt);
      return { success: true, ...receipt, patch, character };
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

  // Hard bounds only — level pools gate generation, not accept/complete.
  // Stale cantina offers (rolled at a prior level) must remain launchable.
  const rawDuration = Math.floor(Number(template.duration_seconds));
  if (!isLaunchableMissionDuration(rawDuration)) {
    return { status: 400, body: { error: "Invalid mission duration", code: "INVALID_DURATION" } };
  }

  try {
    const result = await withTransactionAsync(async () => {
      let ch = requireMyChar(user);
      if (ch.active_mission_id) httpErr(409, "Already on a mission");
      if (ch.mining_end_time && new Date(ch.mining_end_time).getTime() > clock.nowMs()) {
        httpErr(409, "Mining in progress");
      }
      if (countBagOccupancy(ch) >= getInventoryCap(ch)) {
        httpErr(400, "Inventory full — clear bag space before launching a mission");
      }

      const { ch: resetCh, resetPatch } = applyFuelResetIfNeeded(ch);
      ch = resetCh;

      const level = ch.level || 1;
      const currentFuel = Math.round((ch.fuel ?? FUEL_MAX) * 100) / 100;

      const draft = {
        ...template,
        duration_seconds: rawDuration,
        fuel_cost: typeof template.fuel_cost === "number" ? template.fuel_cost : undefined,
      };

      const duration = getEffectiveMissionDuration(ch, draft);
      const fuelCost = getEffectiveFuelCost(ch, { ...draft, duration_seconds: duration });
      if (currentFuel < fuelCost) httpErr(400, "Not enough fuel");
      const sdEff = template.stardust_efficiency != null
        ? normalizeMissionEfficiency(template.stardust_efficiency, level)
        : rollMissionEfficiency(level);
      const xpEff = template.xp_efficiency != null
        ? normalizeMissionEfficiency(template.xp_efficiency, level)
        : rollMissionEfficiency(level);

      const LOOT_TYPES = ["weapon", "armor", "helmet", "boots", "legs", "neck", "accessory", "ship_module"];
      const lootType = LOOT_TYPES[String(template.name).length % 8];
      const lootRarity = rollMissionGearRarity(secureRandom);
      const missStreak = missionGearMissStreak(ch);
      const lootDropChance = missionGearDropChance(missStreak);
      const lootDrops = rollMissionGearDrop(missStreak, secureRandom);
      const rewardDef = snapshotDefinitionRef("mission_completion");

      const startNow = clock.now();
      const endTime = new Date(startNow.getTime() + duration * 1000);

      // Client may send explore_scene; otherwise pick one so the active-mission
      // backdrop rotates instead of always landing on scene 0.
      const EXPLORE_SCENE_COUNT = 6;
      const rawScene = Number(template.explore_scene);
      const exploreScene = Number.isFinite(rawScene)
        ? ((Math.floor(rawScene) % EXPLORE_SCENE_COUNT) + EXPLORE_SCENE_COUNT) % EXPLORE_SCENE_COUNT
        : Math.floor(secureRandom() * EXPLORE_SCENE_COUNT);

      // Snapshot reward definition + loot rolls at start (resolvePolicy: start).
      // Strip any client-authored currency/XP/item payloads from template.rewards.
      const { stardust: _sd, experience: _xp, items: _items, credits: _cr, ...safeTemplateRewards } =
        template.rewards || {};

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
          ...safeTemplateRewards,
          loot_rarity: lootRarity,
          loot_type: lootType,
          loot_drops: lootDrops,
          loot_drop_chance: lootDropChance,
          loot_miss_streak: missStreak,
          reward_definition_key: rewardDef.definitionKey,
          reward_definition_version: rewardDef.definitionVersion,
        },
        level_requirement: template.level_requirement || 1,
        patron: template.patron || null,
        fuel_cost: fuelCost,
        stardust_efficiency: sdEff,
        xp_efficiency: xpEff,
        explore_scene: exploreScene,
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
    if (err.status) return { status: err.status, body: { error: err.message, code: err.code } };
    throw err;
  }
}

// ── ClaimMission / FailMission ───────────────────────────────
/** Clear a character's pointer to a mission row that no longer exists. */
function releaseDanglingMission(ch) {
  const patch = { active_mission_id: "", mission_end_time: "" };
  const character = entities.Character.update(ch.id, patch);
  return {
    success: true,
    won: false,
    mission_missing: true,
    patch,
    character,
    items: [],
    gains: null,
  };
}

export async function ClaimMission(user, body) {
  const missionId = body?.mission_id;
  const won = body?.won !== false && body?.won !== "false";
  if (!missionId) return { status: 400, body: { error: "Missing mission_id" } };

  const suspicious = detectSuspiciousRewardFields(body);
  // Explicit high-risk fields beyond the shared list
  if (body?.nexus_bonus != null) suspicious.push("nexus_bonus");
  if (body?.species_id != null) suspicious.push("species_id");

  try {
    const result = await withTransactionAsync(async () => {
      const ch = requireMyChar(user);
      const claimKey = ClaimKeys.mission(missionId);
      const prior = getClaimByKey(claimKey);
      if (prior?.status === "completed" && prior.deliveredPayload) {
        return { ...prior.deliveredPayload, idempotentReplay: true, reward_claim_id: prior.id };
      }

      let mission = entities.Mission.get(missionId);
      if (!mission) {
        // No mission row, but the character is still flagged as flying it: release
        // the ship (no rewards) instead of leaving the slot locked forever.
        if (ch.active_mission_id && ch.active_mission_id === missionId) {
          return releaseDanglingMission(ch);
        }
        httpErr(404, "Mission not found");
      }
      if (mission.character_id !== ch.id) httpErr(403, "Not your mission", RewardErrors.CHARACTER_NOT_OWNED);
      if (mission.status === "claimed" || mission.status === "failed") {
        // A resolved row the character is still flagged as flying has no claim to
        // replay, so the pointer is stale — free the slot instead of 409-locking
        // the character out of every future launch.
        if (ch.active_mission_id && ch.active_mission_id === missionId) {
          return releaseDanglingMission(ch);
        }
        httpErr(409, "Mission already resolved", RewardErrors.REWARD_ALREADY_CLAIMED);
      }

      const now = clock.nowMs();
      // in_progress: mission.end_time is authoritative.
      // completed (after SkipMission): character.mission_end_time is snapped to now
      // while the mission row may still hold the original future end_time.
      const charEnd = ch.mission_end_time ? new Date(ch.mission_end_time).getTime() : 0;
      const missionEnd = mission.end_time ? new Date(mission.end_time).getTime() : 0;
      const effectiveEnd =
        mission.status === "completed"
          ? (charEnd || missionEnd)
          : (missionEnd || charEnd);
      if (effectiveEnd && effectiveEnd > now) {
        httpErr(400, "Mission not finished yet", TimeErrors.COOLDOWN_ACTIVE);
      }
      if (mission.status === "in_progress") {
        mission = entities.Mission.update(mission.id, { status: "completed" });
      }

      if (!won) {
        entities.Mission.update(mission.id, { status: "failed" });
        const patch = { active_mission_id: "", mission_end_time: "" };
        const character = entities.Character.update(ch.id, patch);
        return { success: true, won: false, patch, character, items: [], gains: null };
      }

      const defVersion =
        mission.rewards?.reward_definition_version ??
        snapshotDefinitionRef("mission_completion").definitionVersion;

      const claimResult = await executeRewardClaim({
        claimKey,
        idempotencyKey: body?.idempotencyKey || body?.idempotency_key || null,
        accountId: user.id,
        characterId: ch.id,
        rewardSource: RewardSources.MISSION_COMPLETION,
        sourceReferenceType: "mission",
        sourceReferenceId: missionId,
        definitionKey: "mission_completion",
        definitionVersion: defVersion,
        clientBody: body,
        suspiciousFields: suspicious,
        correlationId: body?.correlationId || null,
        generate: async () => {
          const live = entities.Character.get(ch.id) || ch;
          const nexusBonus = resolveNexusBonus(live.id);
          const gains = computeMissionGains(live, mission, nexusBonus);
          const rewards = mission.rewards || {};
          const itemTemplates = [];
          let gearDropped = false;
          let stimDropped = false;
          let junkDropped = false;
          if (rewards.loot_drops !== false) {
            gearDropped = true;
            const rarity =
              rewards.loot_rarity ||
              rollMissionGearRarity(secureRandom);
            itemTemplates.push(
              randomItem(rarity, live.level || 1, rewards.loot_type, secureRandom, live.class)
            );
          } else {
            // Exclusive chain: Gear miss → Stim (25%) → Junk (75% of remaining).
            if (secureRandom() < MISSION_STIM_CHANCE_AFTER_GEAR_FAIL) {
              stimDropped = true;
              const { _cost, ...consItem } = randomConsumable(secureRandom);
              itemTemplates.push(priceStimOffer(consItem, live.level || 1));
            } else if (secureRandom() < MISSION_JUNK_CHANCE_AFTER_GEAR_AND_STIM_FAIL) {
              junkDropped = true;
              const level = Math.max(1, live.level || 1);
              const junkName = rewards.collectible?.name || "Salvaged Trinket";
              itemTemplates.push({
                name: junkName,
                type: "material",
                rarity: "common",
                level_requirement: level,
                stats: {},
                flavor_text: "A curious trinket recovered on mission.",
                sell_value: computeMissionJunkSellValue(gains.stardustBase || gains.stardustGain || 0, secureRandom),
              });
            }
          }
          void stimDropped;
          void junkDropped;
          // Species discovery only from mission snapshot — never client species_id
          const speciesId = rewards.species_id || null;
          return {
            stardust: gains.stardustGain || 0,
            experience: gains.xpGain,
            itemTemplates,
            species_id: speciesId,
            gearDropped,
            gainsMeta: {
              stardustBase: gains.stardustBase,
              xpBase: gains.xpBase,
              efficiency: gains.efficiency,
              xpEfficiency: gains.xpEfficiency,
              collectionPct: gains.collectionPct,
              fuelSpent: gains.fuelCost,
              nexusBonus,
              gearDropped,
            },
            bonusReasons: nexusBonus ? ["nexus_control"] : [],
          };
        },
        deliver: async (payload, claim) => {
          const live = entities.Character.get(ch.id) || ch;
          const gearDropped = payload.gearDropped === true;
          const patch = {
            stardust: (live.stardust || 0) + (payload.stardust || 0),
            total_stardust_earned: (live.total_stardust_earned || 0) + (payload.stardust || 0),
            missions_completed: (live.missions_completed || 0) + 1,
            highest_sector: Math.max(live.highest_sector || 1, mission.sector || 1),
            active_mission_id: "",
            mission_end_time: "",
            mission_gear_miss_streak: gearDropped ? 0 : missionGearMissStreak(live) + 1,
          };
          applyXpToCharacter(live, payload.experience || 0, patch);

          if (payload.species_id) {
            const discovered = new Set(live.discovered_species || []);
            if (!discovered.has(payload.species_id)) {
              patch.discovered_species = [...discovered, payload.species_id];
            }
          }

          const weekly = progressWeeklyNovaQuest(live, "missions", 1);
          if (weekly) patch.weekly_nova_quests = weekly;

          const items = [];
          const pendingLoot = [];
          for (const gear of payload.itemTemplates || []) {
            const granted = grantOrCompensate(live, gear, patch);
            if (granted.item) {
              items.push(granted.item);
            } else if (granted.pending) {
              const pl = createPendingLoot({
                accountId: user.id,
                characterId: live.id,
                claimId: claim.id,
                claimKey: claim.claimKey,
                item: granted.pending,
              });
              pendingLoot.push({ id: pl.id, item: pl.item });
            }
          }

          // Cosmic Vault — discover gear from granted + pending templates (not consumables/materials).
          mergeDiscoveredGear(live, [
            ...items,
            ...pendingLoot.map((p) => p.item),
            ...(payload.itemTemplates || []),
          ], patch);

          entities.Mission.update(mission.id, { status: "claimed" });

          const ach = mergeAchievementUnlocks(live, patch);
          Object.assign(patch, ach.patch);

          const character = entities.Character.update(live.id, patch);
          return {
            success: true,
            won: true,
            patch,
            character,
            items,
            pending_loot: pendingLoot,
            newly_unlocked: ach.newly_unlocked,
            gains: {
              stardust: payload.stardust || 0,
              experience: payload.experience || 0,
              ...(payload.gainsMeta || {}),
            },
            reward_claim_id: claim.id,
            deliveryDestination: pendingLoot.length ? "pending_loot" : "character",
          };
        },
      });

      return claimResult.result;
    });
    return { status: 200, body: result };
  } catch (err) {
    if (err.status) return { status: err.status, body: { error: err.message, code: err.code } };
    if (err.code) {
      const status =
        err.code === RewardErrors.REWARD_ALREADY_CLAIMED || err.code === RewardErrors.CLAIM_IN_PROGRESS
          ? 409
          : 400;
      return { status, body: { error: err.message, code: err.code } };
    }
    throw err;
  }
}

export async function FailMission(user, body) {
  return ClaimMission(user, { ...body, won: false });
}

// ── DebitNovaCrystals ────────────────────────────────────────
/** Debit Character.nova_crystals for hybrid Nakama mission skip (until wallet owns premium). */
export async function DebitNovaCrystals(user, body) {
  const amount = Math.floor(Number(body?.amount));
  const purpose = String(body?.purpose || "");
  const missionId = String(body?.mission_id || "");
  const requestId = normalizeOperationKey(
    body?.request_id || body?.idempotencyKey || `mission_skip:${missionId}`,
  );
  if (!Number.isFinite(amount) || amount < 1 || amount > 5000) {
    return { status: 400, body: { error: "Invalid amount" } };
  }
  if (purpose !== "mission_skip") {
    return { status: 400, body: { error: "Invalid purpose" } };
  }
  if (!missionId) {
    return { status: 400, body: { error: "Missing mission_id" } };
  }

  try {
    const result = await withTransactionAsync(async () => {
      const ch = requireMyChar(user);
      const replay = getWalletOperation(user.id, "mission_skip_nova", requestId);
      if (replay) {
        return {
          success: true,
          ...replay,
          patch: {},
          character: ch,
          idempotent_replay: true,
        };
      }
      if ((ch.nova_crystals || 0) < amount) {
        httpErr(400, "Not enough Nova Crystals");
      }
      const patch = { nova_crystals: (ch.nova_crystals || 0) - amount };
      const character = entities.Character.update(ch.id, patch);
      const receipt = {
        request_id: requestId,
        amount,
        purpose,
        mission_id: missionId,
      };
      saveWalletOperation(user.id, "mission_skip_nova", requestId, receipt);
      return { success: true, ...receipt, patch, character };
    });
    return { status: 200, body: result };
  } catch (err) {
    if (err.status) return { status: err.status, body: { error: err.message } };
    throw err;
  }
}

// ── SkipMission ──────────────────────────────────────────────
export async function SkipMission(user, body) {
  const missionId = body?.mission_id;
  if (!missionId) return { status: 400, body: { error: "Missing mission_id" } };

  try {
    const result = await withTransactionAsync(async () => {
      const ch = requireMyChar(user);
      const mission = entities.Mission.get(missionId);
      if (!mission) {
        if (ch.active_mission_id && ch.active_mission_id === missionId) {
          return { ...releaseDanglingMission(ch), skip_cost: 0, mission: null };
        }
        httpErr(404, "Mission not found");
      }
      if (mission.character_id !== ch.id) httpErr(403, "Not your mission");
      if (mission.status !== "in_progress") {
        if (
          (mission.status === "claimed" || mission.status === "failed") &&
          ch.active_mission_id === missionId
        ) {
          return { ...releaseDanglingMission(ch), skip_cost: 0, mission: null };
        }
        httpErr(400, "Mission is not in progress");
      }

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
/**
 * Rebuild normal shop slots. Hot Deal is preserved across automatic 12h rotations;
 * only regenerate it when missing or when refreshHotDeal is true (2 PM day roll / every 10 manual refreshes).
 */
function buildShopStock(ch, meta, win, { refreshHotDeal = false } = {}) {
  const level = ch.level || 1;
  const gearSeed = shopGearSeed(meta, win);
  const day = meta.hot_day || getShopGameDayKey();
  const forClass = randomItemForClass(ch.class);
  const shop_stock = generateSimpleShopStock(gearSeed, level, forClass);
  let hot_deal = meta.hot_deal;
  if (refreshHotDeal || !hot_deal) {
    hot_deal = generateSimpleHotDeal(day, level, forClass);
  }
  return {
    ...meta,
    shop_stock,
    // Legacy mirrors: full unified stock in gear_stock; stims also listed in cons_stock.
    gear_stock: shop_stock,
    cons_stock: shop_stock.filter((s) => s.type === "consumable" || s._offerKind === "stim"),
    hot_deal,
  };
}

export async function EnsureShop(user) {
  try {
    const result = await withTransactionAsync(async () => {
      const ch = requireMyChar(user);
      const win = getShopWindow();
      const day = getShopGameDayKey();
      const dayRolled = ch.shop_meta?.hot_day !== day;
      let meta = normalizeShopMeta(ch, win, day);
      const hasStock =
        (Array.isArray(meta.shop_stock) && meta.shop_stock.length > 0) ||
        (Array.isArray(meta.gear_stock) && meta.gear_stock.length > 0);
      const needsStock =
        !hasStock ||
        !meta.hot_deal ||
        ch.shop_meta?.window_idx !== win.idx ||
        dayRolled;

      if (needsStock) {
        // Auto 12h rotation must NOT advance Hot Deal; 2 PM day roll must.
        meta = buildShopStock(ch, meta, win, {
          refreshHotDeal: dayRolled || !meta.hot_deal,
        });
        if (dayRolled) {
          meta = {
            ...meta,
            hot_purchased: false,
            hot_yanked: false,
            hot_manual_refresh_count: 0,
          };
        }
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

function replaceArmoryListing(meta, win, ch, slotId, isHot, outcome = "purchased") {
  const nextMeta = { ...meta };
  const day = meta.hot_day || getShopGameDayKey();
  if (isHot) {
    // Sold out until next Hot Deal refresh — do not regenerate immediately.
    nextMeta.hot_day = day;
    if (outcome === "yanked") nextMeta.hot_yanked = true;
    else nextMeta.hot_purchased = true;
    return nextMeta;
  }

  // Mark sold out / yanked — do not refill the slot until a full shop refresh.
  nextMeta.purchased = { ...(meta.purchased || {}) };
  nextMeta.yanked = { ...(meta.yanked || {}) };
  if (outcome === "yanked") nextMeta.yanked[slotId] = true;
  else nextMeta.purchased[slotId] = true;
  void win;
  void ch;
  return nextMeta;
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
      let meta = normalizeShopMeta(ch, win, getShopGameDayKey());
      if (
        !(Array.isArray(meta.shop_stock) && meta.shop_stock.length) &&
        !(Array.isArray(meta.gear_stock) && meta.gear_stock.length)
      ) {
        meta = buildShopStock(ch, meta, win);
      }

      let slot;
      const stock = Array.isArray(meta.shop_stock) && meta.shop_stock.length
        ? meta.shop_stock
        : meta.gear_stock || [];
      if (isHot) {
        if (meta.hot_purchased || meta.hot_yanked) httpErr(409, "Hot deal already gone");
        slot = meta.hot_deal;
        if (!slot || slot._slotId !== slotId) httpErr(404, "Hot deal slot not found");
      } else {
        if (meta.purchased?.[slotId] || meta.yanked?.[slotId]) httpErr(409, "Already gone");
        slot = stock.find((s) => s._slotId === slotId);
        if (!slot) httpErr(404, "Slot not found");
        if (slot.type === "consumable") httpErr(400, "Use BuyShopConsumable for stims");
      }

      let stardustCost = slot.cost || 0;
      let haggleNote = null;
      if (haggle) {
        if (slot._bundle) httpErr(400, "Can't haggle bundles");
        const outcome = rollHaggle();
        haggleNote = outcome.label;
        if (!outcome.ok) {
          // Haggle fail — listing is gone; restock the stall immediately.
          const nextMeta = replaceArmoryListing(meta, win, ch, slotId, isHot, "yanked");
          const patch = { shop_meta: nextMeta };
          const character = entities.Character.update(ch.id, patch);
          return {
            success: true,
            haggle_failed: true,
            haggle_note: haggleNote,
            cost: 0,
            nova_cost: 0,
            items: [],
            patch,
            character,
          };
        }
        stardustCost = Math.max(1, Math.round(stardustCost * outcome.mult));
      }
      const novaCost = slot.nova_cost || 0;
      if ((ch.stardust || 0) < stardustCost) httpErr(400, "Not enough stardust");
      if (novaCost && (ch.nova_crystals || 0) < novaCost) httpErr(400, "Not enough Nova Crystals");

      // Buy / successful haggle — grant item, then restock that stall slot.
      const nextMeta = replaceArmoryListing(meta, win, ch, slotId, isHot, "purchased");

      const patch = {
        stardust: (ch.stardust || 0) - stardustCost,
        shop_meta: nextMeta,
      };
      if (novaCost) patch.nova_crystals = (ch.nova_crystals || 0) - novaCost;

      const payloads = slot._bundle === "scrap_crate" && Array.isArray(slot.bundle_items)
        ? slot.bundle_items
        : [stripShopFields(slot)];

      const items = [];
      const pendingLoot = [];
      const grantCtx = { accountId: user.id, characterId: ch.id };
      for (const p of payloads) {
        collectGrant(grantOrCompensate(ch, p, patch), items, pendingLoot, grantCtx);
      }

      mergeDiscoveredGear(ch, [
        ...items,
        ...pendingLoot.map((p) => p.item),
        ...payloads,
      ], patch);

      const character = entities.Character.update(ch.id, patch);
      if (!haggleNote || true) {
        // Always audit successful purchases (haggle fail returns earlier).
        auditShopPurchase({
          user,
          character: ch,
          beforeStardust: ch.stardust || 0,
          afterStardust: patch.stardust ?? ch.stardust,
          beforeNova: ch.nova_crystals || 0,
          afterNova: patch.nova_crystals ?? ch.nova_crystals,
          item: items[0] || null,
          cost: stardustCost,
          novaCost,
          correlationId: newCorrelationId(),
        });
      }
      return {
        success: true,
        haggle_failed: false,
        haggle_note: haggleNote,
        cost: stardustCost,
        nova_cost: novaCost,
        items,
        pending_loot: pendingLoot,
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
      let meta = normalizeShopMeta(ch, win, getShopGameDayKey());
      if (
        !(Array.isArray(meta.shop_stock) && meta.shop_stock.length) &&
        !(Array.isArray(meta.cons_stock) && meta.cons_stock.length)
      ) {
        meta = buildShopStock(ch, meta, win);
      }

      const stock = Array.isArray(meta.shop_stock) && meta.shop_stock.length
        ? meta.shop_stock
        : meta.cons_stock || [];

      let idx = slotIndex;
      let slot;
      if (slotId != null) {
        if (meta.purchased?.[slotId] || meta.yanked?.[slotId]) httpErr(409, "Already gone");
        idx = stock.findIndex((s) => s._slotId === slotId);
        slot = stock[idx];
      } else {
        slot = stock[slotIndex];
      }
      if (!slot || idx < 0) httpErr(404, "Consumable slot not found");
      if (slot.type !== "consumable") httpErr(400, "Not a stim offer");

      const cost = slot.cost ?? slot._cost ?? stimShopPurchasePrice(slot.rarity, ch.level || 1);
      if ((ch.stardust || 0) < cost) httpErr(400, "Not enough stardust");

      const patch = { stardust: (ch.stardust || 0) - cost };
      const payloads = slot._bundle === "stim_trio" && Array.isArray(slot.bundle_items)
        ? slot.bundle_items.map(({ _cost, _slotId, ...rest }) => rest)
        : [stripShopFields(slot)];

      const items = [];
      const pendingLoot = [];
      const grantCtx = { accountId: user.id, characterId: ch.id };
      for (const p of payloads) {
        collectGrant(grantOrCompensate(ch, p, patch), items, pendingLoot, grantCtx);
      }

      // Sold out until next full shop refresh — do not refill the slot.
      const nextMeta = {
        ...meta,
        purchased: { ...(meta.purchased || {}), [slot._slotId]: true },
      };
      patch.shop_meta = nextMeta;

      const character = entities.Character.update(ch.id, patch);
      return { success: true, cost, items, pending_loot: pendingLoot, patch, character };
    });
    return { status: 200, body: result };
  } catch (err) {
    if (err.status) return { status: err.status, body: { error: err.message } };
    throw err;
  }
}

// ── RefreshShop ──────────────────────────────────────────────
export async function RefreshShop(user, body) {
  const which = body?.which || "gear";
  const useFree = !!body?.use_free;
  if (which !== "gear" && which !== "consumables" && which !== "all") {
    return { status: 400, body: { error: "which must be 'gear', 'consumables', or 'all'" } };
  }

  try {
    const result = await withTransactionAsync(async () => {
      const ch = requireMyChar(user);
      const win = getShopWindow();
      let meta = normalizeShopMeta(ch, win, getShopGameDayKey());

      let novaCost = 0;
      if (useFree || !meta.free_refresh_used) {
        if (meta.free_refresh_used && useFree) httpErr(400, "Free refresh already used this period");
        meta = { ...meta, free_refresh_used: true };
      } else {
        if ((ch.nova_crystals || 0) < SHOP_REFRESH_COST) {
          httpErr(400, "Not enough Nova Crystals");
        }
        novaCost = SHOP_REFRESH_COST;
      }

      let hotCount = Math.max(0, Math.floor(meta.hot_manual_refresh_count || 0)) + 1;
      let hotDeal = meta.hot_deal;
      let hotPurchased = meta.hot_purchased;
      let hotYanked = meta.hot_yanked;
      if (hotCount >= HOT_DEAL_REFRESH_COUNT) {
        hotCount = 0;
        hotPurchased = false;
        hotYanked = false;
        hotDeal = generateSimpleHotDeal(
          meta.hot_day || getShopGameDayKey(),
          ch.level || 1,
          randomItemForClass(ch.class)
        );
      }

      meta = {
        ...meta,
        gear_refresh: (meta.gear_refresh || 0) + 1,
        cons_refresh: (meta.cons_refresh || 0) + 1,
        manual_refresh_count: (meta.manual_refresh_count || 0) + 1,
        hot_manual_refresh_count: hotCount,
        hot_purchased: hotPurchased,
        hot_yanked: hotYanked,
        hot_deal: hotDeal,
        purchased: {},
        yanked: {},
      };
      // Manual refresh regenerates the 8 slots only; Hot Deal was updated above iff count hit 10.
      meta = buildShopStock(ch, meta, win, { refreshHotDeal: false });

      const patch = {
        nova_crystals: (ch.nova_crystals || 0) - novaCost,
        shop_meta: meta,
      };
      const character = entities.Character.update(ch.id, patch);
      return { success: true, which: "all", shop_meta: meta, patch, character, used_free: novaCost === 0 };
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
  DebitNovaCrystals,
  BuyShopGear,
  BuyShopConsumable,
  RefreshShop,
  EnsureShop,
  ...ECONOMY_FOLLOW_ON_HANDLERS,
};
