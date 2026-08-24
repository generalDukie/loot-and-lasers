/**
 * HISTORICAL / TEST-ONLY / INVALIDATED DIAGNOSTIC
 *
 * The Phase 4 "purchased-ish" outgoing gate is NOT a production balance
 * authority. It understated realistic Test 18 progression (wrong primary
 * mapping, almost no permanent purchases, thin Gear, no Stims, no
 * F2P/Light/Premium population) and reported ~46.9% wins with certified
 * outgoing ON. Exact retained Test 18 states later produced 100% wins.
 *
 * Official certification lives in test-phase4-mission-combat-activation.mjs.
 * This script is retained only as a record of the invalidated fixture.
 *
 *   node --import ./server/scripts/register-src-alias.mjs ./server/scripts/diagnostic-mission-outgoing-purchased-ish.mjs
 */
import {
  CLASS_ARCHETYPE,
  GEAR_SLOTS,
} from "../../src/lib/productionMath/constants.js";
import {
  freeLevelAttributes,
  startingAttributesForClass,
} from "../../src/lib/productionMath/attributes.js";
import { GenerateGearItem } from "../../src/lib/itemGeneration.js";
import { simulateBattle } from "../../src/lib/arenaEngine.js";
import { generateMissionEncounter } from "../../src/lib/missionCombat.js";
import { setApplyCertifiedMissionEnemyOutgoingInLiveCombat } from "../../src/lib/combatMath.js";

const LEVELS = [1, 10, 20, 25, 50, 75, 100, 150, 200];
const FIGHTS_PER = 3;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildPlayer(level, className, rng) {
  const start = startingAttributesForClass(className);
  const free = freeLevelAttributes(level, 0);
  const stats = {
    strength: start[0] + free[0] + Math.floor(level / 5),
    agility: start[1] + free[1],
    intellect: start[2] + free[2],
    vitality: start[3] + free[3] + Math.floor(level / 8),
    luck: start[4] + free[4],
  };
  const items = [...GEAR_SLOTS].map((slot) => GenerateGearItem({
    itemLevel: Math.max(1, level),
    itemType: slot,
    rarity: level < 20 ? "common" : level < 50 ? "uncommon" : "rare",
    rng,
    origin: "mission",
    className,
  }));
  return { name: className, level, class: className, stats, items };
}

function runMode(on) {
  setApplyCertifiedMissionEnemyOutgoingInLiveCombat(on);
  const rows = [];
  for (const L of LEVELS) {
    for (const cls of Object.keys(CLASS_ARCHETYPE)) {
      let wins = 0;
      for (let i = 0; i < FIGHTS_PER; i++) {
        const rng = mulberry32(L * 100 + cls.length * 10 + i + (on ? 99 : 0));
        const player = buildPlayer(L, cls, rng);
        const enemy = generateMissionEncounter(player, { character_level: L }, rng);
        const result = simulateBattle(player, enemy, player.items || [], [], {
          rng,
          mode: "mission",
        });
        if (result.winner === "player") wins += 1;
      }
      rows.push({ level: L, class: cls, winRate: wins / FIGHTS_PER });
    }
  }
  return rows.reduce((s, r) => s + r.winRate, 0) / rows.length;
}

const offWin = runMode(false);
const onWin = runMode(true);
setApplyCertifiedMissionEnemyOutgoingInLiveCombat(true);
console.log("INVALIDATED purchased-ish diagnostic — not production authority");
console.log(`OFF mean win rate=${offWin.toFixed(3)} ON mean win rate=${onWin.toFixed(3)}`);
console.log("Official gate: exact Test 18 states in test-phase4-mission-combat-activation.mjs");
