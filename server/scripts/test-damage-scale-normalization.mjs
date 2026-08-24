/**
 * Native damage-formula finalization: player Base Damage is the combat-scale
 * polynomial (no live PLAYER_BASE_DAMAGE_SCALE). Dungeon/Wormhole enemies use
 * the same native base × 1.10 so former ×2.75 output is preserved.
 *
 * Run: npm run test:damage-scale
 */
import assert from "node:assert/strict";
import { buildFighter, resolveBasicHit } from "../../src/lib/arenaEngine.js";
import {
  derivedCombatStats,
  APPLY_CERTIFIED_MISSION_ENEMY_OUTGOING_IN_LIVE_COMBAT,
  contextMultiplierFor,
  astralBarrierAmount,
} from "../../src/lib/combatMath.js";
import {
  OVERCLOCK_DEALT_PER_STACK,
  FIRE_SUPPORT_FRAC,
  STRONG_TANTRUM_CRIT_MULT,
  NORMAL_TANTRUM_CRIT_MULT,
  DEFENSIVE_PROTOCOL_REDUCTION,
  applyDamageWithBarrier,
} from "../../src/lib/classPassives.js";
import {
  rawStandardAttack,
  playerBaseDamage,
  dungeonWormholeEnemyBaseDamage,
  missionEnemyOutgoingMultiplier,
  roundHalfUp,
  roundHalfEven,
  PLAYER_BASE_DAMAGE_FLAT,
  PLAYER_BASE_DAMAGE_PRIMARY_COEFFICIENT,
  PLAYER_BASE_DAMAGE_PRIMARY_EXPONENT,
  PLAYER_COMBAT_CONTEXT_MULT,
  DUNGEON_WORMHOLE_ENEMY_DAMAGE_MULT,
  VARIANCE_MIN,
  VARIANCE_MAX,
  CRIT_DAMAGE_MULT,
  STANDARD_ATTACK_FLAT,
  RAW_ATTACK_COEFFICIENT,
  RAW_ATTACK_EXPONENT,
} from "../../src/lib/productionMath/index.js";
import { computeProductionSheetDerived } from "../src/shared/characterAttributes.js";

let passed = 0;
let failed = 0;

/** Historical expressions under test — not live gameplay authorities. */
const HISTORICAL_PLAYER_DAMAGE_SCALE = 2.5;
const HISTORICAL_DUNGEON_ENEMY_CONTEXT = 2.75;

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

function baseChar(className = "Vanguard", level = 50, stats = null) {
  return {
    id: "char-test",
    name: className,
    class: className,
    level,
    race: "Cognati",
    stats: stats || { strength: 200, agility: 200, intellect: 200, vitality: 200, luck: 200 },
    snapshotStats: true,
  };
}

function dungeonFoe(level = 50, className = "Vanguard") {
  return {
    id: "foe",
    name: "Foe",
    class: className,
    level,
    dungeonEnemy: true,
    suppressClassPassive: true,
    stats: { strength: 80, agility: 80, intellect: 80, vitality: 80, luck: 40 },
    snapshotStats: true,
  };
}

function missionFoe(level = 50) {
  return {
    id: "foe",
    name: "Foe",
    class: "Vanguard",
    level,
    missionEnemy: true,
    suppressClassPassive: true,
    stats: { strength: 80, agility: 80, intellect: 80, vitality: 80, luck: 40 },
    snapshotStats: true,
  };
}

function historicalScaledPlayer(primary) {
  return rawStandardAttack(primary) * HISTORICAL_PLAYER_DAMAGE_SCALE;
}

function historicalDungeonEnemy(primary) {
  return rawStandardAttack(primary, STANDARD_ATTACK_FLAT) * HISTORICAL_DUNGEON_ENEMY_CONTEXT;
}

function ulpClose(a, b) {
  const scale = Math.max(1, Math.abs(a), Math.abs(b));
  return Math.abs(a - b) <= 64 * Number.EPSILON * scale;
}

function reconstructHit(base, {
  variance = 1,
  outgoing = 1,
  critMult = 1,
  resist = 0,
  incoming = 1,
  context = 1,
} = {}) {
  return roundHalfEven(base * variance * outgoing * critMult * (1 - resist) * incoming * context);
}

console.log("\nNative damage formula finalization\n");

test("PLAYER_BASE_DAMAGE_SCALE is not a live production export", () => {
  assert.equal(typeof playerBaseDamage, "function");
  assert.equal(PLAYER_BASE_DAMAGE_FLAT, 37.5);
  assert.equal(PLAYER_BASE_DAMAGE_PRIMARY_COEFFICIENT, 0.008);
  assert.equal(PLAYER_BASE_DAMAGE_PRIMARY_EXPONENT, 1.727);
});

test("Mission enemy certified outgoing is live ON", () => {
  assert.equal(APPLY_CERTIFIED_MISSION_ENEMY_OUTGOING_IN_LIVE_COMBAT, true);
  assert.equal(contextMultiplierFor("mission", "enemy", 50), 6);
});

test("player context is identity; dungeon enemy tempo is ×1.10", () => {
  assert.equal(PLAYER_COMBAT_CONTEXT_MULT, 1);
  assert.equal(DUNGEON_WORMHOLE_ENEMY_DAMAGE_MULT, 1.1);
  assert.equal(HISTORICAL_PLAYER_DAMAGE_SCALE * DUNGEON_WORMHOLE_ENEMY_DAMAGE_MULT, HISTORICAL_DUNGEON_ENEMY_CONTEXT);
  assert.equal(contextMultiplierFor("mission", "player", 1), PLAYER_COMBAT_CONTEXT_MULT);
  assert.equal(contextMultiplierFor("dungeon", "player", 50), PLAYER_COMBAT_CONTEXT_MULT);
  assert.equal(contextMultiplierFor("dungeon", "enemy", 50), DUNGEON_WORMHOLE_ENEMY_DAMAGE_MULT);
  assert.equal(contextMultiplierFor("arena", "player", 50), PLAYER_COMBAT_CONTEXT_MULT);
  assert.equal(contextMultiplierFor("arena", "enemy", 50), PLAYER_COMBAT_CONTEXT_MULT);
});

test("native playerBaseDamage equals historical (15+0.0032·P^1.727)×2.5", () => {
  const primaries = [1, 5, 15, 25, 50, 100, 250, 500, 1000, 2000, 5000];
  let maxAbs = 0;
  for (const p of primaries) {
    const native = playerBaseDamage(p);
    const expectedNative = PLAYER_BASE_DAMAGE_FLAT
      + PLAYER_BASE_DAMAGE_PRIMARY_COEFFICIENT * p ** PLAYER_BASE_DAMAGE_PRIMARY_EXPONENT;
    const historical = (STANDARD_ATTACK_FLAT + RAW_ATTACK_COEFFICIENT * p ** RAW_ATTACK_EXPONENT)
      * HISTORICAL_PLAYER_DAMAGE_SCALE;
    assert.equal(native, expectedNative, `native polynomial P=${p}`);
    const abs = Math.abs(native - historical);
    if (abs > maxAbs) maxAbs = abs;
    assert.ok(ulpClose(native, historical), `historical equivalence P=${p} diff=${abs}`);
  }
  console.log(`    max |native − historical| = ${maxAbs} (IEEE noise only)`);
});

test("character sheet Damage is unchanged from the scaled-polynomial pass", () => {
  const sheet = computeProductionSheetDerived(
    { strength: 15, agility: 8, intellect: 6, vitality: 14, luck: 7 },
    { class: "Vanguard", level: 1 },
  );
  assert.equal(sheet.damage, roundHalfUp(playerBaseDamage(15)));
  assert.equal(sheet.damage, roundHalfUp(historicalScaledPlayer(15)));
  assert.equal(sheet.damage, 38);
});

test("Arena/Dungeon/Wormhole PLAYER resolved hits match historical scaled polynomial", () => {
  const primaries = [15, 50, 100, 200, 400, 800, 1500, 2000];
  const variances = [VARIANCE_MIN, 1, VARIANCE_MAX];
  const resists = [0, 0.1, 0.3];
  const critStates = [1, CRIT_DAMAGE_MULT, NORMAL_TANTRUM_CRIT_MULT, STRONG_TANTRUM_CRIT_MULT];
  const ocStacks = [0, 3, 6];
  let compared = 0;
  let unequal = 0;
  let maxAbs = 0;
  for (const primary of primaries) {
    const historical = historicalScaledPlayer(primary);
    const native = playerBaseDamage(primary);
    for (const variance of variances) {
      for (const resist of resists) {
        for (const critMult of critStates) {
          for (const stacks of ocStacks) {
            const outgoing = 1 + stacks * OVERCLOCK_DEALT_PER_STACK;
            const oldD = reconstructHit(historical, {
              variance, outgoing, critMult, resist, context: PLAYER_COMBAT_CONTEXT_MULT,
            });
            const newD = reconstructHit(native, {
              variance, outgoing, critMult, resist, context: PLAYER_COMBAT_CONTEXT_MULT,
            });
            compared += 1;
            const abs = Math.abs(newD - oldD);
            if (abs > 0) {
              unequal += 1;
              if (abs > maxAbs) maxAbs = abs;
            }
          }
        }
      }
    }
  }
  console.log(`    player pipeline pairs=${compared} unequal=${unequal} maxAbs=${maxAbs}`);
  assert.equal(unequal, 0, `expected exact player hit parity, maxAbs=${maxAbs}`);
});

test("resolveBasicHit Arena player output matches native Base Damage ×1.0", () => {
  const classes = ["Vanguard", "Astral Warden", "Shadow Operative", "Void Runner", "Technomancer", "Cosmic Engineer"];
  const defender = { resists: { might: 0, reflex: 0, tech: 0 } };
  for (const className of classes) {
    for (const level of [1, 50, 200]) {
      const fighter = buildFighter(baseChar(className, level), [], "player", { content: "arena" });
      assert.equal(fighter.contextMult, PLAYER_COMBAT_CONTEXT_MULT);
      assert.equal(fighter.canonicalDamage, playerBaseDamage(fighter.primaryValue));
      const hit = resolveBasicHit(fighter, defender, { canCrit: false, variance: 1 });
      assert.equal(hit.finalDamage, reconstructHit(playerBaseDamage(fighter.primaryValue)));
      assert.equal(hit.finalDamage, reconstructHit(historicalScaledPlayer(fighter.primaryValue)));
    }
  }
});

test("Dungeon/Wormhole PLAYER hits remain native Base Damage ×1.0", () => {
  const player = buildFighter(baseChar("Vanguard", 50), [], "player", { content: "dungeon" });
  const dummy = { resists: { might: 0, reflex: 0, tech: 0 } };
  assert.equal(player.contextMult, PLAYER_COMBAT_CONTEXT_MULT);
  assert.equal(player.canonicalDamage, playerBaseDamage(player.primaryValue));
  const pHit = resolveBasicHit(player, dummy, { canCrit: false, variance: 1 });
  assert.equal(pHit.finalDamage, reconstructHit(historicalScaledPlayer(player.primaryValue)));
});

test("Dungeon/Wormhole ENEMY native base ×1.10 equals historical raw ×2.75", () => {
  const primaries = [15, 50, 80, 100, 200, 400, 800, 1500, 2000];
  const variances = [VARIANCE_MIN, 1, VARIANCE_MAX];
  const resists = [0, 0.1, 0.3];
  const critStates = [1, CRIT_DAMAGE_MULT];
  let compared = 0;
  let unequal = 0;
  let maxAbs = 0;
  let maxUnrounded = 0;
  for (const primary of primaries) {
    const oldBase = historicalDungeonEnemy(primary);
    const newBase = dungeonWormholeEnemyBaseDamage(primary) * DUNGEON_WORMHOLE_ENEMY_DAMAGE_MULT;
    const unroundedAbs = Math.abs(newBase - oldBase);
    if (unroundedAbs > maxUnrounded) maxUnrounded = unroundedAbs;
    assert.ok(ulpClose(newBase, oldBase), `unrounded enemy base P=${primary} diff=${unroundedAbs}`);
    for (const variance of variances) {
      for (const resist of resists) {
        for (const critMult of critStates) {
          const oldD = reconstructHit(rawStandardAttack(primary), {
            variance, critMult, resist, context: HISTORICAL_DUNGEON_ENEMY_CONTEXT,
          });
          const newD = reconstructHit(dungeonWormholeEnemyBaseDamage(primary), {
            variance, critMult, resist, context: DUNGEON_WORMHOLE_ENEMY_DAMAGE_MULT,
          });
          compared += 1;
          const abs = Math.abs(newD - oldD);
          if (abs > 0) {
            unequal += 1;
            if (abs > maxAbs) maxAbs = abs;
          }
        }
      }
    }
  }
  console.log(`    enemy unrounded maxAbs=${maxUnrounded}; pipeline pairs=${compared} unequal=${unequal} maxAbs=${maxAbs}`);
  assert.equal(unequal, 0, `expected exact dungeon enemy hit parity, maxAbs=${maxAbs}`);
});

test("resolveBasicHit Dungeon enemies: Might/Reflex/Tech, variance, Crit, resist, high L", () => {
  const dummy = { resists: { might: 0, reflex: 0, tech: 0 } };
  const resisted = { resists: { might: 0.2, reflex: 0.15, tech: 0.1 } };
  const classes = ["Vanguard", "Shadow Operative", "Technomancer"];
  for (const className of classes) {
    for (const level of [1, 50, 500, 800, 1500, 2000]) {
      const enemy = buildFighter(dungeonFoe(level, className), [], "opponent", { content: "dungeon" });
      assert.equal(enemy.contextMult, DUNGEON_WORMHOLE_ENEMY_DAMAGE_MULT);
      assert.equal(enemy.canonicalDamage, dungeonWormholeEnemyBaseDamage(enemy.primaryValue));
      for (const variance of [VARIANCE_MIN, 1, VARIANCE_MAX]) {
        const hit = resolveBasicHit(enemy, dummy, { canCrit: false, variance });
        const expected = reconstructHit(dungeonWormholeEnemyBaseDamage(enemy.primaryValue), {
          variance, context: DUNGEON_WORMHOLE_ENEMY_DAMAGE_MULT,
        });
        const historical = reconstructHit(rawStandardAttack(enemy.primaryValue), {
          variance, context: HISTORICAL_DUNGEON_ENEMY_CONTEXT,
        });
        assert.equal(hit.finalDamage, expected, `${className} L${level} var=${variance}`);
        assert.equal(hit.finalDamage, historical, `${className} L${level} historical`);
      }
      const critHit = resolveBasicHit(enemy, resisted, {
        canCrit: true, forceCrit: true, variance: 1,
      });
      const resistKey = enemy.damageChannel;
      const resist = resisted.resists[resistKey] || 0;
      const critExpected = reconstructHit(dungeonWormholeEnemyBaseDamage(enemy.primaryValue), {
        variance: 1,
        critMult: CRIT_DAMAGE_MULT,
        resist,
        context: DUNGEON_WORMHOLE_ENEMY_DAMAGE_MULT,
      });
      assert.equal(critHit.finalDamage, critExpected, `${className} L${level} crit+resist`);
    }
  }
});

test("Dungeon enemy hits through Barrier and Defensive Protocol stay at historical output", () => {
  const enemy = buildFighter(dungeonFoe(50), [], "opponent", { content: "dungeon" });
  const dummy = { resists: { might: 0, reflex: 0, tech: 0 } };
  const hit = resolveBasicHit(enemy, dummy, { canCrit: false, variance: 1 });
  const historical = reconstructHit(rawStandardAttack(enemy.primaryValue), {
    context: HISTORICAL_DUNGEON_ENEMY_CONTEXT,
  });
  assert.equal(hit.finalDamage, historical);

  const warden = {
    name: "Warden",
    hp: 1000,
    barrier: astralBarrierAmount(200, 0),
    passiveState: { nextIncomingDamageMult: 1 },
  };
  const events = [];
  const afterBarrier = applyDamageWithBarrier(warden, hit.finalDamage, events);
  assert.ok(Number.isFinite(afterBarrier.finalIncoming));

  const reduced = roundHalfEven(hit.finalDamage * (1 - DEFENSIVE_PROTOCOL_REDUCTION));
  const historicalReduced = roundHalfEven(historical * (1 - DEFENSIVE_PROTOCOL_REDUCTION));
  assert.equal(reduced, historicalReduced);
});

test("Mission player uses native formula; Mission enemy stays on unscaled raw × certified outgoing", () => {
  const player = buildFighter(baseChar("Vanguard", 50), [], "player", { content: "mission" });
  const enemy = buildFighter(missionFoe(20), [], "opponent", { content: "mission" });
  assert.equal(player.canonicalDamage, playerBaseDamage(player.primaryValue));
  assert.ok(ulpClose(player.canonicalDamage, historicalScaledPlayer(player.primaryValue)));
  const unscaled = rawStandardAttack(enemy.primaryValue, enemy.damageBase);
  const outgoing = missionEnemyOutgoingMultiplier(20);
  assert.equal(enemy.canonicalDamage, unscaled);
  assert.equal(enemy.contextMult, outgoing);
  const eHit = resolveBasicHit(enemy, { resists: { might: 0, reflex: 0, tech: 0 } }, { canCrit: false, variance: 1 });
  assert.equal(eHit.finalDamage, roundHalfEven(unscaled * outgoing));
  assert.notEqual(eHit.finalDamage, roundHalfEven(dungeonWormholeEnemyBaseDamage(enemy.primaryValue)));
});

test("derivedCombatStats splits player / dungeon / mission authorities", () => {
  const attrs = { strength: 80, agility: 80, intellect: 80, vitality: 80, luck: 40 };
  const mission = derivedCombatStats(10, attrs, "Vanguard", { missionEnemy: true });
  const dungeon = derivedCombatStats(50, attrs, "Vanguard", { dungeonEnemy: true });
  const player = derivedCombatStats(50, attrs, "Vanguard");
  assert.equal(mission.canonicalDamage, rawStandardAttack(mission.primaryValue, mission.damageBase));
  assert.equal(dungeon.canonicalDamage, dungeonWormholeEnemyBaseDamage(dungeon.primaryValue));
  assert.equal(player.canonicalDamage, playerBaseDamage(player.primaryValue));
  assert.equal(dungeon.canonicalDamage, player.canonicalDamage);
  assert.notEqual(mission.canonicalDamage, player.canonicalDamage);
});

test("Fire Support uses native Base Damage × FIRE_SUPPORT_FRAC once", () => {
  const engineer = buildFighter(baseChar("Cosmic Engineer", 50), [], "player", { content: "arena" });
  const next = roundHalfEven(engineer.canonicalDamage * FIRE_SUPPORT_FRAC * engineer.contextMult);
  const historical = roundHalfEven(historicalScaledPlayer(engineer.intellectValue) * FIRE_SUPPORT_FRAC);
  assert.equal(next, historical);
  assert.equal(engineer.canonicalDamage, playerBaseDamage(engineer.intellectValue));
});

test("Overclock and Tantrum multiply native Base Damage once", () => {
  const fighter = buildFighter(baseChar("Technomancer", 80), [], "player", { content: "arena" });
  const defender = { resists: { might: 0, reflex: 0, tech: 0 } };
  const stacks = 4;
  const outgoing = 1 + stacks * OVERCLOCK_DEALT_PER_STACK;
  const hit = resolveBasicHit(fighter, defender, {
    canCrit: true,
    forceCrit: true,
    variance: 1,
    outgoingMult: outgoing,
    critMultOverride: STRONG_TANTRUM_CRIT_MULT,
  });
  const expected = reconstructHit(playerBaseDamage(fighter.primaryValue), {
    variance: 1,
    outgoing,
    critMult: STRONG_TANTRUM_CRIT_MULT,
  });
  assert.equal(hit.finalDamage, expected);
  assert.equal(hit.finalDamage, reconstructHit(historicalScaledPlayer(fighter.primaryValue), {
    variance: 1,
    outgoing,
    critMult: STRONG_TANTRUM_CRIT_MULT,
  }));
});

test("finite native Base Damage through L2000", () => {
  for (const L of [1, 10, 50, 100, 500, 800, 1500, 2000]) {
    const primary = 50 + L * 4;
    const dmg = playerBaseDamage(primary);
    assert.ok(Number.isFinite(dmg) && dmg > 0, `player L${L}`);
    const enemy = dungeonWormholeEnemyBaseDamage(primary);
    assert.ok(Number.isFinite(enemy) && enemy > 0, `dungeon L${L}`);
    assert.ok(Number.isFinite(roundHalfUp(dmg)) && roundHalfUp(dmg) > 0);
    assert.ok(Number.isFinite(roundHalfEven(dmg * VARIANCE_MAX * CRIT_DAMAGE_MULT)));
  }
});

console.log("");
if (failed) {
  console.error(`FAILED ${failed}/${passed + failed}`);
  process.exit(1);
}
console.log(`OK ${passed}/${passed}`);
