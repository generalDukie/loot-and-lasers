/**
 * Combat-layer helpers that call locked productionMath primitives.
 * Do not duplicate Phase 0 coefficients here beyond named aliases.
 */
import {
  CLASS_ARCHETYPE,
  COMBAT_CONTEXT_MULT,
  CRIT_DAMAGE_MULT,
  STANDARD_ATTACK_FLAT,
  VARIANCE_MIN,
  VARIANCE_MAX,
  combatContextMultiplier,
  critChance,
  dodgeChance,
  maxHp,
  missionEnemyMaxHp,
  missionEnemyBaseDamage,
  playerBaseDamage,
  dungeonWormholeEnemyBaseDamage,
  rawStandardAttack,
  resistances,
  roundHalfEven,
  unroundedMaxHp,
} from "@/lib/productionMath";

export {
  STANDARD_ATTACK_FLAT,
  CRIT_DAMAGE_MULT,
  playerBaseDamage,
  dungeonWormholeEnemyBaseDamage,
  missionEnemyMaxHp,
};
export const ASTRAL_BARRIER_MAX_HP_FRAC = 0.15;
/** Fallback unit-interval sample when no RNG function is supplied. */
const UNIT_INTERVAL_MIDPOINT = 0.5;

export const DAMAGE_CHANNEL = Object.freeze({
  Might: "might",
  Reflex: "reflex",
  Tech: "tech",
  True: "true",
});

export function combatContentFromMode(mode) {
  const m = String(mode || "");
  if (m === "mission") return "mission";
  if (m === "dungeon" || m === "wormhole") return "dungeon";
  if (m === "arena" || m === "pvp" || m === "guild" || m === "combat") return "arena";
  return "";
}

export function inferCombatContent(opts = {}, player = null, opponent = null) {
  const explicit = combatContentFromMode(opts.content || opts.mode);
  if (explicit) return explicit;
  if (player?.missionEnemy || opponent?.missionEnemy) return "mission";
  if (player?.dungeonEnemy || opponent?.dungeonEnemy) return "dungeon";
  return "arena";
}

export function combatantArchetype(className, explicit) {
  if (explicit === "Might" || explicit === "Reflex" || explicit === "Tech") return explicit;
  return CLASS_ARCHETYPE[className] || "Might";
}

export function damageChannelForArchetype(archetype) {
  if (archetype === "Reflex") return DAMAGE_CHANNEL.Reflex;
  if (archetype === "Tech") return DAMAGE_CHANNEL.Tech;
  return DAMAGE_CHANNEL.Might;
}

export function attackFlatBase(combatant) {
  if (combatant?.missionEnemy && !combatant?.dungeonEnemy) {
    return missionEnemyBaseDamage(combatant.level);
  }
  return STANDARD_ATTACK_FLAT;
}

/**
 * Certified Mission enemy outgoing (`missionEnemyOutgoingMultiplier`) is locked
 * in productionMath. Phase 4 live combat applies it exactly once via
 * contextMultiplierFor → combatContextMultiplier. Do not also multiply by
 * Dungeon/Wormhole ×1.10. Test hook may still toggle for diagnostics.
 */
export let APPLY_CERTIFIED_MISSION_ENEMY_OUTGOING_IN_LIVE_COMBAT = true;

/** Test/evaluation hook. Production default is true after Phase 4 activation. */
export function setApplyCertifiedMissionEnemyOutgoingInLiveCombat(value) {
  APPLY_CERTIFIED_MISSION_ENEMY_OUTGOING_IN_LIVE_COMBAT = !!value;
}

export function contextMultiplierFor(content, role, level) {
  if (
    !APPLY_CERTIFIED_MISSION_ENEMY_OUTGOING_IN_LIVE_COMBAT
    && content === "mission"
    && (role === "enemy" || role === "opponent")
  ) {
    return COMBAT_CONTEXT_MULT.missionPlayer;
  }
  return combatContextMultiplier({ content, role, level });
}

/** Uniform(0.90, 1.10). Inject `variance` in tests (0.90 / 1.00 / 1.10). */
export function rollUniversalVariance(rng = Math.random, variance = null) {
  if (variance != null && Number.isFinite(Number(variance))) return Number(variance);
  const u = typeof rng === "function" ? rng() : UNIT_INTERVAL_MIDPOINT;
  return VARIANCE_MIN + (VARIANCE_MAX - VARIANCE_MIN) * u;
}

export function rawAttack(primaryAttr, flat = STANDARD_ATTACK_FLAT) {
  return rawStandardAttack(primaryAttr, flat);
}

export function derivedCombatStats(level, attrs, className, {
  missionEnemy = false,
  dungeonEnemy = false,
  missionEnemyHpScale,
} = {}) {
  const archetype = combatantArchetype(className);
  const a = {
    str: Number(attrs?.strength || attrs?.str || 0),
    agi: Number(attrs?.agility || attrs?.agi || 0),
    int: Number(attrs?.intellect || attrs?.int || 0),
    vit: Number(attrs?.vitality || attrs?.vit || 0),
    luck: Number(attrs?.luck || 0),
  };
  const primary =
    archetype === "Reflex" ? a.agi : archetype === "Tech" ? a.int : a.str;
  const flat = missionEnemy && !dungeonEnemy
    ? missionEnemyBaseDamage(level)
    : STANDARD_ATTACK_FLAT;
  const missionGenerated = !!(missionEnemy && !dungeonEnemy);
  const canonical = missionGenerated
    ? rawAttack(primary, flat)
    : dungeonEnemy
      ? dungeonWormholeEnemyBaseDamage(primary)
      : playerBaseDamage(primary);
  return {
    archetype,
    damageChannel: damageChannelForArchetype(archetype),
    maxHp: missionGenerated
      ? missionEnemyMaxHp(a.vit, missionEnemyHpScale)
      : maxHp(a.vit),
    unroundedMaxHp: unroundedMaxHp(a.vit),
    crit: critChance(level, a.luck),
    dodge: dodgeChance(level, a.agi, archetype),
    resists: resistances(level, a, archetype),
    primaryValue: primary,
    intellectValue: a.int,
    vitalityValue: a.vit,
    damageBase: flat,
    standardAttack: canonical,
    canonicalDamage: canonical,
  };
}

export function resistFraction(resists, channel) {
  if (!resists || channel === DAMAGE_CHANNEL.True || channel === "TRUE") return 0;
  const key = String(channel || "").toLowerCase();
  const v = Number(resists[key] || 0);
  return Number.isFinite(v) ? Math.max(0, v) : 0;
}

export function roundCombatDamage(value) {
  return Math.max(0, roundHalfEven(value));
}

export function astralBarrierAmount(vitality, fallbackMaxHp = 0) {
  if (vitality != null && Number.isFinite(Number(vitality))) {
    return Math.max(0, roundHalfEven(ASTRAL_BARRIER_MAX_HP_FRAC * unroundedMaxHp(vitality)));
  }
  return Math.max(0, roundHalfEven(ASTRAL_BARRIER_MAX_HP_FRAC * Number(fallbackMaxHp || 0)));
}
