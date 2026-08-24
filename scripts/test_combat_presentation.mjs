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
  skipsPlaybackBeat,
  logsSkippedPlaybackEvent,
  appliesSkippedPlaybackStatus,
  attachedOverclockEndIndex,
  followingTantrumConsumeEvent,
  showsSkippedPlaybackBanner,
} from "../src/lib/combatPresentation.js";
import { resolveAbilityBanner } from "../src/lib/classPassives.js";

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

assert.equal(skipsPlaybackBeat({ kind: "orbital_assistant_activated" }), true);
assert.equal(skipsPlaybackBeat({ kind: "defensive_protocol_consumed" }), true);
assert.equal(skipsPlaybackBeat({ kind: "acquire_target_consumed" }), true);
assert.equal(skipsPlaybackBeat({ kind: "fire_support" }), false);
assert.equal(skipsPlaybackBeat({ kind: "acquire_target_applied" }), false);
assert.equal(skipsPlaybackBeat({ kind: "defensive_protocol_applied" }), false);
assert.equal(skipsPlaybackBeat({ kind: "barrier_absorbed" }), true);
assert.equal(skipsPlaybackBeat({ kind: "barrier_broken" }), true);
assert.equal(skipsPlaybackBeat({ kind: "overclock_ready" }), true);
assert.equal(skipsPlaybackBeat({ kind: "overclock_stack_gained" }), false);
assert.equal(skipsPlaybackBeat({ kind: "attack", shieldHit: true }), false);
assert.equal(logsSkippedPlaybackEvent({ kind: "orbital_assistant_activated" }), false);
assert.equal(logsSkippedPlaybackEvent({ kind: "defensive_protocol_consumed" }), true);
assert.equal(logsSkippedPlaybackEvent({ kind: "acquire_target_consumed" }), true);
assert.equal(logsSkippedPlaybackEvent({ kind: "barrier_absorbed" }), true);
assert.equal(logsSkippedPlaybackEvent({ kind: "barrier_broken" }), true);
assert.equal(skipsPlaybackBeat({ kind: "dirty_trick_selected" }), true);
assert.equal(skipsPlaybackBeat({ kind: "stim_injector_charge" }), true);
assert.equal(skipsPlaybackBeat({ kind: "stim_injector_turn_order" }), true);
assert.equal(logsSkippedPlaybackEvent({ kind: "dirty_trick_selected" }), true);
assert.equal(logsSkippedPlaybackEvent({ kind: "stim_injector_charge" }), false);
assert.equal(logsSkippedPlaybackEvent({ kind: "stim_injector_turn_order" }), false);
assert.equal(appliesSkippedPlaybackStatus({ kind: "dirty_trick_selected" }), true);
assert.equal(appliesSkippedPlaybackStatus({ kind: "stim_injector_charge" }), true);
assert.equal(appliesSkippedPlaybackStatus({ kind: "stim_injector_turn_order" }), false);
assert.equal(appliesSkippedPlaybackStatus({ kind: "barrier_absorbed" }), false);
assert.equal(skipsPlaybackBeat({ kind: "phantom_signal_armed" }), true);
assert.equal(skipsPlaybackBeat({ kind: "phantom_signal_reprimed" }), true);
assert.equal(skipsPlaybackBeat({ kind: "phantom_signal_miss" }), false);
assert.equal(logsSkippedPlaybackEvent({ kind: "phantom_signal_armed" }), true);
assert.equal(logsSkippedPlaybackEvent({ kind: "phantom_signal_reprimed" }), true);
assert.equal(logsSkippedPlaybackEvent({ kind: "phantom_signal_miss" }), false);
assert.equal(appliesSkippedPlaybackStatus({ kind: "phantom_signal_armed" }), true);
assert.equal(appliesSkippedPlaybackStatus({ kind: "phantom_signal_reprimed" }), true);
assert.equal(appliesSkippedPlaybackStatus({ kind: "phantom_signal_miss" }), false);
assert.equal(skipsPlaybackBeat({ kind: "kinetic_tantrum_consumed" }), true);
assert.equal(skipsPlaybackBeat({ kind: "kinetic_tantrum_strong" }), false);
assert.equal(logsSkippedPlaybackEvent({ kind: "kinetic_tantrum_consumed" }), true);
assert.equal(appliesSkippedPlaybackStatus({ kind: "kinetic_tantrum_consumed" }), true);
assert.equal(showsSkippedPlaybackBanner({ kind: "dirty_trick_selected" }), true);
assert.equal(showsSkippedPlaybackBanner({ kind: "kinetic_tantrum_consumed" }), false);
assert.equal(
  followingTantrumConsumeEvent(
    [{ type: "attack" }, { type: "passive", kind: "kinetic_tantrum_consumed", consumed: "strong" }],
    0,
  )?.kind,
  "kinetic_tantrum_consumed",
);
assert.equal(
  followingTantrumConsumeEvent(
    [{ type: "attack" }, { type: "passive", kind: "overclock_stack_gained" }],
    0,
  ),
  null,
);

const fullAbsorb = resolveCombatFloater({
  type: "attack",
  shieldHit: true,
  damage: 0,
  barrierAbsorbed: 18,
});
assert.equal(fullAbsorb.kind, "barrier");
assert.match(fullAbsorb.label, /SHIELD −18/);

const overflow = resolveCombatFloater({
  type: "attack",
  shieldHit: true,
  damage: 7,
  barrierAbsorbed: 10,
  damageType: "MIGHT",
});
assert.match(overflow.label, /SHIELD −10/);
assert.match(overflow.label, /BREAK/);
assert.match(overflow.label, /−7/);

const engineer = { class: "Cosmic Engineer", className: "Cosmic Engineer" };
const voidRunner = { class: "Void Runner", className: "Void Runner" };
const shadowOperative = { class: "Shadow Operative", className: "Shadow Operative" };
const vanguard = { class: "Vanguard", className: "Vanguard" };
assert.ok(resolveAbilityBanner({ type: "passive", kind: "kinetic_tantrum_consumed", consumed: "strong", side: "player" }, vanguard, {}));
assert.ok(resolveAbilityBanner({ type: "passive", kind: "kinetic_tantrum_strong", side: "player" }, vanguard, {}));
assert.equal(resolveAbilityBanner({ type: "passive", kind: "phantom_signal_armed", side: "player" }, shadowOperative, {}), null);
assert.equal(resolveAbilityBanner({ type: "passive", kind: "phantom_signal_reprimed", side: "player" }, shadowOperative, {}), null);
assert.ok(resolveAbilityBanner({ type: "miss", missKind: "phantom_signal", kind: "phantom_signal_miss", defender: "player" }, shadowOperative, {}));
assert.ok(resolveAbilityBanner({ type: "passive", kind: "dirty_trick_selected", dirtyTrick: "flashbang", side: "player" }, voidRunner, {}));
assert.equal(resolveAbilityBanner({ type: "passive", kind: "stim_injector_charge", before: 2, after: 1, side: "player" }, voidRunner, {}), null);
assert.equal(resolveAbilityBanner({ type: "passive", kind: "stim_injector_turn_order", side: "player" }, voidRunner, {}), null);
assert.equal(resolveAbilityBanner({ type: "passive", kind: "orbital_assistant_activated", effect: "fire_support", side: "player" }, engineer, {}), null);
assert.equal(resolveAbilityBanner({ type: "passive", kind: "defensive_protocol_consumed", amount: 10, side: "player" }, engineer, {}), null);
assert.ok(resolveAbilityBanner({ type: "secondary", kind: "fire_support", passive: "Orbital Assistant", attacker: "player" }, engineer, {}));
assert.ok(resolveAbilityBanner({ type: "passive", kind: "acquire_target_applied", side: "player" }, engineer, {}));
assert.ok(resolveAbilityBanner({ type: "passive", kind: "defensive_protocol_applied", side: "player" }, engineer, {}));

assert.equal(
  attachedOverclockEndIndex(
    [{ type: "attack" }, { type: "passive", kind: "overclock_stack_gained" }],
    0,
  ),
  1,
);
assert.equal(
  attachedOverclockEndIndex(
    [
      { type: "attack" },
      { type: "passive", kind: "acquire_target_consumed" },
      { type: "passive", kind: "overclock_vented" },
    ],
    0,
  ),
  2,
);
assert.equal(
  attachedOverclockEndIndex(
    [{ type: "attack" }, { type: "passive", kind: "overclock_stacks_removed" }],
    0,
  ),
  0,
);
assert.equal(
  attachedOverclockEndIndex(
    [{ type: "attack" }, { type: "attack" }],
    0,
  ),
  0,
);

console.log("combat presentation helpers: OK");
