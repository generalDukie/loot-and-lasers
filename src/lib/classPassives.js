/**
 * Class passive registry + combat-state helpers.
 * Mechanics source of truth: Kinetic Tantrum, Astral Barrier, Phantom Signal,
 * Dirty Tricks, Overclock, Orbital Assistant.
 *
 * Hooks are invoked by arenaEngine; formulas stay in statEngine.
 */

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

/** Passive event kinds that should flash on the combat screen. */
const BANNER_KINDS = new Set([
  "dirty_trick_selected",
  "orbital_assistant_activated",
  "kinetic_tantrum_normal",
  "kinetic_tantrum_strong",
  "astral_barrier_created",
  "astral_barrier_restored",
  "phantom_signal_armed",
  "phantom_signal_miss",
  "overclock_stack_gained",
  "overclock_stacks_removed",
  "defensive_protocol_applied",
  "acquire_target_applied",
]);

function titleCaseKey(key) {
  if (!key) return null;
  return String(key).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
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
    (ev.type === "secondary" && ev.passive);
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
  } else if (kind === "kinetic_tantrum_strong") {
    detail = "Strong";
  } else if (kind === "kinetic_tantrum_normal") {
    detail = "Normal";
  } else if (kind === "astral_barrier_created") {
    detail = "Raised";
  } else if (kind === "astral_barrier_restored") {
    detail = "Restored";
  } else if (kind === "phantom_signal_armed") {
    detail = `${ev.charges ?? 2} charges`;
  } else if (kind === "phantom_signal_miss") {
    detail = `Miss · ${ev.chargesRemaining ?? 0} left`;
  } else if (kind === "overclock_stack_gained") {
    detail = `Stack ${ev.stacks}`;
  } else if (kind === "overclock_stacks_removed") {
    detail = `−${ev.removed} → ${ev.stacks}`;
  } else if (kind === "defensive_protocol_applied") {
    detail = ORBITAL_LABELS.defensive_protocol;
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

export const OVERCLOCK_DEALT_PER_STACK = 0.125;
export const OVERCLOCK_TAKEN_PER_STACK = 0.05;
export const OVERCLOCK_CRIT_STACK_LOSS = 3;
export const ASTRAL_BARRIER_CHANCE = 0.1;
export const ASTRAL_BARRIER_MAX_HP_FRAC = 0.15;
export const PHANTOM_SIGNAL_CHARGES = 2;
export const DIRTY_TRICK_FLAT_BONUS = 0.075; // 7.5 percentage points as 0–1
export const FIRE_SUPPORT_FRAC = 0.6;
export const DEFENSIVE_PROTOCOL_REDUCTION = 0.25;
export const ACQUIRE_TARGET_CRIT_BONUS = 0.4;
export const STRONG_TANTRUM_CRIT_MULT = 2.0;

/** Fresh per-fighter combat state (cleared between combats via new fighter build). */
export function createPassiveState() {
  return {
    kineticTantrum: null, // null | "normal" | "strong"
    phantomCharges: 0,
    dirtyTrick: null,
    overclockStacks: 0,
    engineerTurns: 0,
    /** Multiplier applied to next incoming damaging hit after pipeline (Defensive Protocol). */
    nextIncomingDamageMult: 1,
    /** Flat crit chance (0–1) added to next normal attack (Acquire Target). */
    nextAttackCritBonus: 0,
  };
}

export function passiveNameForClass(className) {
  return PASSIVE_BY_CLASS[className] || null;
}

/**
 * Attach passive fields onto a fighter built by arenaEngine.
 * Mutates fighter in place; returns combat-start events.
 */
export function onCombatStart(fighter, rng = Math.random) {
  const events = [];
  const cls = fighter.className;
  fighter.passive = passiveNameForClass(cls);
  fighter.barrier = 0;
  fighter.passiveState = createPassiveState();
  const ps = fighter.passiveState;

  if (cls === "Shadow Operative") {
    ps.phantomCharges = PHANTOM_SIGNAL_CHARGES;
    events.push({
      type: "passive",
      passive: "Phantom Signal",
      kind: "phantom_signal_armed",
      side: fighter.side,
      charges: ps.phantomCharges,
      text: `${fighter.name} arms Phantom Signal (${ps.phantomCharges} charges)`,
    });
  }

  if (cls === "Void Runner") {
    const trick = DIRTY_TRICKS[Math.floor(rng() * DIRTY_TRICKS.length)];
    ps.dirtyTrick = trick;
    if (trick === "flashbang") {
      // May exceed normal Dodge cap.
      fighter.dodge = (fighter.dodge || 0) + DIRTY_TRICK_FLAT_BONUS;
    } else if (trick === "targeting_beacon") {
      fighter.crit = (fighter.crit || 0) + DIRTY_TRICK_FLAT_BONUS;
    }
    events.push({
      type: "passive",
      passive: "Dirty Tricks",
      kind: "dirty_trick_selected",
      side: fighter.side,
      dirtyTrick: trick,
      dodge: fighter.dodge,
      crit: fighter.crit,
      text: `${fighter.name} selects Dirty Trick: ${trick.replace(/_/g, " ")}`,
    });
  }

  if (cls === "Technomancer") {
    ps.overclockStacks = 0;
    events.push({
      type: "passive",
      passive: "Overclock",
      kind: "overclock_ready",
      side: fighter.side,
      stacks: 0,
      text: `${fighter.name} begins at 0 Overclock stacks`,
    });
  }

  return events;
}

/** Start-of-turn hooks (Astral Barrier). Returns events. */
export function onTurnStart(fighter, rng = Math.random) {
  const events = [];
  if (fighter.className !== "Astral Warden") return events;

  if (rng() < ASTRAL_BARRIER_CHANCE) {
    const full = Math.round((fighter.maxHp || 0) * ASTRAL_BARRIER_MAX_HP_FRAC);
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
        ? `${fighter.name}'s Astral Barrier restored (${full})`
        : `${fighter.name} raises Astral Barrier (${full})`,
    });
  }
  return events;
}

/**
 * Activate Kinetic Tantrum after a true Dodge (not a miss).
 * @param {"normal"|"strong"} strength
 */
export function activateKineticTantrum(vanguard, strength, events) {
  if (vanguard.className !== "Vanguard") return;
  const ps = vanguard.passiveState;
  if (strength === "normal" && ps.kineticTantrum === "strong") {
    // Strong always overrides Normal — never downgrade.
    events.push({
      type: "passive",
      passive: "Kinetic Tantrum",
      kind: "kinetic_tantrum_blocked_downgrade",
      side: vanguard.side,
      kineticTantrum: "strong",
      text: `${vanguard.name}'s Strong Kinetic Tantrum blocks Normal overwrite`,
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
    text:
      strength === "strong"
        ? `${vanguard.name} activates Strong Kinetic Tantrum`
        : `${vanguard.name} activates Kinetic Tantrum`,
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
    // Normal crit mult; still subject to dodge.
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
      text: `${attacker.name} consumes Kinetic Tantrum (${mods.kineticMode})`,
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
      text: `${attacker.name} consumes Acquire Target`,
    });
  }
}

/**
 * Phantom Signal: force miss (not dodge) for first N incoming normal attacks.
 * @returns {{ forcedMiss: boolean, events: object[] }}
 */
export function tryPhantomSignalMiss(defender, events) {
  const ps = defender.passiveState;
  if (!ps || defender.className !== "Shadow Operative") return { forcedMiss: false };
  if (ps.phantomCharges <= 0) return { forcedMiss: false };

  ps.phantomCharges -= 1;
  events.push({
    type: "miss",
    missKind: "phantom_signal",
    passive: "Phantom Signal",
    kind: "phantom_signal_miss",
    attacker: null, // filled by caller
    defender: defender.side,
    dodged: false,
    missed: true,
    hologram: true,
    chargesRemaining: ps.phantomCharges,
    damage: 0,
    text: `${defender.name}'s Phantom Signal forces a miss`,
  });
  return { forcedMiss: true };
}

/** Overclock outgoing multiplier (before resistance). */
export function overclockDealtMultiplier(fighter) {
  if (fighter.className !== "Technomancer") return 1;
  const stacks = fighter.passiveState?.overclockStacks || 0;
  return 1 + stacks * OVERCLOCK_DEALT_PER_STACK;
}

/** Overclock incoming multiplier (participates in pipeline after resistance / with taken). */
export function overclockTakenMultiplier(fighter) {
  if (fighter.className !== "Technomancer") return 1;
  const stacks = fighter.passiveState?.overclockStacks || 0;
  return 1 + stacks * OVERCLOCK_TAKEN_PER_STACK;
}

export function gainOverclockStack(fighter, events) {
  if (fighter.className !== "Technomancer") return;
  const ps = fighter.passiveState;
  ps.overclockStacks += 1;
  events.push({
    type: "passive",
    passive: "Overclock",
    kind: "overclock_stack_gained",
    side: fighter.side,
    stacks: ps.overclockStacks,
    text: `${fighter.name} gains Overclock (${ps.overclockStacks})`,
  });
}

export function removeOverclockStacks(fighter, amount, events) {
  if (fighter.className !== "Technomancer") return;
  const ps = fighter.passiveState;
  const before = ps.overclockStacks;
  ps.overclockStacks = Math.max(0, before - amount);
  events.push({
    type: "passive",
    passive: "Overclock",
    kind: "overclock_stacks_removed",
    side: fighter.side,
    removed: before - ps.overclockStacks,
    stacks: ps.overclockStacks,
    text: `${fighter.name} loses ${before - ps.overclockStacks} Overclock (now ${ps.overclockStacks})`,
  });
}

/**
 * Post-pipeline incoming reduction (Defensive Protocol), then barrier, then HP.
 */
export function applyDamageWithBarrier(target, pipelineDamage, events, { isDamagingHit = true } = {}) {
  let dmg = Math.max(0, pipelineDamage || 0);
  const ps = target.passiveState;

  if (isDamagingHit && ps && ps.nextIncomingDamageMult !== 1 && dmg > 0) {
    const mult = ps.nextIncomingDamageMult;
    dmg = Math.max(0, Math.round(dmg * mult));
    ps.nextIncomingDamageMult = 1;
    events.push({
      type: "passive",
      passive: "Orbital Assistant",
      kind: "defensive_protocol_consumed",
      side: target.side,
      mult,
      damageAfter: dmg,
      text: `${target.name}'s Defensive Protocol reduces the hit`,
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
  }

  target.hp = Math.max(0, target.hp - hpDamage);
  return { hpDamage, barrierAbsorbed, shieldHit: barrierAbsorbed > 0, finalIncoming: dmg };
}

/**
 * After Cosmic Engineer's normal attack resolves on their turn (every 2nd turn).
 */
export function maybeOrbitalAssistant(engineer, opponent, events, rng = Math.random) {
  if (engineer.className !== "Cosmic Engineer") return;
  const ps = engineer.passiveState;
  ps.engineerTurns += 1;
  if (ps.engineerTurns % 2 !== 0) return;

  const effect = ORBITAL_EFFECTS[Math.floor(rng() * ORBITAL_EFFECTS.length)];
  events.push({
    type: "passive",
    passive: "Orbital Assistant",
    kind: "orbital_assistant_activated",
    side: engineer.side,
    effect,
    engineerTurns: ps.engineerTurns,
    text: `${engineer.name}'s Orbital Assistant: ${effect.replace(/_/g, " ")}`,
  });

  if (effect === "fire_support") {
    // Secondary True Damage event — 60% of sheet standard attack.
    const raw = Math.round((engineer.standardAttack || 0) * FIRE_SUPPORT_FRAC);
    const trueDmg = Math.max(0, raw);
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
      canDodge: false,
      text: `Orbital Assistant Fire Support deals ${res.hpDamage} True Damage`,
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
      text: `${engineer.name} applies Defensive Protocol (−25% next hit)`,
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
      text: `${engineer.name} acquires target (+40% Crit next attack)`,
    });
  }
}

/** Whether Stim Injector should override opening turn order for this fighter. */
export function hasStimInjector(fighter) {
  return fighter.className === "Void Runner" && fighter.passiveState?.dirtyTrick === "stim_injector";
}
