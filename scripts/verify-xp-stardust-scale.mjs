/**
 * Verify XP/Stardust 10× scale preserves reward/requirement and income/cost ratios.
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
  ARENA_REFRESH_COST,
  GUILD_CREATE_COST,
  GUILD_WAR_DECLARE_COST,
  CASINO_MIN_STARDUST_BET_FLOOR,
  CASINO_MAX_STARDUST_BET_CAP,
  SHIP_TYPES,
} from "../server/src/shared/economyFormulas.js";
import { computeItemVendorValue } from "../server/src/shared/itemGeneration.js";

if (XP_STARDUST_SCALE !== 10) throw new Error(`Expected XP_STARDUST_SCALE=10, got ${XP_STARDUST_SCALE}`);

function assertEq(label, got, expected) {
  if (got !== expected) throw new Error(`${label}: got ${got}, expected ${expected}`);
  console.log(`ok  ${label} = ${got}`);
}

assertEq("L1→2 XP", expForLevel(1), 100);
assertEq("L2→3 XP", expForLevel(2), 150);
assertEq("L3→4 XP", expForLevel(3), 250);
assertEq("L4→5 XP", expForLevel(4), 400);
assertEq("L5→6 XP", expForLevel(5), 300);

assertEq("L1 XP/fuel", getMissionXpPerFuel(1), 100);
assertEq("L10 XP/fuel", getMissionXpPerFuel(10), 160);
assertEq("L1 SD/fuel", getMissionStardustPerFuel(1), 40);
assertEq("L10 SD/fuel", getMissionStardustPerFuel(10), 80);
assertEq("L100 XP/fuel", getMissionXpPerFuel(100), 1300);
assertEq("L100 SD/fuel", getMissionStardustPerFuel(100), 2250);
assertEq("L100 XP-to-next", expForLevel(100), 25900);

assertEq("Attr cost #1", getAttributePointCost(1), 100);
assertEq("Attr cost #10", getAttributePointCost(10), 150);

const missionXpL10 = 5 * getMissionXpPerFuel(10);
const needL10 = expForLevel(10);
const ratio = missionXpL10 / needL10;
const oldRatio = (5 * 16) / 120;
if (Math.abs(ratio - oldRatio) > 1e-9) throw new Error(`XP ratio drift: ${ratio} vs ${oldRatio}`);
console.log(`ok  XP progression ratio L10 = ${ratio}`);

const pp = (10 * getMissionStardustPerFuel(10)) / getAttributePointCost(1);
const oldPp = (10 * 8) / 10;
if (Math.abs(pp - oldPp) > 1e-9) throw new Error(`SD purchasing power drift: ${pp} vs ${oldPp}`);
console.log(`ok  SD purchasing power L10 = ${pp}`);

assertEq("Arena XP L10", getArenaXpReward(10), Math.max(1, Math.round((160 * 5) / 7)));
assertEq("Arena SD L10", getArenaStardustReward(10), Math.max(1, Math.round((80 * 5) / 3)));
assertEq("Arena refresh", ARENA_REFRESH_COST, 500);
assertEq("Guild create", GUILD_CREATE_COST, 5000);
assertEq("Guild war declare", GUILD_WAR_DECLARE_COST, 5000);
assertEq("Casino floor", CASINO_MIN_STARDUST_BET_FLOOR, 1000);
assertEq("Casino cap", CASINO_MAX_STARDUST_BET_CAP, 2_500_000);
assertEq("Mining L5×2h", computeMiningReward(5, 2), 1200);
assertEq("Ship frigate cost", SHIP_TYPES.frigate.cost, 50000);

const vendor = computeItemVendorValue({
  type: "weapon",
  rarity: "common",
  stats: { strength: 10 },
});
// common factor 0.55 * weapon 1.4 * stats 10 * scale 10 = 77
assertEq("Vendor weapon common", vendor, 77);

console.log("\nAll ratio checks passed.");
