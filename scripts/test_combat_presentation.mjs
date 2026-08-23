/**
 * Presentation helpers unit checks (Restoration 29).
 * Run: node --import ./server/scripts/register-src-alias.mjs ./scripts/test_combat_presentation.mjs
 */
import assert from "node:assert/strict";
import {
  reduceCombatStatus,
  resolveCombatFloater,
  formatCombatLogLine,
  DAMAGE_TYPE_COLORS,
} from "../src/lib/combatPresentation.js";

const events = [
  { type: "passive", kind: "phantom_signal_armed", side: "player", primed: true },
  { type: "passive", kind: "dirty_trick_selected", side: "opponent", dirtyTrick: "flashbang", dirtyTricks: ["flashbang"] },
  { type: "passive", kind: "astral_barrier_created", side: "player", barrier: 40, barrierMax: 40 },
  { type: "miss", missKind: "phantom_signal", kind: "phantom_signal_miss", defender: "player", damage: 0 },
  { type: "barrier", kind: "barrier_absorbed", side: "player", absorbed: 10, barrierRemaining: 30 },
  { type: "attack", attacker: "opponent", defender: "player", damage: 12, crit: true, damageType: "MIGHT" },
  { type: "passive", kind: "overclock_stack_gained", side: "opponent", stacks: 2, before: 1 },
  { type: "passive", kind: "kinetic_tantrum_strong", side: "player", kineticTantrum: "strong" },
];

const s0 = reduceCombatStatus(events, 2);
assert.equal(s0.player.phantomPending, true);
assert.equal(s0.player.barrier, 40);
assert.equal(s0.opponent.dirtyTrick, "flashbang");

const s1 = reduceCombatStatus(events, 3);
assert.equal(s1.player.phantomPending, false);

const s2 = reduceCombatStatus(events, 4);
assert.equal(s2.player.barrier, 30);

const s3 = reduceCombatStatus(events, 7);
assert.equal(s3.opponent.overclockStacks, 2);
assert.equal(s3.player.kineticTantrum, "strong");

const forced = resolveCombatFloater(events[3]);
assert.equal(forced.kind, "forced_miss");
assert.match(forced.label, /FORCED MISS/);

const dodge = resolveCombatFloater({ type: "dodge", dodged: true });
assert.equal(dodge.kind, "dodge");

const trueHit = resolveCombatFloater({ damage: 9, damageType: "TRUE" });
assert.equal(trueHit.kind, "true");
assert.equal(trueHit.color, DAMAGE_TYPE_COLORS.TRUE);

assert.match(formatCombatLogLine(events[5], 5), /CRIT|−12|player/);

console.log("combat presentation helpers: OK");
