/**
 * Safety limits for reward payloads (integer units).
 *
 * These are anti-runaway guards, not gameplay design. Production mission
 * Stardust grows with snapshot level and already exceeds a 500k ceiling by
 * mid-game (a long L467 contract is ~11.7M Stardust before Nexus / ship
 * mods). Derive the ceiling from certified formulas at the progression
 * validation horizon, then apply named headroom for Nexus, ship mods,
 * collection XP %, and first-mission bonus Stardust.
 */

import { missionVictoryXp, missionVictoryStardust } from "../../../src/lib/productionMath/missions.js";
import {
  BASIS_POINTS_DENOMINATOR,
  MISSION_MAX_FUEL,
  VARIANCE_MAX,
} from "../../../src/lib/productionMath/constants.js";

/** Same validation horizon as characterProgression — not a player-facing level cap. */
export const REWARD_SAFETY_HORIZON_LEVEL = 2000;

/** 10× over formula max at the horizon. 100_000 bps / 10_000 = 10. */
export const REWARD_SAFETY_HEADROOM_BPS = 100_000;

export const REWARD_SAFETY_MAX_MISSION_FUEL = MISSION_MAX_FUEL;

function ceilingWithHeadroom(formulaAmount) {
  return Math.ceil(
    (Number(formulaAmount) || 0) * REWARD_SAFETY_HEADROOM_BPS / BASIS_POINTS_DENOMINATOR,
  );
}

const maxStardustPerClaim = ceilingWithHeadroom(
  missionVictoryStardust({
    fuel: REWARD_SAFETY_MAX_MISSION_FUEL,
    snapshotLevel: REWARD_SAFETY_HORIZON_LEVEL,
    stardustVariance: VARIANCE_MAX,
  }),
);

const maxExperiencePerClaim = ceilingWithHeadroom(
  missionVictoryXp({
    fuel: REWARD_SAFETY_MAX_MISSION_FUEL,
    snapshotLevel: REWARD_SAFETY_HORIZON_LEVEL,
    xpVariance: VARIANCE_MAX,
  }),
);

export const REWARD_LIMITS = Object.freeze({
  maxStardustPerClaim,
  maxNovaPerClaim: 10_000,
  maxExperiencePerClaim,
  maxFuelPerClaim: 500,
  maxItemInstancesPerClaim: 20,
  maxItemQuantity: 99,
  maxAdminStardust: maxStardustPerClaim,
  maxAdminNova: 50_000,
  maxAdminExperience: maxExperiencePerClaim,
});

export function validateRewardPayload(payload, { admin = false } = {}) {
  const errors = [];
  if (!payload || typeof payload !== "object") {
    return { ok: false, errors: ["payload required"] };
  }
  const maxSd = admin ? REWARD_LIMITS.maxAdminStardust : REWARD_LIMITS.maxStardustPerClaim;
  const maxNova = admin ? REWARD_LIMITS.maxAdminNova : REWARD_LIMITS.maxNovaPerClaim;
  const maxXp = admin ? REWARD_LIMITS.maxAdminExperience : REWARD_LIMITS.maxExperiencePerClaim;

  const sd = Number(payload.stardust) || 0;
  const nova = Number(payload.nova_crystals) || 0;
  const xp = Number(payload.experience) || 0;
  const fuel = Number(payload.fuel) || 0;

  if (sd < 0 || nova < 0 || xp < 0 || fuel < 0) errors.push("negative amounts");
  if (sd > maxSd) errors.push("stardust limit");
  if (nova > maxNova) errors.push("nova limit");
  if (xp > maxXp) errors.push("experience limit");
  if (fuel > REWARD_LIMITS.maxFuelPerClaim) errors.push("fuel limit");

  if (Array.isArray(payload.items) && payload.items.length > REWARD_LIMITS.maxItemInstancesPerClaim) {
    errors.push("too many items");
  }

  return { ok: errors.length === 0, errors };
}
