import { api } from "@/api/gameClient";

// Mirror of api/shared/rewards.ts — the 30-day calendar shown in the UI.
// Mirror of api/shared/rewards.ts — the 30-day calendar shown in the UI.
// Diversified across stardust, XP, fuel, gear crates, nova crystals,
// and consumable stims.
export const DAILY_REWARDS = [
  { day: 1,  rewards: { stardust: 500 } },
  { day: 2,  rewards: { experience: 800 } },
  { day: 3,  rewards: { stardust: 600 } },
  { day: 4,  rewards: { fuel: 25 } },
  { day: 5,  rewards: { item_rarity: "rare" } },
  { day: 6,  rewards: { nova_crystals: 3 } },
  { day: 7,  rewards: { stardust: 1500 } },
  { day: 8,  rewards: { stardust: 800 } },
  { day: 9,  rewards: { experience: 1000 } },
  { day: 10, rewards: { collectible: { type: "consumable", name: "Uncommon Strength Stim", rarity: "uncommon", consumable: { stat: "strength", mult: 0.05, duration_hours: 6, tier: "uncommon" }, flavor_text: "Boosts Strength by 5% for 6 hours (stacks duration up to 18h).", sell_value: 250 } } },
  { day: 11, rewards: { stardust: 1000 } },
  { day: 12, rewards: { fuel: 30 } },
  { day: 13, rewards: { nova_crystals: 4 } },
  { day: 14, rewards: { experience: 1200 } },
  { day: 15, rewards: { item_rarity: "rare" } },
  { day: 16, rewards: { stardust: 2000 } },
  { day: 17, rewards: { stardust: 1200 } },
  { day: 18, rewards: { collectible: { type: "consumable", name: "Uncommon Agility Stim", rarity: "uncommon", consumable: { stat: "agility", mult: 0.05, duration_hours: 6, tier: "uncommon" }, flavor_text: "Boosts Agility by 5% for 6 hours (stacks duration up to 18h).", sell_value: 250 } } },
  { day: 19, rewards: { experience: 1500 } },
  { day: 20, rewards: { nova_crystals: 8 } },
  { day: 21, rewards: { item_rarity: "rare", stardust: 1500 } },
  { day: 22, rewards: { experience: 2000 } },
  { day: 23, rewards: { collectible: { type: "consumable", name: "Rare Vitality Stim", rarity: "rare", consumable: { stat: "vitality", mult: 0.10, duration_hours: 12, tier: "rare" }, flavor_text: "Boosts Vitality by 10% for 12 hours (stacks duration up to 36h).", sell_value: 600 } } },
  { day: 24, rewards: { stardust: 2000 } },
  { day: 25, rewards: { item_rarity: "epic" } },
  { day: 26, rewards: { nova_crystals: 10 } },
  { day: 27, rewards: { experience: 2500 } },
  { day: 28, rewards: { stardust: 3000 } },
  { day: 29, rewards: { stardust: 3000, fuel: 40 } },
  { day: 30, rewards: { item_rarity: "legendary" } },
];

import { todayET } from "@/lib/gameTime";

// Re-exported for legacy callers; daily resets now roll over at midnight ET.
export function todayUTC() { return todayET(); }

export function canClaimToday(progress) {
  if (!progress) return true;
  return progress.last_claim_date !== todayET();
}

export async function getProgress(characterId) {
  const list = await api.entities.DailyLogin.filter({ character_id: characterId });
  return list[0] || null;
}

export async function claimDaily() {
  const res = await api.functions.invoke("ClaimDailyLogin", {});
  return res.data;
}

export function rewardIcon(rewards) {
  if (!rewards) return "🎁";
  if (rewards.collectible) {
    if (rewards.collectible.type === "consumable") return "🧪";
    return rewards.collectible.emoji || "📿";
  }
  if (rewards.item_rarity === "legendary") return "🏆";
  if (rewards.item_rarity === "epic") return "🛡️";
  if (rewards.item_rarity) return "📦";
  if (rewards.nova_crystals) return "💎";
  if (rewards.experience) return "📈";
  if (rewards.fuel) return "⚡";
  if (rewards.stardust) return "✦";
  return "🪙";
}

export function rewardLabel(rewards) {
  if (!rewards) return "Reward";
  if (rewards.collectible) return rewards.collectible.name;
  const parts = [];
  if (rewards.item_rarity) parts.push(`${rewards.item_rarity[0].toUpperCase()}${rewards.item_rarity.slice(1)} Crate`);
  if (rewards.experience) parts.push(`${rewards.experience}⭐XP`);
  if (rewards.stardust) parts.push(`${rewards.stardust}✦`);
  if (rewards.nova_crystals) parts.push(`${rewards.nova_crystals}💎`);
  if (rewards.fuel) parts.push(`${rewards.fuel}⚡`);
  return parts.join(" · ") || "Reward";
}