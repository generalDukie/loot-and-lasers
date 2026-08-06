/**
 * Daily login reward state — server-authoritative calendar + claim eligibility.
 * Claim path remains ClaimDailyLogin; this module builds the normalized UI state.
 */
import { DAILY_REWARDS } from "./rewards.js";
import { todayET } from "./time/periods.js";
import { clock } from "./time/clock.js";

export const CYCLE_THEMES = [
  "Stardust Voyage",
  "Nebula Reckoning",
  "Void Ascension",
  "Quasar Dawn",
];

function rewardTypeAndAmount(rewards = {}) {
  if (rewards.collectible) {
    return {
      rewardType: "collectible",
      rewardAmount: 1,
      itemId: rewards.collectible?.name || "collectible",
      label: rewards.collectible?.name || "Collectible",
    };
  }
  if (rewards.item_rarity) {
    return {
      rewardType: "item_rarity",
      rewardAmount: 1,
      itemId: String(rewards.item_rarity),
      label: `${String(rewards.item_rarity)[0].toUpperCase()}${String(rewards.item_rarity).slice(1)} Crate`,
    };
  }
  if (rewards.nova_crystals) {
    return { rewardType: "nova_crystals", rewardAmount: Number(rewards.nova_crystals) || 0, label: `${rewards.nova_crystals} Nova` };
  }
  if (rewards.experience) {
    return { rewardType: "experience", rewardAmount: Number(rewards.experience) || 0, label: `${rewards.experience} XP` };
  }
  if (rewards.fuel) {
    return { rewardType: "fuel", rewardAmount: Number(rewards.fuel) || 0, label: `${rewards.fuel} Fuel` };
  }
  if (rewards.stardust) {
    return { rewardType: "stardust", rewardAmount: Number(rewards.stardust) || 0, label: `${rewards.stardust} Stardust` };
  }
  return { rewardType: "unknown", rewardAmount: 0, label: "Reward" };
}

/**
 * Build normalized DailyLoginRewardState for clients.
 * @param {object|null} progress DailyLogin entity row
 * @param {{ today?: string }} [opts]
 */
export function buildDailyLoginRewardState(progress = null, opts = {}) {
  const today = opts.today || todayET();
  const currentDay = Math.max(1, Math.min(30, Number(progress?.current_day) || 1));
  const lastClaimedAt = progress?.last_claim_date ? String(progress.last_claim_date) : null;
  const claimedDays = Array.isArray(progress?.claimed_days)
    ? progress.claimed_days.map((d) => Number(d)).filter((d) => d >= 1 && d <= 30)
    : [];
  const claimedSet = new Set(claimedDays);
  const canClaimToday = lastClaimedAt !== today;
  const streakCount = claimedSet.size;

  const rewards = DAILY_REWARDS.map((entry) => {
    const day = Number(entry.day);
    const raw = entry.rewards || {};
    const meta = rewardTypeAndAmount(raw);
    let status = "locked";
    if (claimedSet.has(day)) {
      status = "claimed";
    } else if (day === currentDay && canClaimToday) {
      status = "available";
    } else if (day < currentDay) {
      // Missed days do not reset streak; they stay locked/skipped in the cycle.
      status = "locked";
    } else {
      status = "locked";
    }
    return {
      day,
      rewardType: meta.rewardType,
      rewardAmount: meta.rewardAmount,
      itemId: meta.itemId,
      label: meta.label,
      status,
      rewards: raw,
    };
  });

  return {
    currentDay,
    lastClaimedAt,
    canClaimToday,
    streakCount,
    cycleTheme: progress?.cycle_theme || CYCLE_THEMES[0],
    today,
    serverNowMs: clock.nowMs(),
    rewards,
    progress: progress || null,
  };
}
