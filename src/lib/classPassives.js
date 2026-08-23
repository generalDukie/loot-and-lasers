/**
 * Class passive registry + combat-state helpers.
 * Production mechanics (Phase 3 / Test 18): Kinetic Tantrum, Astral Barrier,
 * Phantom Signal, Dirty Tricks, Overclock, Orbital Assistant.
 *
 * Hooks are invoked by arenaEngine; damage primitives stay in combatMath/productionMath.
 */
import {
  ASTRAL_BARRIER_MAX_HP_FRAC,
  astralBarrierAmount,
  CRIT_DAMAGE_MULT,
  playerBaseDamage,
  rollUniversalVariance,
  roundCombatDamage,
} from "@/lib/combatMath";

export const PASSIVE_BY_CLASS = Object.freeze({
  Vanguard: "Kinetic Tantrum",
  "Astral Warden": "Astral Barrier",
  "Shadow Operative": "Phantom Signal",
  "Void Runner": "Dirty Tricks",
  Technomancer: "Overclock",
  "Cosmic Engineer": "Orbital Assistant",
});

/** Distinct combat UI color per class (ability callouts). */
export const CLASS_ABILITY_COLORS = Object.freeze({
  Vanguard: "#F97316",
  "Astral Warden": "#C084FC",
  "Shadow Operative": "#94A3B8",
  "Void Runner": "#34D399",
  Technomancer: "#38BDF8",
  "Cosmic Engineer": "#FBBF24",
});

export const DIRTY_TRICKS = Object.freeze(["flashbang", "targeting_beacon", "stim_injector"]);
export const ORBITAL_EFFECTS = Object.freeze(["fire_support", "defensive_protocol", "acquire_target"]);

const DIRTY_TRICK_LABELS = Object.freeze({
  flashbang: "Flashbang",
  targeting_beacon: "Targeting Beacon",
  stim_injector: "Stim Injector",
});

const ORBITAL_LABELS = Object.freeze({
  fire_support: "Fire Support",
  defensive_protocol: "Defensive Protocol",
  acquire_target: "Acquire Target",
});

export const OVERCLOCK_DEALT_PER_STACK = 0.125;
export const OVERCLOCK_TAKEN_PER_STACK = 0.05;
export const OVERCLOCK_STACK_CAP = 6;
export const OVERCLOCK_VENT_STACKS = 2;
export const OVERCLOCK_CRIT_STACK_LOSS = 2;
export const OVERCLOCK_STACKS_PER_ATTACK = 1;
export const ASTRAL_BARRIER_CHANCE = 0.1;
export { ASTRAL_BARRIER_MAX_HP_FRAC };
export const PHANTOM_REPRIME_OWN_TURNS = 10;
export const PHANTOM_SIGNAL_STARTS_ARMED = true;
export const DIRTY_TRICK_FLAT_BONUS = 0.075;
export const DIRTY_TRICK_TURN_TWO = 14;
export const DIRTY_TRICK_TURN_THREE = 28;
export const STIM_INJECTOR_OPENING_ATTACK_TURNS = 2;
export const FIRE_SUPPORT_FRAC = 0.6;
export const DEFENSIVE_PROTOCOL_REDUCTION = 0.25;
export const ACQUIRE_TARGET_CRIT_BONUS = 0.4;
export const STRONG_TANTRUM_CRIT_MULT = 2.0;
export const NORMAL_TANTRUM_CRIT_MULT = 1.5;
export const ORBITAL_EARLY_TURN_CAP = 10;
export const ORBITAL_EARLY_INTERVAL = 2;
export const ORBITAL_LATE_START_TURN = 13;
export const ORBITAL_LATE_INTERVAL = 3;
export const ORBITAL_PROTOCOL_COUNT = ORBITAL_EFFECTS.length;

/** Historical alias — Phantom is a pending flag, not a charge count. */
export const PHANTOM_SIGNAL_CHARGES = 1;

/** Passive event kinds that should flash on the combat screen. */
const BANNER_KINDS = new Set([
  "dirty_trick_selected",
  "orbital_assistant_activated",
  "fire_support",
  "fire_support_dodged",
  "kinetic_tantrum_normal",
  "kinetic_tantrum_strong",
  "astral_barrier_created",
  "astral_barrier_restored",
  "phantom_signal_armed",
  "phantom_signal_reprimed",
  "phantom_signal_miss",
  "overclock_stack_gained",
  "overclock_stacks_removed",
  "overclock_vented",
  "defensive_protocol_applied",
  "defensive_protocol_consumed",
  "acquire_target_applied",
  "acquire_target_consumed",
]);

function titleCaseKey(key) {
  if (!key) return null;
  return String(key).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function wholeStackCount(n) {
  return String(Math.trunc(Number(n) || 0));
}

function pickIndex(rng, count) {
  if (count <= 0) return 0;
  const u = typeof rng === "function" ? rng() : 0;
  return Math.min(count - 1, Math.max(0, Math.floor(u * count)));
}

/**
 * Build a combat-UI banner payload from a battle event.
 * Returns null when the event should not announce.
 */
export function resolveAbilityBanner(ev, player, opponent) {
  if (!ev) return null;

  if ((ev.type === "ability" || ev.type === "drone") && ev.ability) {
    const side = ev.attacker === "opponent" ? "opponent" : "player";
    const fighter = side === "player" ? player : opponent;
    const className = fighter?.class || fighter?.className || null;
    return {
      name: ev.ability,
      detail: null,
      className,
      side,
      color: CLASS_ABILITY_COLORS[className] || (side === "player" ? "#22D3EE" : "#FB7185"),
    };
  }

  const kind = ev.kind || ev.missKind || ev.secondaryKind;
  const isPassiveish =
    ev.type === "passive" ||
    (ev.type === "miss" && ev.missKind === "phantom_signal") ||
    (ev.type === "secondary" && ev.passive) ||
    (ev.type === "dodge" && ev.kind === "fire_support_dodged");
  if (!isPassiveish || !BANNER_KINDS.has(kind)) return null;

  let resolvedSide = "player";
  if (ev.side === "player" || ev.side === "opponent") {
    resolvedSide = ev.side;
  } else if (ev.type === "miss" && (ev.defender === "player" || ev.defender === "opponent")) {
    resolvedSide = ev.defender;
  } else if (ev.attacker === "player" || ev.attacker === "opponent") {
    resolvedSide = ev.attacker;
  }

  const fighter = resolvedSide === "player" ? player : opponent;
  const className = fighter?.class || fighter?.className || null;
  const name = ev.passive || PASSIVE_BY_CLASS[className] || "Class Ability";

  let detail = null;
  if (kind === "dirty_trick_selected") {
    detail = DIRTY_TRICK_LABELS[ev.dirtyTrick] || titleCaseKey(ev.dirtyTrick);
  } else if (kind === "orbital_assistant_activated") {
    detail = ORBITAL_LABELS[ev.effect] || titleCaseKey(ev.effect);
  } else if (kind === "fire_support" || kind === "fire_support_dodged") {
    detail = ORBITAL_LABELS.fire_support;
  } else if (kind === "kinetic_tantrum_strong") {
    detail = `${STRONG_TANTRUM_CRIT_MULT.toFixed(1)}× guaranteed hit`;
  } else if (kind === "kinetic_tantrum_normal") {
    detail = `${NORMAL_TANTRUM_CRIT_MULT.toFixed(1)}×`;
  } else if (kind === "astral_barrier_created") {
    detail = `${ev.barrier ?? ev.barrierMax ?? 0} shield`;
  } else if (kind === "astral_barrier_restored") {
    detail = `Refresh ${ev.barrier ?? ev.barrierMax ?? 0}`;
  } else if (kind === "phantom_signal_armed" || kind === "phantom_signal_reprimed") {
    detail = "Primed";
  } else if (kind === "phantom_signal_miss") {
    detail = "Scrambled";
  } else if (kind === "overclock_stack_gained") {
    detail = `${wholeStackCount(ev.before)} → ${wholeStackCount(ev.stacks ?? ev.after)}`;
  } else if (kind === "overclock_stacks_removed") {
    detail = `${wholeStackCount(ev.before ?? (Number(ev.stacks) + Number(ev.removed || 0)))} → ${wholeStackCount(ev.stacks)}`;
  } else if (kind === "overclock_vented") {
    detail = `${wholeStackCount(ev.before)} → ${wholeStackCount(ev.stacks ?? ev.after)}`;
  } else if (kind === "overclock_ready") {
    detail = `0/${OVERCLOCK_STACK_CAP}`;
  } else if (kind === "defensive_protocol_applied") {
    detail = ORBITAL_LABELS.defensive_protocol;
  } else if (kind === "defensive_protocol_consumed") {
    detail = `−${ev.amount ?? 0}`;
  } else if (kind === "acquire_target_applied") {
    detail = ORBITAL_LABELS.acquire_target;
  }

  return {
    name,
    detail,
    className,
    side: resolvedSide,
    color: CLASS_ABILITY_COLORS[className] || (resolvedSide === "player" ? "#22D3EE" : "#FB7185"),
    kind,
  };
}

/** Fresh per-fighter combat state (cleared between combats via new fighter build). */
export function createPassiveState() {
  return {
    kineticTantrum: null,
    phantomPending: false,
    shadowOwnTurns: 0,
    dirtyTricks: [],
    dirtyTrick: null,
    openingCharges: 0,
    overclockStacks: 0,
    engineerTurns: 0,
    nextIncomingDamageMult: 1,
    nextAttackCritBonus: 0,
  };
}

export function snapshotPassiveHud(fighter) {
  const ps = fighter?.passiveState || createPassiveState();
  return {
    barrier: fighter?.barrier ?? 0,
    overclockStacks: ps.overclockStacks || 0,
    overclockActive: fighter?.className === "Technomancer",
    phantomPending: !!ps.phantomPending,
    dirtyTricks: [...(ps.dirtyTricks || [])],
    kineticTantrum: ps.kineticTantrum || null,
    defensiveProtocol: (ps.nextIncomingDamageMult ?? 1) !== 1,
    acquireTarget: (ps.nextAttackCritBonus ?? 0) > 0,
    openingCharges: ps.openingCharges || 0,
  };
}

export function passiveNameForClass(className) {
  return PASSIVE_BY_CLASS[className] || null;
}

function applyDirtyTrickBonus(fighter, trick) {
  if (trick === "flashbang") {
    fighter.dodge = (fighter.dodge || 0) + DIRTY_TRICK_FLAT_BONUS;
  } else if (trick === "targeting_beacon") {
    fighter.crit = (fighter.crit || 0) + DIRTY_TRICK_FLAT_BONUS;
  } else if (trick === "stim_injector") {
    fighter.passiveState.openingCharges = STIM_INJECTOR_OPENING_ATTACK_TURNS;
  }
}

function emitDirtyTrickSelected(fighter, trick, events, extra = {}) {
  const ps = fighter.passiveState;
  events.push({
    type: "passive",
    passive: "Dirty Tricks",
    kind: "dirty_trick_selected",
    side: fighter.side,
    dirtyTrick: trick,
    dirtyTricks: [...(ps.dirtyTricks || [])],
    dodge: fighter.dodge,
    crit: fighter.crit,
    openingCharges: ps.openingCharges,
    totalTurn: extra.totalTurn ?? null,
    text: `${fighter.name} deploys ${DIRTY_TRICK_LABELS[trick] || trick}`,
  });
}

/**
 * Attach passive fields onto a fighter built by arenaEngine.
 * Mutates fighter in place; returns combat-start events.
 */
export function onCombatStart(fighter, rng = Math.random) {
  const events = [];
  if (fighter.suppressClassPassive || fighter.className == null) {
    fighter.passive = null;
    fighter.barrier = 0;
    fighter.passiveState = createPassiveState();
    return events;
  }
  const cls = fighter.className;
  fighter.passive = passiveNameForClass(cls);
  fighter.barrier = 0;
  fighter.passiveState = createPassiveState();
  const ps = fighter.passiveState;

  if (cls === "Shadow Operative") {
    ps.phantomPending = PHANTOM_SIGNAL_STARTS_ARMED;
    events.push({
      type: "passive",
      passive: "Phantom Signal",
      kind: "phantom_signal_armed",
      side: fighter.side,
      primed: PHANTOM_SIGNAL_STARTS_ARMED,
      phantomPending: PHANTOM_SIGNAL_STARTS_ARMED,
      text: `${fighter.name} primes Phantom Signal`,
    });
  }

  if (cls === "Void Runner") {
    const trick = DIRTY_TRICKS[pickIndex(rng, DIRTY_TRICKS.length)];
    ps.dirtyTricks = [trick];
    ps.dirtyTrick = trick;
    applyDirtyTrickBonus(fighter, trick);
    emitDirtyTrickSelected(fighter, trick, events, { totalTurn: 0 });
  }

  if (cls === "Technomancer") {
    ps.overclockStacks = 0;
    events.push({
      type: "passive",
      passive: "Overclock",
      kind: "overclock_ready",
      side: fighter.side,
      stacks: 0,
      before: 0,
      after: 0,
      text: `${fighter.name} Overclock 0/${OVERCLOCK_STACK_CAP}`,
    });
  }

  return events;
}

/** Start-of-own-turn hooks (Astral Barrier + Shadow re-prime). */
export function onTurnStart(fighter, rng = Math.random) {
  const events = [];
  if (fighter.suppressClassPassive || fighter.className == null) return events;

  if (fighter.className === "Shadow Operative") {
    const ps = fighter.passiveState || createPassiveState();
    fighter.passiveState = ps;
    ps.shadowOwnTurns = (ps.shadowOwnTurns || 0) + 1;
    if (ps.shadowOwnTurns % PHANTOM_REPRIME_OWN_TURNS === 0) {
      ps.phantomPending = PHANTOM_SIGNAL_STARTS_ARMED;
      events.push({
        type: "passive",
        passive: "Phantom Signal",
        kind: "phantom_signal_reprimed",
        side: fighter.side,
        ownTurn: ps.shadowOwnTurns,
        primed: PHANTOM_SIGNAL_STARTS_ARMED,
        phantomPending: PHANTOM_SIGNAL_STARTS_ARMED,
        text: `${fighter.name} re-primes Phantom Signal`,
      });
    }
  }

  if (fighter.className !== "Astral Warden") return events;

  if (rng() < ASTRAL_BARRIER_CHANCE) {
    const full = astralBarrierAmount(fighter.vitalityValue, fighter.maxHp || 0);
    const restored = fighter.barrier > 0;
    fighter.barrier = full;
    events.push({
      type: "passive",
      passive: "Astral Barrier",
      kind: restored ? "astral_barrier_restored" : "astral_barrier_created",
      side: fighter.side,
      barrier: fighter.barrier,
      barrierMax: full,
      text: restored
        ? `${fighter.name}'s Astral Barrier refreshes (${full})`
        : `${fighter.name} raises Astral Barrier (${full})`,
    });
  }
  return events;
}

/**
 * Second/third distinct Dirty Trick at total combat turns 14 and 28.
 * Stim Injector sets openingCharges=2 and should steal the current turn.
 */
export function maybeUnlockDirtyTricks(fighter, totalTurn, rng, events) {
  if (fighter.className !== "Void Runner" || fighter.suppressClassPassive) return false;
  if (totalTurn !== DIRTY_TRICK_TURN_TWO && totalTurn !== DIRTY_TRICK_TURN_THREE) return false;
  const ps = fighter.passiveState;
  if (!ps) return false;
  const active = new Set(ps.dirtyTricks || []);
  const remaining = DIRTY_TRICKS.filter((t) => !active.has(t));
  if (remaining.length === 0) return false;
  const trick = remaining[pickIndex(rng, remaining.length)];
  ps.dirtyTricks = [...(ps.dirtyTricks || []), trick];
  ps.dirtyTrick = trick;
  applyDirtyTrickBonus(fighter, trick);
  emitDirtyTrickSelected(fighter, trick, events, { totalTurn });
  return trick === "stim_injector";
}

/**
 * Activate Kinetic Tantrum after a true Dodge (not a miss).
 * @param {"normal"|"strong"} strength
 */
export function activateKineticTantrum(vanguard, strength, events) {
  if (vanguard.className !== "Vanguard") return;
  const ps = vanguard.passiveState;
  if (!ps) return;
  if (strength === "normal" && ps.kineticTantrum === "strong") {
    events.push({
      type: "passive",
      passive: "Kinetic Tantrum",
      kind: "kinetic_tantrum_blocked_downgrade",
      side: vanguard.side,
      kineticTantrum: "strong",
      text: `${vanguard.name}'s 2.0× Kinetic Tantrum holds`,
    });
    return;
  }
  ps.kineticTantrum = strength;
  events.push({
    type: "passive",
    passive: "Kinetic Tantrum",
    kind: strength === "strong" ? "kinetic_tantrum_strong" : "kinetic_tantrum_normal",
    side: vanguard.side,
    kineticTantrum: strength,
    guaranteedHit: strength === "strong",
    text:
      strength === "strong"
        ? `${vanguard.name} primes Kinetic Tantrum 2.0× (guaranteed hit)`
        : `${vanguard.name} primes Kinetic Tantrum 1.5×`,
  });
}

/**
 * Snapshot next-attack modifiers from Kinetic Tantrum + Acquire Target.
 * Call at the start of a normal attack; consume flags after the attack resolves.
 */
export function beginNormalAttackModifiers(attacker) {
  const ps = attacker.passiveState || createPassiveState();
  const mods = {
    guaranteedHit: false,
    guaranteedCrit: false,
    critMultOverride: null,
    critBonusFlat: 0,
    kineticMode: ps.kineticTantrum,
    acquireTarget: ps.nextAttackCritBonus > 0,
  };

  if (ps.kineticTantrum === "strong") {
    mods.guaranteedHit = true;
    mods.guaranteedCrit = true;
    mods.critMultOverride = STRONG_TANTRUM_CRIT_MULT;
  } else if (ps.kineticTantrum === "normal") {
    mods.guaranteedCrit = true;
    mods.critMultOverride = NORMAL_TANTRUM_CRIT_MULT;
  }

  if (ps.nextAttackCritBonus > 0) {
    mods.critBonusFlat += ps.nextAttackCritBonus;
  }

  return mods;
}

/** Consume next-attack modifiers after a normal attack attempt fully resolves. */
export function endNormalAttackModifiers(attacker, mods, events) {
  const ps = attacker.passiveState;
  if (!ps) return;

  if (mods.kineticMode && ps.kineticTantrum === mods.kineticMode) {
    ps.kineticTantrum = null;
    events.push({
      type: "passive",
      passive: "Kinetic Tantrum",
      kind: "kinetic_tantrum_consumed",
      side: attacker.side,
      consumed: mods.kineticMode,
      text: `${attacker.name} spends Kinetic Tantrum (${mods.kineticMode === "strong" ? "2.0×" : "1.5×"})`,
    });
  }

  if (mods.acquireTarget && ps.nextAttackCritBonus > 0) {
    const bonus = ps.nextAttackCritBonus;
    ps.nextAttackCritBonus = 0;
    events.push({
      type: "passive",
      passive: "Orbital Assistant",
      kind: "acquire_target_consumed",
      side: attacker.side,
      critBonus: bonus,
      text: `${attacker.name} spends Acquire Target`,
    });
  }
}

/**
 * Phantom Signal: force miss (not dodge) for the next incoming normal attack.
 * @returns {{ forcedMiss: boolean }}
 */
export function tryPhantomSignalMiss(defender, events) {
  const ps = defender.passiveState;
  if (!ps || defender.className !== "Shadow Operative") return { forcedMiss: false };
  if (!ps.phantomPending) return { forcedMiss: false };

  ps.phantomPending = false;
  events.push({
    type: "miss",
    missKind: "phantom_signal",
    passive: "Phantom Signal",
    kind: "phantom_signal_miss",
    attacker: null,
    defender: defender.side,
    dodged: false,
    missed: true,
    hologram: true,
    phantomPending: false,
    damage: 0,
    text: `${defender.name}'s Phantom Signal scrambles the incoming attack`,
  });
  return { forcedMiss: true };
}

/** Overclock outgoing multiplier (before resistance). */
export function overclockDealtMultiplier(fighter) {
  if (fighter.className !== "Technomancer") return 1;
  const stacks = fighter.passiveState?.overclockStacks || 0;
  return 1 + stacks * OVERCLOCK_DEALT_PER_STACK;
}

/** Overclock incoming multiplier (after resistance). */
export function overclockTakenMultiplier(fighter) {
  if (fighter.className !== "Technomancer") return 1;
  const stacks = fighter.passiveState?.overclockStacks || 0;
  return 1 + stacks * OVERCLOCK_TAKEN_PER_STACK;
}

/** +1 stack, capped. Tests and pre-vent path. */
export function gainOverclockStack(fighter, events) {
  if (fighter.className !== "Technomancer") return;
  const ps = fighter.passiveState;
  if (!ps) return;
  const before = Math.trunc(ps.overclockStacks || 0);
  ps.overclockStacks = Math.min(OVERCLOCK_STACK_CAP, before + OVERCLOCK_STACKS_PER_ATTACK);
  events.push({
    type: "passive",
    passive: "Overclock",
    kind: "overclock_stack_gained",
    side: fighter.side,
    before,
    after: ps.overclockStacks,
    stacks: ps.overclockStacks,
    text: `${fighter.name} Overclock +${OVERCLOCK_STACKS_PER_ATTACK} → ${ps.overclockStacks}/${OVERCLOCK_STACK_CAP}`,
  });
}

/** After a Technomancer attack attempt: vent 6→4, else +1 up to 6. */
export function tickOverclockAfterAttempt(fighter, events) {
  if (fighter.className !== "Technomancer") return;
  const ps = fighter.passiveState;
  if (!ps) return;
  const before = Math.trunc(ps.overclockStacks || 0);
  if (before >= OVERCLOCK_STACK_CAP) {
    ps.overclockStacks = Math.max(0, before - OVERCLOCK_VENT_STACKS);
    events.push({
      type: "passive",
      passive: "Overclock",
      kind: "overclock_vented",
      side: fighter.side,
      before,
      after: ps.overclockStacks,
      stacks: ps.overclockStacks,
      text: `${fighter.name} Overclock vents ${before} → ${ps.overclockStacks}`,
    });
    return;
  }
  gainOverclockStack(fighter, events);
}

export function removeOverclockStacks(fighter, amount, events) {
  if (fighter.className !== "Technomancer") return;
  const ps = fighter.passiveState;
  if (!ps) return;
  const before = Math.trunc(ps.overclockStacks || 0);
  ps.overclockStacks = Math.max(0, before - amount);
  events.push({
    type: "passive",
    passive: "Overclock",
    kind: "overclock_stacks_removed",
    side: fighter.side,
    before,
    removed: before - ps.overclockStacks,
    after: ps.overclockStacks,
    stacks: ps.overclockStacks,
    text: `${fighter.name} Overclock disrupted ${before} → ${ps.overclockStacks}`,
  });
}

/**
 * Post-pipeline incoming reduction (Defensive Protocol), then barrier, then HP.
 */
export function applyDamageWithBarrier(target, pipelineDamage, events, { isDamagingHit = true } = {}) {
  let dmg = Math.max(0, pipelineDamage || 0);
  const ps = target.passiveState;

  if (isDamagingHit && ps && ps.nextIncomingDamageMult !== 1 && dmg > 0) {
    const before = dmg;
    const mult = ps.nextIncomingDamageMult;
    dmg = Math.max(0, roundCombatDamage(dmg * mult));
    ps.nextIncomingDamageMult = 1;
    events.push({
      type: "passive",
      passive: "Orbital Assistant",
      kind: "defensive_protocol_consumed",
      side: target.side,
      mult,
      amount: before - dmg,
      before,
      after: dmg,
      damageAfter: dmg,
      text: `${target.name}'s Defensive Protocol reduces ${before - dmg} damage`,
    });
  }

  let barrierAbsorbed = 0;
  let hpDamage = dmg;
  if (target.barrier > 0 && dmg > 0) {
    barrierAbsorbed = Math.min(target.barrier, dmg);
    target.barrier -= barrierAbsorbed;
    hpDamage = dmg - barrierAbsorbed;
    events.push({
      type: "barrier",
      kind: "barrier_absorbed",
      side: target.side,
      absorbed: barrierAbsorbed,
      barrierRemaining: target.barrier,
      text: `${target.name}'s barrier absorbs ${barrierAbsorbed}`,
    });
    if (target.barrier <= 0) {
      events.push({
        type: "barrier",
        kind: "barrier_broken",
        side: target.side,
        barrierRemaining: 0,
        text: `${target.name}'s Astral Barrier breaks`,
      });
    }
  }

  target.hp = Math.max(0, target.hp - hpDamage);
  return { hpDamage, barrierAbsorbed, shieldHit: barrierAbsorbed > 0, finalIncoming: dmg };
}

export function isOrbitalActivationTurn(engineerTurns) {
  const n = Number(engineerTurns) || 0;
  if (n <= 0) return false;
  if (n <= ORBITAL_EARLY_TURN_CAP) return n % ORBITAL_EARLY_INTERVAL === 0;
  if (n >= ORBITAL_LATE_START_TURN) return (n - ORBITAL_LATE_START_TURN) % ORBITAL_LATE_INTERVAL === 0;
  return false;
}

/**
 * Start of Cosmic Engineer's own turn, before their normal attack.
 * Acquire Target therefore buffs this same strike; Fire Support resolves first;
 * Defensive Protocol still lasts until the Engineer is hit.
 */
export function maybeOrbitalAssistant(engineer, opponent, events, rng = Math.random) {
  if (engineer.className !== "Cosmic Engineer") return;
  const ps = engineer.passiveState;
  ps.engineerTurns += 1;
  if (!isOrbitalActivationTurn(ps.engineerTurns)) return;
  if (engineer.hp <= 0 || opponent.hp <= 0) return;

  const effect = ORBITAL_EFFECTS[pickIndex(rng, ORBITAL_PROTOCOL_COUNT)];
  events.push({
    type: "passive",
    passive: "Orbital Assistant",
    kind: "orbital_assistant_activated",
    side: engineer.side,
    effect,
    engineerTurns: ps.engineerTurns,
    ownTurn: ps.engineerTurns,
    text: `${engineer.name}'s Orbital Assistant: ${ORBITAL_LABELS[effect] || effect}`,
  });

  if (effect === "fire_support") {
    const context = Number(engineer.contextMult != null ? engineer.contextMult : 1);
    const baseline = engineer.canonicalDamage != null
      ? Number(engineer.canonicalDamage)
      : engineer.intellectValue != null
        ? playerBaseDamage(engineer.intellectValue)
        : (engineer.standardAttack || 0);
    const trueRaw = baseline * FIRE_SUPPORT_FRAC * context;
    const trueDmg = roundCombatDamage(trueRaw);
    if ((opponent.dodge || 0) > 0 && rng() < opponent.dodge) {
      events.push({
        type: "dodge",
        secondaryKind: "fire_support",
        passive: "Orbital Assistant",
        kind: "fire_support_dodged",
        attacker: engineer.side,
        defender: opponent.side,
        damage: 0,
        crit: false,
        dodged: true,
        missed: false,
        isNormalAttack: false,
        damageType: "TRUE",
        canCrit: false,
        canDodge: true,
        text: `${opponent.name} dodges Fire Support`,
      });
      if (opponent.className === "Vanguard") {
        activateKineticTantrum(opponent, "normal", events);
      }
      return;
    }
    const res = applyDamageWithBarrier(opponent, trueDmg, events, { isDamagingHit: true });
    events.push({
      type: "secondary",
      secondaryKind: "fire_support",
      passive: "Orbital Assistant",
      kind: "fire_support",
      attacker: engineer.side,
      defender: opponent.side,
      damage: res.hpDamage,
      barrierAbsorbed: res.barrierAbsorbed,
      shieldHit: res.shieldHit,
      crit: false,
      dodged: false,
      missed: false,
      isNormalAttack: false,
      damageType: "TRUE",
      canCrit: false,
      canDodge: true,
      trueDamage: true,
      text: `Fire Support deals ${res.hpDamage} True Damage`,
    });
    return;
  }

  if (effect === "defensive_protocol") {
    ps.nextIncomingDamageMult = 1 - DEFENSIVE_PROTOCOL_REDUCTION;
    events.push({
      type: "passive",
      passive: "Orbital Assistant",
      kind: "defensive_protocol_applied",
      side: engineer.side,
      reduction: DEFENSIVE_PROTOCOL_REDUCTION,
      text: `${engineer.name} readies Defensive Protocol`,
    });
    return;
  }

  if (effect === "acquire_target") {
    ps.nextAttackCritBonus = ACQUIRE_TARGET_CRIT_BONUS;
    events.push({
      type: "passive",
      passive: "Orbital Assistant",
      kind: "acquire_target_applied",
      side: engineer.side,
      critBonus: ACQUIRE_TARGET_CRIT_BONUS,
      text: `${engineer.name} acquires target (+40 Crit)`,
    });
  }
}

/** Whether Stim Injector currently forces extra Void attack turns. */
export function hasStimInjector(fighter) {
  const ps = fighter.passiveState;
  if (fighter.className !== "Void Runner" || !ps) return false;
  return (ps.openingCharges || 0) > 0 || (ps.dirtyTricks || []).includes("stim_injector") || ps.dirtyTrick === "stim_injector";
}

export function consumeStimOpening(fighter, events = []) {
  const ps = fighter.passiveState;
  if (!ps || (ps.openingCharges || 0) <= 0) return false;
  const before = ps.openingCharges;
  ps.openingCharges -= 1;
  events.push({
    type: "passive",
    passive: "Dirty Tricks",
    kind: "stim_injector_charge",
    side: fighter.side,
    before,
    after: ps.openingCharges,
    openingCharges: ps.openingCharges,
    text: `${fighter.name}'s Stim Injector ${before} → ${ps.openingCharges}`,
  });
  return ps.openingCharges > 0;
}

export { CRIT_DAMAGE_MULT, rollUniversalVariance };
