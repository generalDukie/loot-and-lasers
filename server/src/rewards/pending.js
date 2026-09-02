/**
 * Server-persisted overflow loot accept / dissolve.
 */

import { entities } from "../entities.js";
import { grantItemOrPending } from "../shared/inventoryGrant.js";
import { computeStardustValue } from "../shared/economyFormulas.js";
import { ensureGearPricingQuality } from "../../../src/lib/gearPricingQuality.js";
import { RewardErrors } from "./errors.js";
import {
  getPendingLoot,
  resolvePendingLoot,
  auditReward,
} from "./store.js";

export function acceptServerPendingLoot(user, pendingLootId) {
  const pl = getPendingLoot(pendingLootId);
  if (!pl) {
    const err = new Error("Pending loot not found");
    err.status = 404;
    err.code = RewardErrors.REWARD_NOT_FOUND;
    throw err;
  }
  if (pl.accountId !== user.id) {
    const err = new Error("Not your pending loot");
    err.status = 403;
    err.code = RewardErrors.CHARACTER_NOT_OWNED;
    throw err;
  }
  if (pl.status !== "pending") {
    if (pl.status === "accepted") {
      return { success: true, idempotentReplay: true, item: null, pending_loot_id: pl.id };
    }
    const err = new Error("Pending loot already resolved");
    err.status = 409;
    err.code = RewardErrors.REWARD_ALREADY_CLAIMED;
    throw err;
  }
  const ch = entities.Character.get(pl.characterId);
  if (!ch || ch.created_by_id !== user.id) {
    const err = new Error("Character not found");
    err.status = 404;
    throw err;
  }
  const payload = { ...pl.item };
  ensureGearPricingQuality(payload, { className: ch.class, characterClass: ch.class });
  const granted = grantItemOrPending(ch, payload);
  if (granted.pending) {
    const err = new Error("Inventory still full");
    err.status = 400;
    err.code = RewardErrors.INVENTORY_FULL;
    throw err;
  }
  resolvePendingLoot(pl.id, "accepted");
  auditReward({
    claimId: pl.claimId,
    claimKey: pl.claimKey,
    action: "pending_loot_accepted",
    actor: user.id,
    detail: { pendingLootId: pl.id, itemId: granted.item?.id },
  });
  return { success: true, item: granted.item, pending_loot_id: pl.id };
}

export function dissolveServerPendingLoot(user, pendingLootId) {
  const pl = getPendingLoot(pendingLootId);
  if (!pl) {
    const err = new Error("Pending loot not found");
    err.status = 404;
    throw err;
  }
  if (pl.accountId !== user.id) {
    const err = new Error("Not your pending loot");
    err.status = 403;
    throw err;
  }
  if (pl.status !== "pending") {
    if (pl.status === "dissolved") {
      return { success: true, idempotentReplay: true, stardust_gained: 0 };
    }
    const err = new Error("Pending loot already resolved");
    err.status = 409;
    throw err;
  }
  const ch = entities.Character.get(pl.characterId);
  if (!ch || ch.created_by_id !== user.id) {
    const err = new Error("Character not found");
    err.status = 404;
    throw err;
  }
  const value = computeStardustValue(pl.item, {
    fallbackLevel: ch.level,
    className: ch.class,
    characterClass: ch.class,
  });
  const patch = {
    stardust: (ch.stardust || 0) + value,
    total_stardust_earned: (ch.total_stardust_earned || 0) + value,
  };
  const character = entities.Character.update(ch.id, patch);
  resolvePendingLoot(pl.id, "dissolved");
  auditReward({
    claimId: pl.claimId,
    claimKey: pl.claimKey,
    action: "pending_loot_dissolved",
    actor: user.id,
    detail: { pendingLootId: pl.id, stardust: value },
  });
  return { success: true, stardust_gained: value, patch, character, pending_loot_id: pl.id };
}
