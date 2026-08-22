/**
 * Generate frozen Phase 0 formula fixtures.
 * Run: node --import ./server/scripts/register-src-alias.mjs server/scripts/generate-production-math-fixtures.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import * as M from "@/lib/productionMath";

const STRESS = M.STRESS_LEVELS;

function pctErr(pred, truth) {
  return (100 * Math.abs(pred - truth)) / Math.abs(truth);
}

const epaErrors = M.EPA_OFFICIAL_ANCHORS.map(([L, y]) => ({
  level: L,
  certified: y,
  production: M.expectedPlayerAttributes(L),
  pctError: pctErr(M.expectedPlayerAttributes(L), y),
}));

const fixtures = {
  moduleStatus: M.MODULE_STATUS,
  xpUnitPolicy: "identity-1:1",
  productionXpStorageScale: M.PRODUCTION_XP_STORAGE_SCALE,
  generatedAt: "Phase 0",
  xpToNext: Object.fromEntries(STRESS.map((L) => [L, M.xpToNext(L)])),
  missionXpPerFuel: Object.fromEntries(STRESS.map((L) => [L, M.missionXpPerFuel(L)])),
  stardustPerFuel: Object.fromEntries(STRESS.map((L) => [L, M.stardustPerFuel(L)])),
  averageMissionFuel: Object.fromEntries(STRESS.map((L) => [L, M.averageMissionFuel(L)])),
  gearBaseStatBudget: Object.fromEntries(STRESS.map((L) => [L, M.gearBaseStatBudget(L)])),
  attributePurchaseCost: Object.fromEntries(
    [1, 2, 10, 50, 100, 650, 1000, 2500].map((n) => [n, M.attributePurchaseCost(n)]),
  ),
  epa: Object.fromEntries(STRESS.map((L) => [L, M.expectedPlayerAttributes(L)])),
  epaAnchorErrors: epaErrors,
  arenaXp: Object.fromEntries(STRESS.map((L) => [L, M.arenaXpReward(L)])),
  arenaStardust: Object.fromEntries(STRESS.map((L) => [L, M.arenaStardustReward(L)])),
  missionOutgoing: Object.fromEntries(STRESS.map((L) => [L, M.missionEnemyOutgoingMultiplier(L)])),
  reflexConversion: Object.fromEntries(STRESS.map((L) => [L, M.reflexAgiConversion(L)])),
  missionXpFixtures: {
    win090: M.missionXpReward({ fuel: 12.5, snapshotLevel: 50, xpVariance: 0.9, defeated: false }),
    win100: M.missionXpReward({ fuel: 12.5, snapshotLevel: 50, xpVariance: 1, defeated: false }),
    win110: M.missionXpReward({ fuel: 12.5, snapshotLevel: 50, xpVariance: 1.1, defeated: false }),
    defeat100: M.missionXpReward({ fuel: 12.5, snapshotLevel: 50, xpVariance: 1, defeated: true }),
  },
  missionStardustFixtures: {
    win090: M.missionStardustReward({ fuel: 12.5, snapshotLevel: 50, stardustVariance: 0.9, defeated: false }),
    win100: M.missionStardustReward({ fuel: 12.5, snapshotLevel: 50, stardustVariance: 1, defeated: false }),
    win110: M.missionStardustReward({ fuel: 12.5, snapshotLevel: 50, stardustVariance: 1.1, defeated: false }),
    defeat100: M.missionStardustReward({ fuel: 12.5, snapshotLevel: 50, stardustVariance: 1, defeated: true }),
  },
  marketPriceFixtures: {
    v080: M.blackMarketPrice(50, "weapon", "rare", 0.8),
    v100: M.blackMarketPrice(50, "weapon", "rare", 1),
    v120: M.blackMarketPrice(50, "weapon", "rare", 1.2),
  },
  dungeonDru: M.DUNGEON_DRU,
  dungeonXpD1E0: M.dungeonEncounterXp(0, 0),
  wormhole: {
    level0: M.wormholeEnemyLevel(0),
    level100: M.wormholeEnemyLevel(100),
    bandDru1: M.wormholeBandDru(1),
    xp0: M.wormholeEncounterXp(0),
    xpAtL800ish: M.wormholeEncounterXp(299),
    xpAtL1000ish: M.wormholeEncounterXp(399),
    xpAtL2500ish: M.wormholeEncounterXp(1149),
  },
  discrete: {
    missionRarity: M.MISSION_GEAR_RARITY_WEIGHTS,
    dungeonRegular: M.DUNGEON_REGULAR_RARITY_WEIGHTS,
    dungeonBoss: M.DUNGEON_BOSS_RARITY_WEIGHTS,
    marketRarity: M.MARKET_RARITY_WEIGHTS,
    novaEpic: M.NOVA_SURCHARGE_TABLE.epic,
    novaLegendary: M.NOVA_SURCHARGE_TABLE.legendary,
  },
  quantization: {
    fuel: [0, 0.12, 0.13, 1, 1.125, 1.13].map((x) => [x, M.quantizeFuel(x)]),
    nova: [0, 0.24, 0.25, 1, 1.24, 1.25].map((x) => [x, M.quantizeNova(x)]),
  },
};

const json = `${JSON.stringify(fixtures, null, 2)}\n`;
fixtures.checksumSha256 = createHash("sha256").update(json).digest("hex");
const withChecksum = `${JSON.stringify(fixtures, null, 2)}\n`;

const out = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../src/lib/productionMath/fixtures/production-math-fixtures.json",
);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, withChecksum);
console.log("wrote", out);
console.log("epa max% ", Math.max(...epaErrors.map((e) => e.pctError)));
console.log("checksum", fixtures.checksumSha256);
