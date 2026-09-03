/**
 * Verify XP chart + Stardust economy anchors after balance update.
 * Uses server shared modules (no Vite @/ aliases).
 */
import {
  expForLevel,
  getMissionXpPerFuel,
  getMissionStardustPerFuel,
  XP_STARDUST_SCALE,
} from "../server/src/shared/rewards.js";
import {
  getAttributePointCost,
  getArenaXpReward,
  getArenaStardustReward,
  computeMiningReward,
  computeMissionXpFromFuel,
  MISSION_XP_REBALANCE,
  ARENA_REFRESH_COST,
  GUILD_CREATE_COST,
  GUILD_WAR_DECLARE_COST,
  CASINO_MIN_STARDUST_BET_FLOOR,
  CASINO_MAX_STARDUST_BET_CAP,
  SHIP_TYPES,
} from "../server/src/shared/economyFormulas.js";
import { missionXpReward, miningStardustResolved, MINUTES_PER_HOUR, arenaXpReward, arenaStardustReward } from "../src/lib/productionMath/index.js";
import { computeItemVendorValue } from "../server/src/shared/itemGeneration.js";

if (XP_STARDUST_SCALE !== 10) {
  throw new Error(
    `Expected leftover XP_STARDUST_SCALE=10 (legacy Stardust economy debt, not XP), got ${XP_STARDUST_SCALE}`,
  );
}

function assertEq(label, got, expected) {
  if (got !== expected) throw new Error(`${label}: got ${got}, expected ${expected}`);
  console.log(`ok  ${label} = ${got}`);
}

assertEq("L1→2 XP", expForLevel(1), 133);
if (!(expForLevel(501) > expForLevel(500))) throw new Error("L501 should exceed L500");

assertEq("L1 XP/fuel", getMissionXpPerFuel(1), 100);
assertEq("L10 XP/fuel", getMissionXpPerFuel(10), 160);
assertEq("L1 SD/fuel", getMissionStardustPerFuel(1), 50);
assertEq("L10 SD/fuel", getMissionStardustPerFuel(10), Math.round(50 + 1.009 * 9 ** 1.625 * (1 + (10 / 166.66) ** 3.055)));
assertEq("L100 XP/fuel", getMissionXpPerFuel(100), 1295);
assertEq("L100 SD/fuel", getMissionStardustPerFuel(100), Math.round(50 + 1.009 * 99 ** 1.625 * (1 + (100 / 166.66) ** 3.055)));
assertEq("MISSION_XP_REBALANCE", MISSION_XP_REBALANCE, 0.85);
assertEq("Mission XP 10 fuel L100 eff1", computeMissionXpFromFuel(10, 100, 1), missionXpReward({
  fuel: 10,
  snapshotLevel: 100,
  xpVariance: 1,
}));

assertEq("Certified attrcost #1", getAttributePointCost(6), 100);
assertEq("Live purchase #1", getAttributePointCost(1), 10);
assertEq("Live purchase #5", getAttributePointCost(5), 80);
assertEq("Live purchase #15 (= attrcost 10)", getAttributePointCost(15), 112);
assertEq("Live purchase #655 (= attrcost 650)", getAttributePointCost(655), 111517);

const sd10 = getMissionStardustPerFuel(10);
const sd50 = getMissionStardustPerFuel(50);
assertEq("Arena XP L10", getArenaXpReward(10), arenaXpReward(10));
assertEq("Arena SD L10", getArenaStardustReward(10), arenaStardustReward(10));
assertEq("Arena refresh", ARENA_REFRESH_COST, 500);
assertEq("Guild create", GUILD_CREATE_COST, 5000);
assertEq("Guild war declare", GUILD_WAR_DECLARE_COST, 5000);
assertEq("Casino floor", CASINO_MIN_STARDUST_BET_FLOOR, 1);
assertEq("Casino cap", CASINO_MAX_STARDUST_BET_CAP, 10_000_000 * XP_STARDUST_SCALE);
assertEq("Mining L50×1h", computeMiningReward(50, 1), miningStardustResolved({ snapshotLevel: 50, minutes: MINUTES_PER_HOUR }));
assertEq("Ship frigate cost", SHIP_TYPES.frigate.cost, 50000);

const vendor = computeItemVendorValue({
  type: "weapon",
  rarity: "rare",
  level_requirement: 10,
});
assertEq("Vendor weapon rare L10", vendor, Math.round(sd10 * 2 * 1.0 * 1.2));

console.log("\nAll checks passed.");
