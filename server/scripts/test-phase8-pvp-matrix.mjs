/**
 * Phase 8 Arena combat evidence.
 *
 * Player-vs-player class results are separate from bot-integration evidence.
 * Bot scaling is never counted as class-balance evidence.
 * This suite does not rebalance classes.
 *
 * Run: npm run test:phase8-pvp-matrix
 */
import assert from "node:assert/strict";
import { SimulateCombat } from "../src/shared/combatService.js";
import { contextMultiplierFor } from "../../src/lib/combatMath.js";
import {
  startingAttributesForClass,
  FREE_ATTRS_PER_LEVEL_AFTER_1,
} from "../../src/lib/productionMath/index.js";
import { generateArenaBot } from "../../src/lib/arenaBotGenerator.js";
import { usesRampedDamageBase, getDamageBaseForCombatant } from "../../src/lib/statEngine.js";
import { T18_CLASS_NAMES } from "./t18FrozenCombat.mjs";

const CLASSES = Object.freeze([...T18_CLASS_NAMES]);
const ARCHETYPE = Object.freeze({
  Vanguard: "Might",
  "Astral Warden": "Might",
  "Shadow Operative": "Reflex",
  "Void Runner": "Reflex",
  Technomancer: "Tech",
  "Cosmic Engineer": "Tech",
});
const EVIDENCE_LEVELS = Object.freeze([1, 25, 100, 500, 1000, 2000]);
const PAIR_SEED_SALTS = Object.freeze(["seed-a", "seed-b", "seed-c"]);
const BOT_FIXED_STRENGTH = 0.85;

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function attrsFor(className, level) {
  const start = startingAttributesForClass(className);
  const extra = Math.max(0, level - 1) * FREE_ATTRS_PER_LEVEL_AFTER_1;
  const primary = ARCHETYPE[className] === "Might"
    ? "strength"
    : ARCHETYPE[className] === "Reflex"
      ? "agility"
      : "intellect";
  const stats = {
    strength: start[0],
    agility: start[1],
    intellect: start[2],
    vitality: start[3],
    luck: start[4],
  };
  stats[primary] += extra;
  return stats;
}

function playerCombatant(className, level, idSuffix = "a") {
  return {
    id: `pvp-${className}-${level}-${idSuffix}`,
    name: `${className} L${level} ${idSuffix}`,
    class: className,
    level,
    stats: attrsFor(className, level),
    race: "Human",
    isBot: false,
    arena_rating: 1000,
  };
}

function seedFor(...parts) {
  const s = parts.join("|");
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function runFight(player, opponent, seed, playerItems = [], opponentItems = []) {
  const result = SimulateCombat({
    player,
    opponent,
    playerItems,
    opponentItems,
    rng: mulberry32(seed),
    mode: "arena",
  });
  for (const v of [
    result.playerEnd?.hp,
    result.opponentEnd?.hp,
    result.playerMaxHp,
    result.opponentMaxHp,
  ]) {
    assert.equal(Number.isFinite(v), true);
    assert.equal(Number.isNaN(v), false);
  }
  assert.ok(result.winner === "player" || result.winner === "opponent");
  assert.ok(Array.isArray(result.events));
  assert.equal(contextMultiplierFor("arena", "player"), 1);
  assert.equal(contextMultiplierFor("arena", "opponent"), 1);
  return result;
}

function emptyRow() {
  return {
    mirrors: 0,
    mirrorWins: 0,
    cross: 0,
    crossWins: 0,
    asAttacker: 0,
    asAttackerWins: 0,
  };
}

let passed = 0;
let failed = 0;
const pvpSummary = Object.fromEntries(CLASSES.map((cls) => [cls, emptyRow()]));
const archetype = {
  Might: { fights: 0, wins: 0 },
  Reflex: { fights: 0, wins: 0 },
  Tech: { fights: 0, wins: 0 },
};

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.stack || err.message}`);
  }
}

function recordPvp(attackerClass, winner) {
  const row = pvpSummary[attackerClass];
  row.asAttacker += 1;
  if (winner === "player") row.asAttackerWins += 1;
  const arch = ARCHETYPE[attackerClass];
  archetype[arch].fights += 1;
  if (winner === "player") archetype[arch].wins += 1;
}

console.log("\nPhase 8 Arena PvP evidence\n");

test("certified Test 18 class list matches production Arena classes", () => {
  assert.deepEqual([...CLASSES], [...T18_CLASS_NAMES]);
});

test("Arena context multiplier is 1.0 for both sides", () => {
  assert.equal(contextMultiplierFor("arena", "player"), 1);
  assert.equal(contextMultiplierFor("arena", "opponent"), 1);
  assert.equal(contextMultiplierFor("arena", "enemy"), 1);
});

test("player-vs-player mirrors are finite and repeatable through L2000", () => {
  for (const cls of CLASSES) {
    for (const level of EVIDENCE_LEVELS) {
      for (const salt of PAIR_SEED_SALTS) {
        const seed = seedFor(cls, cls, level, salt, "mirror");
        const a = playerCombatant(cls, level, "atk");
        const b = playerCombatant(cls, level, "def");
        const first = runFight(a, b, seed);
        const second = runFight(a, b, seed);
        assert.equal(first.winner, second.winner);
        assert.equal(first.events.length, second.events.length);
        pvpSummary[cls].mirrors += 1;
        if (first.winner === "player") pvpSummary[cls].mirrorWins += 1;
        recordPvp(cls, first.winner);
      }
    }
  }
});

test("player-vs-player unordered pairs run both orientations and multiple seeds", () => {
  for (let i = 0; i < CLASSES.length; i += 1) {
    for (let j = i + 1; j < CLASSES.length; j += 1) {
      const aCls = CLASSES[i];
      const bCls = CLASSES[j];
      for (const level of EVIDENCE_LEVELS) {
        for (const salt of PAIR_SEED_SALTS) {
          const forwardSeed = seedFor(aCls, bCls, level, salt, "fwd");
          const reverseSeed = seedFor(bCls, aCls, level, salt, "rev");
          const forward = runFight(
            playerCombatant(aCls, level, "atk"),
            playerCombatant(bCls, level, "def"),
            forwardSeed,
          );
          const reverse = runFight(
            playerCombatant(bCls, level, "atk"),
            playerCombatant(aCls, level, "def"),
            reverseSeed,
          );
          pvpSummary[aCls].cross += 1;
          pvpSummary[bCls].cross += 1;
          if (forward.winner === "player") pvpSummary[aCls].crossWins += 1;
          if (reverse.winner === "player") pvpSummary[bCls].crossWins += 1;
          recordPvp(aCls, forward.winner);
          recordPvp(bCls, reverse.winner);
        }
      }
    }
  }
});

test("no-gear baseline is the only loadout; no invented item stats", () => {
  const seed = seedFor("Vanguard", "Technomancer", 100, "noloadout");
  const result = runFight(
    playerCombatant("Vanguard", 100, "atk"),
    playerCombatant("Technomancer", 100, "def"),
    seed,
    [],
    [],
  );
  assert.ok(result.events.length > 0);
});

test("class passives and Stim Injector remain active on the shared Arena path", () => {
  const result = SimulateCombat({
    player: playerCombatant("Void Runner", 25, "atk"),
    opponent: playerCombatant("Vanguard", 25, "def"),
    playerItems: [],
    opponentItems: [],
    rng: () => 0.9,
    mode: "arena",
  });
  const kinds = result.events.map((e) => e.kind || e.type || "");
  assert.ok(kinds.some((k) => String(k).includes("stim") || String(k).includes("dirty")));
});

test("bot snapshots use generateArenaBot and the shared Arena engine", () => {
  const rng = mulberry32(seedFor("bot", "construct", 10, "fixed"));
  const snap = generateArenaBot({
    playerLevel: 10,
    level: 10,
    className: "Technomancer",
    buildKey: "balanced",
    strengthMultiplier: BOT_FIXED_STRENGTH,
    rng,
  });
  assert.equal(snap.class, "Technomancer");
  assert.equal(snap.level, 10);
  assert.equal(snap.dungeonEnemy, false);
  assert.equal(snap.missionEnemy, false);
  assert.equal(snap.suppressClassPassive, false);
  assert.equal(snap.strengthMultiplier, BOT_FIXED_STRENGTH);

  const player = playerCombatant("Vanguard", 10, "atk");
  const botShaped = {
    id: "bot-technomancer-10",
    name: "Bot Technomancer",
    class: snap.class,
    level: snap.level,
    stats: snap.stats,
    race: "Human",
    isBot: true,
    arena_rating: 1000,
  };
  const playerShapedTwin = {
    ...botShaped,
    id: "player-shaped-technomancer-10",
    isBot: false,
  };
  assert.equal(usesRampedDamageBase(botShaped), true);
  assert.equal(usesRampedDamageBase(playerShapedTwin), false);
  assert.ok(getDamageBaseForCombatant(botShaped) < getDamageBaseForCombatant(playerShapedTwin));

  const seed = seedFor("Vanguard", "Technomancer", 10, "bot-path");
  const vsBot = runFight(player, botShaped, seed);
  const vsPlayer = runFight(player, playerShapedTwin, seed);
  assert.ok(vsBot.events.length > 0);
  assert.ok(vsPlayer.events.length > 0);
  console.log(
    "    bot scaling (not class-balance): isBot uses ramped damage base below L25; "
    + `EPA budget × ${BOT_FIXED_STRENGTH}; `
    + `bot fight winner=${vsBot.winner}, equal player-shaped winner=${vsPlayer.winner}`,
  );
});

console.log("\nPlayer-vs-player class evidence (no-gear, both orientations, 3 seeds, L1–L2000):\n");
for (const cls of CLASSES) {
  const row = pvpSummary[cls];
  console.log(
    `  ${cls} [${ARCHETYPE[cls]}] mirrors ${row.mirrorWins}/${row.mirrors}`
    + ` · cross ${row.crossWins}/${row.cross}`
    + ` · as attacker ${row.asAttackerWins}/${row.asAttacker}`,
  );
}
console.log("\nPlayer-vs-player by archetype (attacker wins / attacker fights):\n");
for (const name of ["Might", "Reflex", "Tech"]) {
  const row = archetype[name];
  console.log(`  ${name} ${row.wins}/${row.fights}`);
}

console.log("\nCertified Test 18: no Arena PvP class-vs-class win-rate table is retained.");
console.log("Class identities match T18_CLASS_NAMES. Combat uses the live Phase 3 engine.");
console.log("No win-rate threshold was invented and no class was rebalanced.\n");

console.log(`${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
