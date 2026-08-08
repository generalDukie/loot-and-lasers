/**
 * Server-authoritative economy function handlers (Critical #2).
 */
import { entities } from "../entities.js";
import { db, withTransactionAsync } from "../db.js";
import { randomItemForClass } from "../shared/rewards.js";
import { mergeAchievementUnlocks } from "../shared/achievements.js";
import { getCollectionPercentage, applyXpBonus } from "../shared/collectionBonus.js";
import { mergeDiscoveredGear, rollCombatCollectibleDiscoveries } from "../shared/discovery.js";
import { notifyAchievementsUnlocked } from "../shared/notificationService.js";
import {
  auditShopPurchase,
  auditFuelPurchase,
  recordCurrencyChange,
  recordItemOwnershipChange,
  ActorTypes,
  newCorrelationId,
} from "../audit/index.js";
import {
  debitNova,
  debitNovaHalfUnits,
  creditNova,
  readNovaHalfUnits,
  fromNovaHalfUnits,
  getBalances,
  hasNova,
  novaDebitPatch,
} from "../shared/currencyService.js";
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
  getEffectiveMaxFuel,
  getEffectiveFuelCost,
  getEffectiveMissionDuration,
  getModEffectTotal,
  isShipHangarEnabled,
  normalizeMissionEfficiency,
  rollMissionEfficiency,
  computeMissionXpFromFuel,
  computeMissionStardustFromFuel,
  skipCostFor,
  skipCostHalfUnits,
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
  getActiveStims,
  MAX_ACTIVE_STAT_TYPES,
  stimShopPurchasePrice,
  rollItemRarity,
  missionGearMissStreak,
  missionGearDropChance,
  applyXpToCharacter,
  consumeProgression,
  getInventoryCap,
  progressWeeklyNovaQuest,
} from "../shared/economyFormulas.js";
import { collectGrant, grantItemOrPending, countBagOccupancy } from "../shared/inventoryGrant.js";
import {
  isLaunchableMissionDuration,
  rollMissionDurationSeconds,
  remainingFuelDurationSeconds,
  MISSION_MIN_FUEL,
} from "../../../src/lib/missionDuration.js";
import { MISSION_GEAR_RARITY_WEIGHTS } from "../../../src/lib/stardustEconomy.js";
import {
  MISSION_TEMPLATES,
  LOW_FUEL_TEMPLATES,
  MISSION_PATRONS,
  MISSION_COLLECTIBLES,
  exploreImageId,
  shuffleInPlace,
  pickExploreScenes,
  missionLootTypeFromName,
} from "../shared/missionTemplates.js";
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
import { resolveSelectedCharacter } from "../gameplayContext.js";
import {
  buildAttributeSheet,
  loadEquippedItemsForCharacter,
} from "../shared/characterAttributes.js";
import { ensureCharacterPermanentStats } from "../shared/characterStatsRepair.js";
import { settleMissionItemChain } from "../shared/missionRewards.js";
import { serializeShopPresentation, assertShopPurchaseClientSafe, shopMetaHasStock } from "../shared/shopService.js";
import {
  prepareMissionCombatForCharacter,
  readMissionCombat,
  publicCombatResult,
} from "../shared/combatService.js";
import {
  buildInventorySnapshot,
  equipItemForCharacter,
  unequipItemForCharacter,
} from "../shared/inventoryEquipment.js";

function httpErr(status, message, code) {
  const e = new Error(message);
  e.status = status;
  if (code) e.code = code;
  throw e;
}

function requireMyChar(user) {
  return resolveSelectedCharacter(user);
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

// ── Mission board (server-authoritative offer generation) ────
// Node owns all gameplay-relevant mission values. The client requests the board,
// renders the returned offers, and launches by offer_id — it never sends duration,
// fuel, efficiency, XP, or Stardust for the server to trust.
const MISSION_BOARD_VERSION = 3;

function makeMissionOfferId(index) {
  const t = clock.nowMs().toString(36);
  const r = Math.floor(secureRandom() * 1e9).toString(36);
  return `off_${t}_${r}_${index}`;
}

function normalizeBoardFuel(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function boardCanAffordAny(ch, offers) {
  const fuel = normalizeBoardFuel(ch.fuel);
  for (const o of offers) {
    const cost = getEffectiveFuelCost(ch, {
      duration_seconds: o.duration_seconds,
      fuel_cost: typeof o.fuel_cost === "number" ? o.fuel_cost : undefined,
    });
    if (cost <= fuel + 0.001) return true;
  }
  return false;
}

function generateDailyOffers(ch, rng) {
  const level = ch.level || 1;
  const maxSector = (ch.highest_sector || 1) + 1;
  let pool = MISSION_TEMPLATES.filter(
    (t) => (t.level_requirement || 1) <= level && (t.sector || 1) <= maxSector
  );
  if (pool.length === 0) {
    pool = MISSION_TEMPLATES.filter((t) => (t.level_requirement || 1) <= level);
  }
  if (pool.length === 0) pool = MISSION_TEMPLATES.slice();
  pool = shuffleInPlace(pool.slice(), rng);
  const givers = shuffleInPlace(MISSION_PATRONS.slice(), rng);
  const exploreIndices = pickExploreScenes(3, rng);
  const offers = [];
  for (let i = 0; i < 3; i++) {
    const tpl = pool[i % pool.length];
    const sceneI = exploreIndices[i];
    offers.push({
      offer_id: makeMissionOfferId(i),
      name: tpl.name,
      description: tpl.description,
      location: tpl.location,
      sector: tpl.sector,
      level_requirement: tpl.level_requirement,
      duration_seconds: rollMissionDurationSeconds(level, rng()),
      stardust_efficiency: rollMissionEfficiency(level, rng),
      xp_efficiency: rollMissionEfficiency(level, rng),
      patron: givers[i % givers.length],
      explore_scene: sceneI,
      image_id: exploreImageId(sceneI),
      collectible: MISSION_COLLECTIBLES[Math.floor(rng() * MISSION_COLLECTIBLES.length)],
      low_fuel: false,
    });
  }
  return offers;
}

function generateLowFuelOffers(ch, rng) {
  const fuel = normalizeBoardFuel(ch.fuel);
  if (fuel < MISSION_MIN_FUEL) return [];
  const level = ch.level || 1;
  const duration = remainingFuelDurationSeconds(fuel);
  if (duration == null) return [];
  const givers = shuffleInPlace(MISSION_PATRONS.slice(), rng);
  const count = Math.min(3, LOW_FUEL_TEMPLATES.length);
  const exploreIndices = pickExploreScenes(count, rng);
  const pinned = Math.max(MISSION_MIN_FUEL, fuel);
  const offers = [];
  for (let i = 0; i < count; i++) {
    const tpl = LOW_FUEL_TEMPLATES[i];
    const sceneI = exploreIndices[i];
    offers.push({
      offer_id: makeMissionOfferId(100 + i),
      name: tpl.name,
      description: tpl.description,
      location: tpl.location,
      sector: 1,
      level_requirement: 1,
      duration_seconds: duration,
      fuel_cost: pinned,
      stardust_efficiency: rollMissionEfficiency(level, rng),
      xp_efficiency: rollMissionEfficiency(level, rng),
      patron: givers[i % givers.length],
      explore_scene: sceneI,
      image_id: exploreImageId(sceneI),
      low_fuel: true,
    });
  }
  return offers;
}

function generateMissionBoardOffers(ch, rng) {
  const normal = generateDailyOffers(ch, rng);
  if (boardCanAffordAny(ch, normal)) return normal;
  const low = generateLowFuelOffers(ch, rng);
  return low.length ? low : normal;
}

/**
 * Recompute all gameplay-relevant preview values for a stored offer against the
 * CURRENT character (ship mods, collection %, gear miss streak). Preview fields are
 * derived, never persisted — the persisted offer only holds generation inputs.
 */
function serializeBoardOffer(ch, offer) {
  const raw = Math.floor(Number(offer.duration_seconds));
  const missionLike = {
    duration_seconds: raw,
    fuel_cost:
      offer.low_fuel && typeof offer.fuel_cost === "number" ? offer.fuel_cost : undefined,
    stardust_efficiency: offer.stardust_efficiency,
    xp_efficiency: offer.xp_efficiency,
  };
  const gains = computeMissionGains(ch, missionLike, false);
  const missStreak = missionGearMissStreak(ch);
  return {
    offer_id: offer.offer_id,
    name: offer.name,
    description: offer.description || "",
    location: offer.location || "",
    sector: offer.sector || 1,
    level_requirement: offer.level_requirement || 1,
    patron: offer.patron || null,
    explore_scene: offer.explore_scene ?? -1,
    image_id: offer.image_id || "",
    collectible: offer.collectible || null,
    low_fuel: !!offer.low_fuel,
    duration_seconds: raw,
    display_duration_seconds: getEffectiveMissionDuration(ch, { duration_seconds: raw }),
    fuel_cost: gains.fuelCost,
    preview_xp: gains.xpGain,
    preview_stardust: gains.stardustGain,
    xp_efficiency: gains.xpEfficiency,
    stardust_efficiency: gains.efficiency,
    loot_type: missionLootTypeFromName(offer.name),
    gear_drop_chance: missionGearDropChance(missStreak),
    rarity_weights: { ...MISSION_GEAR_RARITY_WEIGHTS },
  };
}

/** Convert a persisted board offer into the authoritative LaunchMission template. */
function offerToLaunchTemplate(offer) {
  return {
    name: offer.name,
    description: offer.description || "",
    location: offer.location || "",
    sector: offer.sector || 1,
    level_requirement: offer.level_requirement || 1,
    patron: offer.patron || null,
    explore_scene: offer.explore_scene,
    duration_seconds: Math.floor(Number(offer.duration_seconds)),
    fuel_cost: typeof offer.fuel_cost === "number" ? offer.fuel_cost : undefined,
    stardust_efficiency: offer.stardust_efficiency,
    xp_efficiency: offer.xp_efficiency,
    rewards: {},
  };
}

// ── GetMissionBoard ──────────────────────────────────────────
// Authoritative Cantina board. Generates + persists the offers on first request
// (or on explicit reroll), then returns freshly-computed preview values. Reconnects
// and page hops re-serve the SAME persisted offers — they do not reroll.
export async function GetMissionBoard(user, body) {
  const reroll = !!(body && body.reroll);
  try {
    const result = await withTransactionAsync(async () => {
      let ch = requireMyChar(user);
      // Use effective (post-daily-reset) fuel for the affordability decision, but do
      // not persist a fuel reset from a read-style board request — LaunchMission owns that.
      const reset = checkFuelReset(ch);
      const chForGen = reset ? { ...ch, ...reset } : ch;

      let board = ch.mission_board;
      const valid =
        board &&
        board.version === MISSION_BOARD_VERSION &&
        Array.isArray(board.offers) &&
        board.offers.length > 0;

      if (reroll || !valid) {
        const offers = generateMissionBoardOffers(chForGen, secureRandom);
        board = {
          version: MISSION_BOARD_VERSION,
          generated_at: clock.now().toISOString(),
          character_level: chForGen.level || 1,
          offers,
        };
        ch = entities.Character.update(ch.id, { mission_board: board });
      }

      const offers = board.offers.map((o) => serializeBoardOffer(chForGen, o));
      return { success: true, offers, board_generated_at: board.generated_at };
    });
    return { status: 200, body: result };
  } catch (err) {
    if (err.status) return { status: err.status, body: { error: err.message, code: err.code } };
    throw err;
  }
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

// ── GetInventory ─────────────────────────────────────────────
/** Read-only bag + equipped snapshot for the selected Character. */
export async function GetInventory(user, _body = {}) {
  try {
    const character = requireMyChar(user);
    const snap = buildInventorySnapshot(character);
    return { status: 200, body: { success: true, ...snap } };
  } catch (err) {
    if (err.status) {
      return {
        status: err.status,
        body: { error: err.message, code: err.code },
      };
    }
    throw err;
  }
}

// ── EquipItem ────────────────────────────────────────────────
export async function EquipItem(user, body = {}) {
  const itemId = body?.item_id || body?.itemId;
  try {
    const result = await withTransactionAsync(async () => {
      const ch = requireMyChar(user);
      return equipItemForCharacter(ch, itemId);
    });
    return { status: 200, body: result };
  } catch (err) {
    if (err.status) {
      return {
        status: err.status,
        body: { error: err.message, code: err.code },
      };
    }
    throw err;
  }
}

// ── UnequipItem ──────────────────────────────────────────────
export async function UnequipItem(user, body = {}) {
  const itemId = body?.item_id || body?.itemId;
  try {
    const result = await withTransactionAsync(async () => {
      const ch = requireMyChar(user);
      return unequipItemForCharacter(ch, itemId);
    });
    return { status: 200, body: result };
  } catch (err) {
    if (err.status) {
      return {
        status: err.status,
        body: { error: err.message, code: err.code },
      };
    }
    throw err;
  }
}

// ── GetCharacterAttributes ───────────────────────────────────
/** Read-only authoritative attribute + derived-stat sheet for the selected Character. */
export async function GetCharacterAttributes(user, _body = {}) {
  try {
    let character = requireMyChar(user);
    const ensured = ensureCharacterPermanentStats(character);
    character = ensured.character;
    const equipped = loadEquippedItemsForCharacter(character.id);
    const sheet = buildAttributeSheet(character, equipped);
    return {
      status: 200,
      body: {
        success: true,
        sheet,
        character,
        equipped_items: equipped,
        stats_repaired: ensured.repaired,
      },
    };
  } catch (err) {
    if (err.status) {
      return {
        status: err.status,
        body: { error: err.message, code: err.code },
      };
    }
    throw err;
  }
}

// ── BuyAttribute ─────────────────────────────────────────────
export async function BuyAttribute(user, body) {
  const stat = body?.stat;
  if (!ATTR_STAT_KEYS.includes(stat)) {
    return { status: 400, body: { error: "Invalid stat" } };
  }
  const requested = Math.min(20, Math.max(1, Math.floor(Number(body?.count ?? 1)) || 1));

  try {
    const result = await withTransactionAsync(async () => {
      const ch = requireMyChar(user);
      const byStat = {
        strength: 0, agility: 0, intellect: 0, vitality: 0, luck: 0,
        ...(ch.attribute_purchases_by_stat || {}),
      };
      const stats = { ...(ch.stats || {}) };
      let working = { ...ch, stats, attribute_purchases_by_stat: byStat };
      let totalCost = 0;
      let applied = 0;
      while (applied < requested) {
        const cost = getNextAttributePointCost(working, stat);
        if ((ch.stardust || 0) - totalCost < cost) break;
        totalCost += cost;
        byStat[stat] = (byStat[stat] || 0) + 1;
        stats[stat] = (stats[stat] || 0) + 1;
        working = { ...working, stats, attribute_purchases_by_stat: { ...byStat } };
        applied += 1;
      }
      if (applied === 0) httpErr(400, "Not enough stardust");

      const patch = {
        stardust: (ch.stardust || 0) - totalCost,
        stats,
        attribute_purchases_by_stat: byStat,
        attribute_purchases: Object.values(byStat).reduce((a, b) => a + (b || 0), 0),
      };
      const character = entities.Character.update(ch.id, patch);
      const sheet = buildAttributeSheet(
        character,
        loadEquippedItemsForCharacter(character.id),
      );
      return { success: true, cost: totalCost, count: applied, stat, patch, character, sheet };
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
          balances: getBalances(ch),
          idempotent_replay: true,
        };
      }
      const { ch: resetCh, resetPatch } = applyFuelResetIfNeeded(ch);
      ch = resetCh;

      const purchases = ch.fuel_purchases || 0;
      if (purchases >= FUEL_PURCHASE_MAX) httpErr(400, "Fuel purchase limit reached this cycle");
      if (!hasNova(ch, FUEL_PURCHASE_COST)) httpErr(400, "Not enough Nova Crystals");

      const max = getEffectiveMaxFuel(ch);
      const fuel = ch.fuel || 0;
      if (fuel > max - FUEL_PURCHASE_AMOUNT) {
        httpErr(400, `Tank too full — need ${max - FUEL_PURCHASE_AMOUNT} fuel or less to buy +${FUEL_PURCHASE_AMOUNT}`);
      }

      const beforeNovaHalf = readNovaHalfUnits(ch);
      const beforeFuel = fuel;
      const mut = debitNova({
        user,
        character: ch,
        amount: FUEL_PURCHASE_COST,
        category: "buy_fuel",
        reasonCode: "buy_fuel",
        extraPatch: {
          ...(resetPatch || {}),
          fuel: Math.min(max, fuel + FUEL_PURCHASE_AMOUNT),
          fuel_purchases: purchases + 1,
          fuel_updated_at: clock.nowIso(),
        },
      });
      auditFuelPurchase({
        user,
        character: ch,
        beforeNova: fromNovaHalfUnits(beforeNovaHalf),
        afterNova: fromNovaHalfUnits(readNovaHalfUnits(mut.character)),
        beforeFuel,
        afterFuel: mut.character.fuel,
        cost: FUEL_PURCHASE_COST,
        correlationId: newCorrelationId(),
      });
      const receipt = {
        request_id: requestId,
        nova_debited: FUEL_PURCHASE_COST,
        nova_half_units_debited: FUEL_PURCHASE_COST * 2,
        fuel_granted: FUEL_PURCHASE_AMOUNT,
        transaction_id: mut.transaction.transaction_id,
        balances: mut.balances,
      };
      saveWalletOperation(user.id, "buy_fuel", requestId, receipt);
      return { success: true, ...receipt, patch: mut.patch, character: mut.character };
    });
    return { status: 200, body: result };
  } catch (err) {
    if (err.status) return { status: err.status, body: { error: err.message, code: err.code } };
    throw err;
  }
}

// ── BuyFuelMount ─────────────────────────────────────────────
export async function BuyFuelMount(user, body) {
  if (!isShipHangarEnabled()) {
    return { status: 503, body: { error: "Ship Hangar is Coming Soon", code: "ship_hangar_offline" } };
  }
  const mountId = body?.mount_id;
  const mount = getFuelMountById(mountId);
  if (!mount) return { status: 400, body: { error: "Invalid mount_id" } };

  try {
    const result = await withTransactionAsync(async () => {
      const ch = requireMyChar(user);
      if ((ch.stardust || 0) < mount.stardust) httpErr(400, "Not enough stardust");
      if (mount.crystals && !hasNova(ch, mount.crystals)) {
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
        ...(mount.crystals
          ? { ...novaDebitPatch(ch, mount.crystals) }
          : { economy_nova_scale: 2 }),
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
export async function UseConsumable(user, body = {}) {
  const itemId = body?.item_id;
  if (!itemId) return { status: 400, body: { error: "Missing item_id" } };

  // Strip client-forged mechanical fields — rarity/mult/duration come from item + tiers.
  if (body && typeof body === "object") {
    for (const k of [
      "mult",
      "bonus",
      "bonus_percent",
      "duration",
      "duration_hours",
      "rarity",
      "attribute",
      "stat",
      "expires_at",
      "active_buffs",
    ]) {
      if (Object.prototype.hasOwnProperty.call(body, k)) delete body[k];
    }
  }

  const requestId = (() => {
    try {
      return normalizeOperationKey(body?.request_id || body?.idempotencyKey || "");
    } catch {
      return "";
    }
  })();
  // Natural idempotency: one item instance can only activate once.
  const settleKey = requestId || `item:${String(itemId).trim()}`;

  try {
    const result = await withTransactionAsync(async () => {
      const prior = getWalletOperation(user.id, "use_consumable", settleKey);
      if (prior) {
        const ch = requireMyChar(user);
        const live = entities.Character.get(ch.id) || ch;
        return {
          ...prior,
          character: live,
          patch: {},
          sheet: buildAttributeSheet(live, loadEquippedItemsForCharacter(live.id)),
          active_stims: getActiveStims(live),
          idempotent_replay: true,
        };
      }

      const ch = requireMyChar(user);
      const item = entities.Item.get(itemId);
      if (!item) httpErr(404, "Item not found");
      if (item.character_id !== ch.id) httpErr(403, "Not your item");

      const prepared = prepareConsumableBuffs(ch, item, undefined, clock.nowMs());
      if (!prepared.ok) httpErr(400, prepared.reason);

      entities.Item.delete(itemId);
      const patch = { active_buffs: prepared.buffs };
      const character = entities.Character.update(ch.id, patch);
      const sheet = buildAttributeSheet(
        character,
        loadEquippedItemsForCharacter(character.id),
      );
      const receipt = {
        success: true,
        patch,
        item_id: itemId,
        active_stims: getActiveStims(character),
      };
      saveWalletOperation(user.id, "use_consumable", settleKey, receipt);
      return {
        success: true,
        patch,
        character,
        sheet,
        active_stims: receipt.active_stims,
      };
    });
    return { status: 200, body: result };
  } catch (err) {
    if (err.status) return { status: err.status, body: { error: err.message, code: err.code } };
    throw err;
  }
}

export async function GetActiveStims(user) {
  try {
    const ch = requireMyChar(user);
    const now = clock.nowMs();
    const active = getActiveStims(ch, now);
    // Soft-clean expired rows from persistence (non-authoritative for combat — expiry filter is).
    const live = (ch.active_buffs || []).filter((b) => new Date(b.expires_at).getTime() > now);
    let character = ch;
    if (live.length !== (ch.active_buffs || []).length) {
      character = entities.Character.update(ch.id, { active_buffs: live });
    }
    const sheet = buildAttributeSheet(
      character,
      loadEquippedItemsForCharacter(character.id),
    );
    return {
      status: 200,
      body: {
        success: true,
        active_stims: active,
        active_buffs: live,
        sheet,
        character,
        server_time_ms: now,
        max_active_attributes: MAX_ACTIVE_STAT_TYPES,
      },
    };
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
  const boardOfferId = body?.board_offer_id ? String(body.board_offer_id) : "";
  const clientTemplate = body?.template;
  if (!boardOfferId) {
    if (!clientTemplate?.name || !clientTemplate?.duration_seconds) {
      return { status: 400, body: { error: "Missing template fields" } };
    }
    // Hard bounds only — level pools gate generation, not accept/complete.
    // Stale cantina offers (rolled at a prior level) must remain launchable.
    const rawDurationPre = Math.floor(Number(clientTemplate.duration_seconds));
    if (!isLaunchableMissionDuration(rawDurationPre)) {
      return { status: 400, body: { error: "Invalid mission duration", code: "INVALID_DURATION" } };
    }
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

      // Resolve the authoritative template. With board_offer_id, all gameplay values
      // (duration, efficiency, pinned fuel) come from the server-persisted offer — the
      // client's duration/efficiency/fuel are never trusted. The legacy template path
      // stays for backward compatibility but is not used by the current client.
      let template = clientTemplate;
      if (boardOfferId) {
        const board = ch.mission_board;
        const offer =
          board && Array.isArray(board.offers)
            ? board.offers.find((o) => o.offer_id === boardOfferId)
            : null;
        if (!offer) httpErr(409, "That contract is no longer on the board", "OFFER_NOT_FOUND");
        if ((offer.level_requirement || 1) > level) {
          httpErr(403, `Requires level ${offer.level_requirement}`, "LEVEL_TOO_LOW");
        }
        template = offerToLaunchTemplate(offer);
      }

      const rawDuration = Math.floor(Number(template.duration_seconds));
      if (!isLaunchableMissionDuration(rawDuration)) {
        httpErr(400, "Invalid mission duration", "INVALID_DURATION");
      }

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
      const missStreak = missionGearMissStreak(ch);
      const lootDropChance = missionGearDropChance(missStreak);
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

      // Snapshot reward definition at start. Item rolls (Gear/Stim/Junk) settle
      // exactly once in ClaimMission — not here (Restoration 11).
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
          loot_type: lootType,
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
        // Board is consumed on launch — the next Cantina visit regenerates offers.
        mission_board: null,
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

// ── PrepareMissionCombat / ClaimMission / FailMission ────────
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

/**
 * Authoritative mission soft-encounter simulation (Restoration 08).
 * Idempotent: replaying returns the committed combat_result.
 */
export async function PrepareMissionCombat(user, body = {}) {
  try {
    const result = await withTransactionAsync(async () => {
      const ch = requireMyChar(user);
      const missionId = body?.mission_id || ch.active_mission_id;
      if (!missionId) httpErr(400, "Missing mission_id", "VALIDATION_ERROR");

      let mission = entities.Mission.get(missionId);
      if (!mission) httpErr(404, "Mission not found", "NOT_FOUND");
      if (mission.character_id !== ch.id) {
        httpErr(403, "Not your mission", "CHARACTER_NOT_OWNED");
      }
      if (mission.status === "claimed" || mission.status === "failed") {
        httpErr(409, "Mission already resolved", "REWARD_ALREADY_CLAIMED");
      }

      const now = clock.nowMs();
      const charEnd = ch.mission_end_time ? new Date(ch.mission_end_time).getTime() : 0;
      const missionEnd = mission.end_time ? new Date(mission.end_time).getTime() : 0;
      const effectiveEnd =
        mission.status === "completed"
          ? (charEnd || missionEnd)
          : (missionEnd || charEnd);
      if (effectiveEnd && effectiveEnd > now) {
        httpErr(400, "Mission not finished yet", TimeErrors.COOLDOWN_ACTIVE);
      }

      // Reject client-supplied combatants / outcomes (security).
      if (body?.player || body?.enemy || body?.battle || body?.winner != null || body?.events) {
        httpErr(400, "Client combat payloads are not accepted", "CLIENT_COMBAT_REJECTED");
      }
      if (body?.rng_seed != null || body?.seed != null) {
        httpErr(400, "Client RNG seeds are not accepted", "CLIENT_RNG_REJECTED");
      }

      const prepared = prepareMissionCombatForCharacter(ch, mission, secureRandom);
      const pub = publicCombatResult(prepared.combat);
      return {
        success: true,
        replay: prepared.replay,
        combat_id: prepared.combat.combat_id,
        ...pub,
        enemy: pub.enemy,
        battle: pub.battle,
      };
    });
    return { status: 200, body: result };
  } catch (err) {
    if (err.status) return { status: err.status, body: { error: err.message, code: err.code } };
    throw err;
  }
}

export async function ClaimMission(user, body) {
  const missionId = body?.mission_id;
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

      // Authoritative combat — never trust body.won / client battle payloads.
      let combat = readMissionCombat(mission);
      if (!combat?.combat_id) {
        const prepared = prepareMissionCombatForCharacter(ch, mission, secureRandom);
        combat = prepared.combat;
        mission = prepared.mission || entities.Mission.get(missionId);
      }
      const won = combat.winner === "player";

      if (!won) {
        entities.Mission.update(mission.id, { status: "failed" });
        const patch = { active_mission_id: "", mission_end_time: "" };
        const character = entities.Character.update(ch.id, patch);
        return {
          success: true,
          won: false,
          combat_id: combat.combat_id,
          patch,
          character,
          items: [],
          gains: null,
        };
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
          const missStreak = missionGearMissStreak(live);
          const chain = settleMissionItemChain({
            character: live,
            mission,
            missionStardustReward: gains.stardustBase || gains.stardustGain || 0,
            missStreak,
            rng: secureRandom,
          });
          // Species discovery only from mission snapshot — never client species_id
          const speciesId = rewards.species_id || null;
          return {
            stardust: gains.stardustGain || 0,
            experience: gains.xpGain,
            itemTemplates: chain.itemTemplates,
            species_id: speciesId,
            gearDropped: chain.gearDropped,
            itemOutcome: chain.itemOutcome,
            gainsMeta: {
              stardustBase: gains.stardustBase,
              xpBase: gains.xpBase,
              efficiency: gains.efficiency,
              xpEfficiency: gains.xpEfficiency,
              collectionPct: gains.collectionPct,
              fuelSpent: gains.fuelCost,
              nexusBonus,
              gearDropped: chain.gearDropped,
              itemOutcome: chain.itemOutcome,
              gearChance: chain.gearChance,
              pityBefore: chain.pityBefore,
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

          const rolled = rollCombatCollectibleDiscoveries(live, patch, { win: true });
          const discoveries = rolled.found;

          entities.Mission.update(mission.id, { status: "claimed" });

          const ach = mergeAchievementUnlocks(live, patch);
          Object.assign(patch, ach.patch);

          const progression = consumeProgression(patch);
          const character = entities.Character.update(live.id, patch);
          if (ach.newly_unlocked?.length) {
            notifyAchievementsUnlocked(character.id, ach.newly_unlocked);
          }
          return {
            success: true,
            won: true,
            patch,
            character,
            progression,
            items,
            pending_loot: pendingLoot,
            newly_unlocked: ach.newly_unlocked,
            discoveries,
            item_outcome: payload.itemOutcome || (gearDropped ? "GEAR" : "NONE"),
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
      if (!hasNova(ch, amount)) {
        httpErr(400, "Not enough Nova Crystals");
      }
      const mut = debitNova({
        user,
        character: ch,
        amount,
        category: purpose || "debit_nova",
        reasonCode: purpose || "debit_nova",
        relatedEntityType: "mission",
        relatedEntityId: missionId,
        idempotencyKey: requestId ? `debit_nova_${requestId}` : "",
      });
      const receipt = {
        request_id: requestId,
        amount,
        purpose,
        mission_id: missionId,
        transaction_id: mut.transaction?.transaction_id,
        balances: mut.balances,
      };
      saveWalletOperation(user.id, "mission_skip_nova", requestId, receipt);
      return { success: true, ...receipt, patch: mut.patch, character: mut.character };
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

      const halfCost = skipCostHalfUnits(mission);
      const displayCost = skipCostFor(mission);
      if (halfCost > 0 && readNovaHalfUnits(ch) < halfCost) {
        httpErr(400, "Not enough Nova Crystals");
      }

      entities.Mission.update(mission.id, { status: "completed" });
      let character = ch;
      let patch = { mission_end_time: clock.nowIso() };
      let transaction = null;
      if (halfCost > 0) {
        const mut = debitNovaHalfUnits({
          user,
          character: ch,
          amountHalfUnits: halfCost,
          category: "mission_skip",
          reasonCode: "mission_skip",
          relatedEntityType: "mission",
          relatedEntityId: mission.id,
          idempotencyKey: `mission_skip_${mission.id}`,
          extraPatch: patch,
        });
        character = mut.character;
        patch = mut.patch;
        transaction = mut.transaction;
        if (mut.replay) {
          return {
            success: true,
            skip_cost: displayCost,
            skip_cost_half_units: halfCost,
            mission: entities.Mission.get(mission.id),
            patch: {},
            character,
            balances: mut.balances,
            idempotent_replay: true,
            transaction,
          };
        }
      } else {
        character = entities.Character.update(ch.id, patch);
      }
      const updatedMission = entities.Mission.get(mission.id);
      return {
        success: true,
        skip_cost: displayCost,
        skip_cost_half_units: halfCost,
        mission: updatedMission,
        patch,
        character,
        balances: getBalances(character),
        transaction,
      };
    });
    return { status: 200, body: result };
  } catch (err) {
    if (err.status) return { status: err.status, body: { error: err.message, code: err.code } };
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
      const presentation = serializeShopPresentation(meta, win);
      return { success: true, shop_meta: meta, patch, character, ...presentation };
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
  try {
    assertShopPurchaseClientSafe(body);
  } catch (err) {
    if (err.status) return { status: err.status, body: { error: err.message, code: err.code } };
    throw err;
  }

  const slotId = body?.slot_id;
  const haggle = !!body?.haggle;
  const isHot = !!body?.is_hot;
  if (!slotId) return { status: 400, body: { error: "Missing slot_id" } };

  let requestId = "";
  try {
    requestId = normalizeOperationKey(body?.request_id || body?.idempotencyKey);
  } catch (err) {
    if (err.status) return { status: err.status, body: { error: err.message } };
    throw err;
  }

  try {
    const result = await withTransactionAsync(async () => {
      const ch = requireMyChar(user);
      const win = getShopWindow();
      const day = getShopGameDayKey();

      if (requestId) {
        const replay = getWalletOperation(user.id, "buy_shop_gear", requestId);
        if (replay) {
          const live = entities.Character.get(ch.id) || ch;
          return {
            success: true,
            ...replay,
            patch: {},
            character: live,
            idempotent_replay: true,
            ...serializeShopPresentation(live.shop_meta || {}, win),
          };
        }
      }

      let meta = normalizeShopMeta(ch, win, day);
      if (!shopMetaHasStock(meta)) {
        httpErr(409, "Shop stock expired — call EnsureShop", "SHOP_STOCK_EXPIRED");
      }

      const clientRefresh = body?.refresh_id ?? body?.window_idx;
      if (clientRefresh != null && Number(clientRefresh) !== Number(meta.window_idx)) {
        httpErr(409, "Shop refresh generation mismatch — reload shop", "SHOP_GENERATION_MISMATCH");
      }

      let slot;
      const stock = Array.isArray(meta.shop_stock) && meta.shop_stock.length
        ? meta.shop_stock
        : meta.gear_stock || [];
      if (isHot) {
        if (meta.hot_purchased || meta.hot_yanked) httpErr(409, "Hot deal already gone", "SHOP_SOLD_OUT");
        slot = meta.hot_deal;
        if (!slot || slot._slotId !== slotId) httpErr(404, "Hot deal slot not found");
      } else {
        if (meta.purchased?.[slotId] || meta.yanked?.[slotId]) {
          httpErr(409, "Already gone", "SHOP_SOLD_OUT");
        }
        slot = stock.find((s) => s._slotId === slotId);
        if (!slot) httpErr(404, "Slot not found");
        if (slot.type === "consumable") httpErr(400, "Use BuyShopConsumable for stims");
      }

      let stardustCost = Number(slot.cost || 0);
      let haggleNote = null;
      if (haggle) {
        if (slot._bundle) httpErr(400, "Can't haggle bundles");
        const outcome = rollHaggle();
        haggleNote = outcome.label;
        if (!outcome.ok) {
          const nextMeta = replaceArmoryListing(meta, win, ch, slotId, isHot, "yanked");
          const patch = { shop_meta: nextMeta };
          const character = entities.Character.update(ch.id, patch);
          const receipt = {
            request_id: requestId || null,
            transaction_id: requestId || newCorrelationId(),
            slot_id: slotId,
            is_hot: isHot,
            haggle: true,
            haggle_failed: true,
            haggle_note: haggleNote,
            cost: 0,
            nova_cost: 0,
            items: [],
            pending_loot: [],
            refresh_id: nextMeta.window_idx,
            vendor: "gear",
          };
          if (requestId) saveWalletOperation(user.id, "buy_shop_gear", requestId, receipt);
          return {
            success: true,
            ...receipt,
            patch,
            character,
            ...serializeShopPresentation(nextMeta, win),
          };
        }
        stardustCost = Math.max(1, Math.round(stardustCost * outcome.mult));
      }
      const novaCost = Number(slot.nova_cost || 0);
      if ((ch.stardust || 0) < stardustCost) httpErr(400, "Not enough stardust");
      if (novaCost && !hasNova(ch, novaCost)) httpErr(400, "Not enough Nova Crystals");

      const nextMeta = replaceArmoryListing(meta, win, ch, slotId, isHot, "purchased");
      const beforeStardust = ch.stardust || 0;
      const beforeNovaDisplay = fromNovaHalfUnits(readNovaHalfUnits(ch));
      const patch = {
        stardust: beforeStardust - stardustCost,
        shop_meta: nextMeta,
        ...(novaCost ? novaDebitPatch(ch, novaCost) : {}),
      };

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
      const corr = newCorrelationId();
      auditShopPurchase({
        user,
        character: ch,
        beforeStardust,
        afterStardust: patch.stardust,
        beforeNova: beforeNovaDisplay,
        afterNova: novaCost
          ? fromNovaHalfUnits(patch.nova_crystals)
          : beforeNovaDisplay,
        item: items[0] || null,
        cost: stardustCost,
        novaCost,
        correlationId: corr,
      });

      const receipt = {
        request_id: requestId || null,
        transaction_id: requestId || corr,
        slot_id: slotId,
        is_hot: isHot,
        haggle: !!haggle,
        haggle_failed: false,
        haggle_note: haggleNote,
        cost: stardustCost,
        nova_cost: novaCost,
        items,
        pending_loot: pendingLoot,
        refresh_id: nextMeta.window_idx,
        vendor: "gear",
        item_ids: items.map((i) => i.id).filter(Boolean),
      };
      if (requestId) saveWalletOperation(user.id, "buy_shop_gear", requestId, receipt);

      return {
        success: true,
        ...receipt,
        patch,
        character,
        ...serializeShopPresentation(nextMeta, win),
      };
    });
    return { status: 200, body: result };
  } catch (err) {
    if (err.status) return { status: err.status, body: { error: err.message, code: err.code } };
    throw err;
  }
}

// ── BuyShopConsumable ────────────────────────────────────────
export async function BuyShopConsumable(user, body) {
  try {
    assertShopPurchaseClientSafe(body);
  } catch (err) {
    if (err.status) return { status: err.status, body: { error: err.message, code: err.code } };
    throw err;
  }

  const slotId = body?.slot_id;
  const slotIndex = body?.slot_index;
  if (slotId == null && slotIndex == null) {
    return { status: 400, body: { error: "Missing slot_id or slot_index" } };
  }

  let requestId = "";
  try {
    requestId = normalizeOperationKey(body?.request_id || body?.idempotencyKey);
  } catch (err) {
    if (err.status) return { status: err.status, body: { error: err.message } };
    throw err;
  }

  try {
    const result = await withTransactionAsync(async () => {
      const ch = requireMyChar(user);
      const win = getShopWindow();
      const day = getShopGameDayKey();

      if (requestId) {
        const replay = getWalletOperation(user.id, "buy_shop_consumable", requestId);
        if (replay) {
          const live = entities.Character.get(ch.id) || ch;
          return {
            success: true,
            ...replay,
            patch: {},
            character: live,
            idempotent_replay: true,
            ...serializeShopPresentation(live.shop_meta || {}, win),
          };
        }
      }

      let meta = normalizeShopMeta(ch, win, day);
      if (!shopMetaHasStock(meta)) {
        httpErr(409, "Shop stock expired — call EnsureShop", "SHOP_STOCK_EXPIRED");
      }

      const clientRefresh = body?.refresh_id ?? body?.window_idx;
      if (clientRefresh != null && Number(clientRefresh) !== Number(meta.window_idx)) {
        httpErr(409, "Shop refresh generation mismatch — reload shop", "SHOP_GENERATION_MISMATCH");
      }

      const stock = Array.isArray(meta.shop_stock) && meta.shop_stock.length
        ? meta.shop_stock
        : meta.cons_stock || [];

      let idx = slotIndex;
      let slot;
      if (slotId != null) {
        if (meta.purchased?.[slotId] || meta.yanked?.[slotId]) {
          httpErr(409, "Already gone", "SHOP_SOLD_OUT");
        }
        idx = stock.findIndex((s) => s._slotId === slotId);
        slot = stock[idx];
      } else {
        slot = stock[slotIndex];
      }
      if (!slot || idx < 0) httpErr(404, "Consumable slot not found");
      if (slot.type !== "consumable") httpErr(400, "Not a stim offer");

      // Persisted listing cost only — never trust client; fallback is server formula.
      const cost = Number(slot.cost ?? slot._cost ?? stimShopPurchasePrice(slot.rarity, ch.level || 1));
      if ((ch.stardust || 0) < cost) httpErr(400, "Not enough stardust");

      const beforeStardust = ch.stardust || 0;
      const patch = { stardust: beforeStardust - cost };
      const payloads = slot._bundle === "stim_trio" && Array.isArray(slot.bundle_items)
        ? slot.bundle_items.map(({ _cost, _slotId, ...rest }) => rest)
        : [stripShopFields(slot)];

      const items = [];
      const pendingLoot = [];
      const grantCtx = { accountId: user.id, characterId: ch.id };
      for (const p of payloads) {
        collectGrant(grantOrCompensate(ch, p, patch), items, pendingLoot, grantCtx);
      }

      const nextMeta = {
        ...meta,
        purchased: { ...(meta.purchased || {}), [slot._slotId]: true },
      };
      patch.shop_meta = nextMeta;

      const character = entities.Character.update(ch.id, patch);
      const corr = newCorrelationId();
      auditShopPurchase({
        user,
        character: ch,
        beforeStardust,
        afterStardust: patch.stardust,
        beforeNova: ch.nova_crystals || 0,
        afterNova: ch.nova_crystals || 0,
        item: items[0] || null,
        cost,
        novaCost: 0,
        correlationId: corr,
      });

      const receipt = {
        request_id: requestId || null,
        transaction_id: requestId || corr,
        slot_id: slot._slotId,
        is_hot: false,
        haggle: false,
        haggle_failed: false,
        haggle_note: null,
        cost,
        nova_cost: 0,
        items,
        pending_loot: pendingLoot,
        refresh_id: nextMeta.window_idx,
        vendor: "supply",
        item_ids: items.map((i) => i.id).filter(Boolean),
      };
      if (requestId) saveWalletOperation(user.id, "buy_shop_consumable", requestId, receipt);

      return {
        success: true,
        ...receipt,
        patch,
        character,
        ...serializeShopPresentation(nextMeta, win),
      };
    });
    return { status: 200, body: result };
  } catch (err) {
    if (err.status) return { status: err.status, body: { error: err.message, code: err.code } };
    throw err;
  }
}

// ── RefreshShop ──────────────────────────────────────────────
export async function RefreshShop(user, body) {
  const which = body?.which || "gear";
  if (which !== "gear" && which !== "consumables" && which !== "all") {
    return { status: 400, body: { error: "which must be 'gear', 'consumables', or 'all'" } };
  }

  try {
    const result = await withTransactionAsync(async () => {
      const ch = requireMyChar(user);
      const win = getShopWindow();
      let meta = normalizeShopMeta(ch, win, getShopGameDayKey());

      // Manual restock always costs Nova — unlimited refreshes per window.
      // body.use_free is ignored (kept on the wire for older clients).
      if (!hasNova(ch, SHOP_REFRESH_COST)) {
        httpErr(400, "Not enough Nova Crystals");
      }
      const novaCost = SHOP_REFRESH_COST;
      meta = { ...meta, free_refresh_used: true };

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
      meta = buildShopStock(ch, meta, win, { refreshHotDeal: false });

      let character = ch;
      let patch = { shop_meta: meta };
      if (novaCost > 0) {
        const mut = debitNova({
          user,
          character: ch,
          amount: novaCost,
          category: "shop_refresh",
          reasonCode: "shop_refresh",
          extraPatch: { shop_meta: meta },
        });
        character = mut.character;
        patch = mut.patch;
      } else {
        character = entities.Character.update(ch.id, patch);
      }
      return {
        success: true,
        which: "all",
        shop_meta: meta,
        patch,
        character,
        used_free: novaCost === 0,
        nova_debited: novaCost,
        balances: getBalances(character),
        ...serializeShopPresentation(meta, win),
      };
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
  GetInventory,
  EquipItem,
  UnequipItem,
  GetCharacterAttributes,
  BuyAttribute,
  BuyFuel,
  BuyFuelMount,
  UseConsumable,
  GetActiveStims,
  SyncFuelCycle,
  GetMissionBoard,
  LaunchMission,
  PrepareMissionCombat,
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
