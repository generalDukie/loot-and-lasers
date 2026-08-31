/**
 * Authoritative Stim activation / stacking.
 * Duration math is productionMath.nextStimState. Inventory delete is the caller's job.
 */
import {
  MILLISECONDS_PER_HOUR,
  STIM_MAX_ACTIVE_EFFECTS,
  STIM_TIERS,
  nextStimState,
  resolveStimRarity,
  stimBonusMultiplier,
  stimSameTierRestimCooldownHours,
  stimSameTierRestimRemainingBlockHours,
  stimTierSpec,
} from "./productionMath/index.js";

export { resolveStimRarity };

export const STIM_TIER_LABELS = Object.freeze({
  uncommon: "Uncommon",
  rare: "Rare",
  epic: "Epic",
});

export function stimTierPresentation(tierKey) {
  const spec = stimTierSpec(tierKey);
  if (!spec) return null;
  return {
    mult: stimBonusMultiplier(tierKey),
    duration_hours: spec.baseHours,
    max_duration_hours: spec.maxHours,
    label: STIM_TIER_LABELS[tierKey] || tierKey,
    rarity: tierKey,
  };
}

export const CONSUMABLE_TIERS = Object.freeze({
  uncommon: Object.freeze(stimTierPresentation("uncommon")),
  rare: Object.freeze(stimTierPresentation("rare")),
  epic: Object.freeze(stimTierPresentation("epic")),
});

export const STIM_ATTRIBUTES = Object.freeze([
  "strength",
  "agility",
  "intellect",
  "vitality",
  "luck",
]);

export const STIM_ITEM_TYPE = "consumable";
export const STIM_NOT_STIM_REASON = "Not a stim.";
export const STIM_TRIO_RETIRED_REASON = "Stim Trios are no longer available.";
export const STIM_INVALID_ATTRIBUTE_REASON = "Invalid Stim attribute.";
export const STIM_INVALID_RARITY_REASON = "Invalid Stim rarity.";
export const STIM_LOWER_TIER_BLOCK_REASON =
  "A stronger Stim is already active on that attribute.";
export const STIM_TOO_CONCENTRATED_REASON = "Stim effects are too concentrated.";

const STIM_TIER_RANK = Object.freeze({ uncommon: 0, rare: 1, epic: 2 });

export function stimRarityRank(rarity) {
  const n = STIM_TIER_RANK[rarity];
  return n == null ? -1 : n;
}

function makeStimBuff({
  stat,
  mult,
  name,
  rarity,
  durationHours,
  stacks,
  expiresAt,
  lastAppliedAt,
  activatedAt,
}) {
  const appliedIso = new Date(lastAppliedAt).toISOString();
  return {
    stat,
    mult,
    name,
    rarity,
    duration_hours: durationHours,
    stacks,
    expires_at: new Date(expiresAt).toISOString(),
    last_applied_at: appliedIso,
    activated_at: activatedAt ? new Date(activatedAt).toISOString() : appliedIso,
  };
}

function lastAppliedAtMs(buff) {
  const raw = buff?.last_applied_at;
  if (!raw) return null;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Same-tier restim eligibility from server time vs persisted last_applied_at.
 * Legacy buffs without last_applied_at use remaining vs (maxHours - half base).
 */
export function isSameTierRestimEligible(existing, nowMs) {
  const rarity = resolveStimRarity(existing);
  const cooldownHours = stimSameTierRestimCooldownHours(rarity);
  const cooldownMs = cooldownHours * MILLISECONDS_PER_HOUR;
  if (cooldownMs <= 0) return true;
  const lastMs = lastAppliedAtMs(existing);
  if (lastMs != null) {
    return nowMs - lastMs >= cooldownMs;
  }
  const remainingMs = Math.max(0, new Date(existing.expires_at).getTime() - nowMs);
  const remainingHours = remainingMs / MILLISECONDS_PER_HOUR;
  return remainingHours < stimSameTierRestimRemainingBlockHours(rarity);
}

function stacksFromRemainingHours(remainingHours, baseHours) {
  const base = Number(baseHours) || 0;
  if (base <= 0) return 1;
  return Math.min(
    STIM_MAX_ACTIVE_EFFECTS,
    Math.max(1, Math.ceil((Number(remainingHours) || 0) / base)),
  );
}

/**
 * Validate + compute next active_buffs for a Stim use.
 * Caller must only remove the inventory item when ok === true.
 */
export function prepareConsumableBuffs(character, item, sourceBuffs, nowMs = Date.now()) {
  if (!character || item?.type !== STIM_ITEM_TYPE || !item.consumable) {
    return { ok: false, reason: STIM_NOT_STIM_REASON };
  }
  if (item._bundle === "stim_trio" || item.consumable?.tier === "bundle") {
    return { ok: false, reason: STIM_TRIO_RETIRED_REASON };
  }

  const now = Number(nowMs) || Date.now();
  const stat = String(item.consumable.stat || "").toLowerCase();
  if (!STIM_ATTRIBUTES.includes(stat)) {
    return { ok: false, reason: STIM_INVALID_ATTRIBUTE_REASON };
  }

  const rarity = resolveStimRarity(item);
  const spec = stimTierSpec(rarity);
  if (!spec || !STIM_TIERS[rarity]) {
    return { ok: false, reason: STIM_INVALID_RARITY_REASON };
  }

  const durationHours = spec.baseHours;
  const mult = stimBonusMultiplier(rarity);
  const source = sourceBuffs ?? character.active_buffs ?? [];
  const active = (source || []).filter((b) => new Date(b.expires_at).getTime() > now);
  const sameStatIdx = active.findIndex((b) => b.stat === stat);

  if (sameStatIdx < 0) {
    if (new Set(active.map((b) => b.stat)).size >= STIM_MAX_ACTIVE_EFFECTS) {
      return {
        ok: false,
        reason: `You already have ${STIM_MAX_ACTIVE_EFFECTS} active Stim effects. Remove one first.`,
      };
    }
    return {
      ok: true,
      buffs: [
        ...active,
        makeStimBuff({
          stat,
          mult,
          name: item.name,
          rarity,
          durationHours,
          stacks: 1,
          expiresAt: now + durationHours * MILLISECONDS_PER_HOUR,
          lastAppliedAt: now,
        }),
      ],
    };
  }

  const existing = active[sameStatIdx];
  const existingRarity = resolveStimRarity(existing);
  const inRank = stimRarityRank(rarity);
  const exRank = stimRarityRank(existingRarity);

  if (inRank < exRank) {
    return { ok: false, reason: STIM_LOWER_TIER_BLOCK_REASON };
  }

  if (inRank === exRank && !isSameTierRestimEligible(existing, now)) {
    return { ok: false, reason: STIM_TOO_CONCENTRATED_REASON };
  }

  const remainingMs = Math.max(0, new Date(existing.expires_at).getTime() - now);
  const remainingHours = remainingMs / MILLISECONDS_PER_HOUR;
  const next = nextStimState(
    { tier: existingRarity, remainingHours },
    rarity,
  );
  const nextSpec = stimTierSpec(next.tier) || spec;
  const nextRemainingMs = Math.max(
    0,
    Math.round((Number(next.remainingHours) || 0) * MILLISECONDS_PER_HOUR),
  );
  const buffs = [...active];
  buffs[sameStatIdx] = makeStimBuff({
    stat,
    mult: stimBonusMultiplier(next.tier),
    name: item.name,
    rarity: next.tier,
    durationHours: nextSpec.baseHours,
    stacks: stacksFromRemainingHours(next.remainingHours, nextSpec.baseHours),
    expiresAt: now + nextRemainingMs,
    lastAppliedAt: now,
    activatedAt: inRank > exRank ? now : (existing.activated_at || existing.last_applied_at || now),
  });
  return { ok: true, buffs };
}
