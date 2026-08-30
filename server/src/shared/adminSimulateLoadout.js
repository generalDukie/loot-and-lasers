/**
 * Admin expected-loadout snapshot. Wipes gear/stims and rebuilds an on-level character.
 */
import { entities } from "../entities.js";
import { randomItem } from "./rewards.js";
import { composePermanentAttributes } from "../../../src/lib/characterStats.js";
import {
  buildSimulateLoadoutPlan,
  GEAR_SLOTS,
  SIMULATE_GEAR_RARITY,
  SIMULATE_NOVA_GRANT,
  xpToNext,
} from "./productionMath.js";
import { rebuildMissionBoardForCharacter } from "../functions/economy.js";
import { markCompleted } from "./tutorialService.js";
import { clampStardust, FUEL_MAX, STARDUST_MAX } from "./economyFormulas.js";
import { getBalances } from "./currencyService.js";
import { toNovaHalfUnits } from "./novaBalances.js";
import {
  ActorTypes,
  auditAdminModeration,
  newCorrelationId,
  recordCurrencyChange,
  recordItemOwnershipChange,
} from "../audit/index.js";
import {
  ACCOUNT_CHARACTER_REFRESH_SOURCE_ADMIN_SIMULATE,
  broadcastAccountCharacterRefresh,
} from "../realtime.js";

const SIMULATE_GEAR_ORIGIN = "unassigned";
const ADMIN_GRANT_UNSPECIFIED_REASON = "unspecified";
const MISSION_FAILED_STATUS = "failed";

function httpErr(status, message, code) {
  const e = new Error(message);
  e.status = status;
  if (code) e.code = code;
  throw e;
}

function simulateReason(reason) {
  const text = String(reason || "").trim();
  return text || ADMIN_GRANT_UNSPECIFIED_REASON;
}

export function applyAdminSimulateLevel({ user, characterId, level, reason } = {}) {
  const cid = String(characterId || "").trim();
  if (!cid) httpErr(400, "character_id required", "VALIDATION_ERROR");
  const rawLevel = Number(level);
  if (!Number.isFinite(rawLevel) || rawLevel < 1) {
    httpErr(400, "level must be an integer >= 1", "VALIDATION_ERROR");
  }
  const L = Math.max(1, Math.floor(rawLevel));
  const ch = entities.Character.get(cid);
  if (!ch) httpErr(404, "Character not found", "NOT_FOUND");

  const why = simulateReason(reason);
  const corr = newCorrelationId();
  const nowMs = Date.now();
  const plan = buildSimulateLoadoutPlan({
    className: ch.class,
    level: L,
    nowMs,
  });

  const before = {
    level: ch.level,
    experience: ch.experience,
    stardust: ch.stardust || 0,
    nova_crystals: getBalances(ch).nova_crystals,
    fuel: ch.fuel,
    class: ch.class,
  };

  if (ch.active_mission_id) {
    const mission = entities.Mission.get(ch.active_mission_id);
    if (mission && mission.status !== MISSION_FAILED_STATUS) {
      entities.Mission.update(mission.id, { status: MISSION_FAILED_STATUS });
    }
  }

  entities.Item.deleteMany({ character_id: cid });

  const equippedItems = {};
  const createdItems = [];
  for (const slot of GEAR_SLOTS) {
    const rolled = randomItem(
      SIMULATE_GEAR_RARITY,
      L,
      slot,
      Math.random,
      ch.class,
      { origin: SIMULATE_GEAR_ORIGIN },
    );
    const {
      id: _ignoreId,
      character_id: _ignoreChar,
      owner_id: _ignoreOwner,
      created_by_id: _ignoreCb,
      created_by: _ignoreBy,
      created_date: _ignoreCd,
      updated_date: _ignoreUd,
      is_equipped: _ignoreEq,
      ...safeItem
    } = rolled;
    const created = entities.Item.create({
      ...safeItem,
      name: String(safeItem.name || "Simulated Gear").trim() || "Simulated Gear",
      type: slot,
      rarity: SIMULATE_GEAR_RARITY,
      owner_id: ch.created_by_id || user.id,
      character_id: cid,
      created_by_id: user.id,
      created_by: user.email,
      is_equipped: true,
      locked: false,
      origin: SIMULATE_GEAR_ORIGIN,
    });
    equippedItems[slot] = created.id;
    createdItems.push(created);
    recordItemOwnershipChange({
      user,
      action: "item_granted_by_admin",
      item: created,
      previousOwnerCharacterId: null,
      newOwnerCharacterId: cid,
      previousLocation: "system_storage",
      newLocation: "equipped",
      correlationId: corr,
      reasonText: why,
      actorType: ActorTypes.ADMINISTRATOR,
    });
  }

  const tutorialMarked = markCompleted(ch.onboarding_tutorial, { rewardClaimed: true });
  const onboarding = {
    ...tutorialMarked.state,
    first_mission_bonus_eligible: false,
    first_mission_bonus_spent: true,
  };

  const maxFuel = ch.max_fuel || FUEL_MAX;
  const stardust = clampStardust(Math.min(STARDUST_MAX, plan.stardust));
  const novaHalf = toNovaHalfUnits(SIMULATE_NOVA_GRANT);
  const stats = composePermanentAttributes({
    class: ch.class,
    level: L,
    attribute_purchases_by_stat: plan.purchasesByStat,
  });

  const boardSeed = {
    ...ch,
    level: L,
    fuel: maxFuel,
    active_mission_id: "",
    mission_end_time: "",
  };
  const board = rebuildMissionBoardForCharacter(boardSeed);

  const patch = {
    level: L,
    experience: 0,
    experience_to_next_level: xpToNext(L),
    attribute_purchases_by_stat: plan.purchasesByStat,
    attribute_purchases: plan.purchaseTotal,
    unspent_stat_points: 0,
    stats,
    equipped_items: equippedItems,
    active_buffs: plan.stimBuffs,
    fuel: maxFuel,
    stardust,
    total_stardust_earned: Math.max(Number(ch.total_stardust_earned) || 0, stardust),
    nova_crystals: novaHalf,
    nova_wagerable_half: 0,
    nova_promotional_half: novaHalf,
    nova_dual_balance_v1: true,
    active_mission_id: "",
    mission_end_time: "",
    mission_board: board.mission_board,
    mission_board_status: board.mission_board_status,
    onboarding_tutorial: onboarding,
  };

  const updated = entities.Character.update(cid, patch);
  const afterBal = getBalances(updated);

  recordCurrencyChange({
    user,
    character: ch,
    currencyType: "stardust",
    before: before.stardust,
    after: updated.stardust,
    amount: Number(updated.stardust) - Number(before.stardust),
    reasonCode: "admin_adjust",
    reasonText: why,
    correlationId: corr,
    actorType: ActorTypes.ADMINISTRATOR,
    administratorNote: why,
    source: "admin_simulate_level",
  });
  recordCurrencyChange({
    user,
    character: ch,
    currencyType: "fuel",
    before: before.fuel,
    after: updated.fuel,
    amount: Number(updated.fuel) - Number(before.fuel || 0),
    reasonCode: "admin_adjust",
    reasonText: why,
    correlationId: corr,
    actorType: ActorTypes.ADMINISTRATOR,
    administratorNote: why,
    source: "admin_simulate_level",
  });
  recordCurrencyChange({
    user,
    character: ch,
    currencyType: "nova_crystals",
    before: before.nova_crystals,
    after: afterBal.nova_crystals,
    amount: Number(afterBal.nova_crystals) - Number(before.nova_crystals || 0),
    reasonCode: "admin_adjust",
    reasonText: why,
    correlationId: corr,
    actorType: ActorTypes.ADMINISTRATOR,
    administratorNote: why,
    source: "admin_simulate_level",
  });

  auditAdminModeration(user, "simulate_level", {
    characterId: cid,
    targetAccountId: ch.created_by_id,
    reason: why,
    correlationId: corr,
    beforeState: before,
    afterState: {
      level: updated.level,
      experience: updated.experience,
      stardust: updated.stardust,
      nova_crystals: afterBal.nova_crystals,
      fuel: updated.fuel,
      purchaseTotal: plan.purchaseTotal,
      stimTier: plan.stimTier,
      gearCount: createdItems.length,
    },
    changeSet: {
      level: L,
      class: ch.class,
      purchaseTotal: plan.purchaseTotal,
      stardust: plan.stardust,
      nova: SIMULATE_NOVA_GRANT,
      stimTier: plan.stimTier,
      gearRarity: SIMULATE_GEAR_RARITY,
      itemIds: createdItems.map((item) => item.id),
    },
  });

  broadcastAccountCharacterRefresh(
    updated.created_by_id || ch.created_by_id,
    updated.id,
    ACCOUNT_CHARACTER_REFRESH_SOURCE_ADMIN_SIMULATE,
  );

  return {
    success: true,
    character: updated,
    character_name: updated.name,
    plan: {
      level: plan.level,
      className: plan.className,
      purchaseTotal: plan.purchaseTotal,
      purchasesByStat: plan.purchasesByStat,
      stimTier: plan.stimTier,
      stardust: plan.stardust,
      nova: plan.nova,
      gearRarity: plan.gearRarity,
      gearSlots: plan.gearSlots,
    },
    balances: afterBal,
    equipped_item_ids: equippedItems,
  };
}
