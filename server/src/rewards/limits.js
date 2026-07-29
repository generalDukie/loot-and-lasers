/**
 * Safety limits for reward payloads (integer units).
 */

export const REWARD_LIMITS = Object.freeze({
  maxStardustPerClaim: 500_000,
  maxNovaPerClaim: 10_000,
  maxExperiencePerClaim: 1_000_000,
  maxFuelPerClaim: 500,
  maxItemInstancesPerClaim: 20,
  maxItemQuantity: 99,
  maxAdminStardust: 1_000_000,
  maxAdminNova: 50_000,
  maxAdminExperience: 5_000_000,
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
