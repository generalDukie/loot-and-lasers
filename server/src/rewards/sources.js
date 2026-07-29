/**
 * Registered reward sources — unregistered strings fail closed.
 */

export const RewardSources = Object.freeze({
  MISSION_COMPLETION: "mission_completion",
  DAILY_LOGIN: "daily_login",
  ACHIEVEMENT: "achievement",
  MAIL_ATTACHMENT: "mail_attachment",
  PROMOTION: "promotion",
  SHOP_PURCHASE: "shop_purchase",
  ARENA_BATTLE: "arena_battle",
  DUNGEON_BATTLE: "dungeon_battle",
  CRAFTING_COMPLETION: "crafting_completion",
  WEEKLY_QUEST: "weekly_quest",
  ADMINISTRATOR_GRANT: "administrator_grant",
  COMPENSATION: "compensation",
  GUILD_REWARD: "guild_reward",
  CASINO: "casino",
  MINING: "mining",
  CHARACTER_SLOT: "character_slot",
  RENAME: "rename",
});

const REGISTERED = new Set(Object.values(RewardSources));

export function isValidRewardSource(source) {
  return REGISTERED.has(source);
}

export function assertRewardSource(source) {
  if (!isValidRewardSource(source)) {
    const err = new Error(`Invalid reward source: ${source}`);
    err.code = "INVALID_REWARD_SOURCE";
    throw err;
  }
  return source;
}

/** Client request fields that must never authoritatively grant value. */
export const FORBIDDEN_CLIENT_REWARD_FIELDS = Object.freeze([
  "credits",
  "stardust",
  "nova_crystals",
  "experience",
  "xp",
  "items",
  "item_id",
  "itemId",
  "rarity",
  "loot_rarity",
  "dropSucceeded",
  "rewardAmount",
  "rewards",
  "payout_mult",
  "reward_stardust",
  "reward_definition_id",
  "rewardDefinitionVersion",
  "seed",
  "randomSeed",
  "level",
  "new_level",
]);

/**
 * Detect forbidden reward-authoritative fields in a client body.
 * Returns list of field names found (does not mutate).
 */
export function detectSuspiciousRewardFields(body) {
  if (!body || typeof body !== "object") return [];
  const found = [];
  for (const key of FORBIDDEN_CLIENT_REWARD_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, key) && body[key] != null) {
      found.push(key);
    }
  }
  return found;
}
