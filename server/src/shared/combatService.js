/**
 * Authoritative combat orchestration (Restoration 08).
 * Modes supply combatants; SimulateCombat runs the shared arenaEngine loop.
 * Class passives remain in classPassives.js (Prompt 09 may expand); hooks already fire.
 */
import { nanoid } from "nanoid";
import { entities } from "../entities.js";
import { secureRandom } from "../rewards/rng.js";
import { simulateBattle } from "./combatEngine.js";
import { loadEquippedItemsForCharacter } from "./characterAttributes.js";
import { computeCombatantTotalStats } from "./statEngine.js";
import { ATTR_KEYS } from "./expectedPlayerAttributes.js";
import { generateMissionEncounter } from "../../../src/lib/missionCombat.js";
import { generateDungeonEnemy } from "../../../src/lib/dungeonEngine.js";
import { DUNGEON_PLANETS, getDungeonPlanetById } from "../../../src/lib/dungeonData.js";
import { pendingCombatMatches } from "./dungeonService.js";
import { PHASE7_CONTENT_WORMHOLE } from "./productionMath.js";
import { ARENA_DEFAULT_RATING } from "../arena/config.js";

function httpErr(status, message, code) {
  const e = new Error(message);
  e.status = status;
  if (code) e.code = code;
  throw e;
}

/** Client HUD snapshot — no internal passive runtime object. */
function publicEndState(end) {
  if (!end || typeof end !== "object") return end;
  return {
    hp: end.hp,
    barrier: end.barrier ?? 0,
    overclockStacks: Number(end.overclockStacks || 0),
    overclockActive: !!end.overclockActive,
    phantomPending: !!end.phantomPending,
    dirtyTricks: Array.isArray(end.dirtyTricks) ? end.dirtyTricks : [],
    kineticTantrum: end.kineticTantrum || null,
    defensiveProtocol: !!end.defensiveProtocol,
    acquireTarget: !!end.acquireTarget,
    openingCharges: Number(end.openingCharges || 0),
  };
}

/** Integer ATTR_KEYS map for matchup UI (EPA / effective totals). */
export function normalizeDisplayStats(stats) {
  const out = {};
  for (const k of ATTR_KEYS) {
    out[k] = Math.max(0, Math.round(Number(stats?.[k]) || 0));
  }
  return out;
}

/**
 * Final combat attributes shown in ATTRIBUTE MATCHUP.
 * PvE foes: EPA-distributed flat stats (already Stim-benchmarked in budget).
 * Arena: permanent + gear, then active Stims.
 */
export function computeCombatDisplayStats(combatant, equippedItems = []) {
  if (!combatant || typeof combatant !== "object") {
    return normalizeDisplayStats({});
  }
  return normalizeDisplayStats(computeCombatantTotalStats(combatant, equippedItems || []));
}

/** Safe enemy display fields (no client-trustable combat math overrides). */
export function publicEnemySummary(enemy, extras = {}) {
  if (!enemy || typeof enemy !== "object") return null;
  const rawStats =
    (enemy.stats && typeof enemy.stats === "object" ? enemy.stats : null)
    || (extras.displayStats && typeof extras.displayStats === "object" ? extras.displayStats : null)
    || {};
  const displayStats =
    (extras.displayStats && typeof extras.displayStats === "object" ? extras.displayStats : null)
    || (enemy.display_stats && typeof enemy.display_stats === "object" ? enemy.display_stats : null)
    || rawStats;
  return {
    id: enemy.id,
    name: enemy.name,
    level: enemy.level,
    class: enemy.class,
    race: enemy.race,
    power: enemy.power,
    speciesId: enemy.speciesId ?? enemy.species_id,
    dungeonEnemy: !!enemy.dungeonEnemy,
    missionEnemy: !!enemy.missionEnemy,
    boss: !!(enemy.boss || enemy.isBoss),
    isBoss: !!(enemy.boss || enemy.isBoss),
    appearance: enemy.appearance || null,
    avatar_config: enemy.avatar_config || enemy.avatarConfig || null,
    /** Hidden combat archetype — used for EPA display fallback / family rules. */
    missionEnemyArchetype: enemy.missionEnemyArchetype || null,
    dungeonEnemyArchetype: enemy.dungeonEnemyArchetype || null,
    /** Permanent / EPA-allocated attrs used in the sim. */
    stats: normalizeDisplayStats(rawStats),
    /** Final matchup totals (gear + Stims when applicable). */
    display_stats: normalizeDisplayStats(displayStats),
  };
}

/**
 * Build a committed combat payload (no reusable RNG seed).
 * @param {object} battle — simulateBattle result
 */
export function buildCombatResult(battle, {
  mode,
  encounterId = "",
  enemy = null,
  characterId = "",
  player = null,
  playerItems = [],
  opponentItems = [],
} = {}) {
  const combatId = nanoid(16);
  const events = Array.isArray(battle.events) ? battle.events : [];
  const enemyDisplay = computeCombatDisplayStats(enemy, opponentItems);
  const playerDisplay = player
    ? computeCombatDisplayStats(player, playerItems)
    : null;
  return {
    combat_id: combatId,
    mode: mode || "combat",
    encounter_id: encounterId || "",
    character_id: characterId || "",
    winner: battle.winner,
    opening_side: battle.initiativeFirstSide || null,
    turn_count: events.filter(
      (e) => e?.type === "attack" || e?.type === "dodge" || e?.type === "miss",
    ).length,
    telemetry: battle.telemetry || null,
    content: battle.content || mode || "combat",
    events,
    playerMaxHp: battle.playerMaxHp,
    opponentMaxHp: battle.opponentMaxHp,
    playerEnd: publicEndState(battle.playerEnd),
    opponentEnd: publicEndState(battle.opponentEnd),
    player_display_stats: playerDisplay,
    enemy: publicEnemySummary(enemy, { displayStats: enemyDisplay }) || enemy || null,
    /** Full enemy snapshot kept server-side for settlement (species, etc.). */
    _enemy_full: enemy || null,
    committed_at: new Date().toISOString(),
  };
}

/** Client-safe view of a committed combat (hide internal snapshot). */
export function publicCombatResult(combat) {
  if (!combat || typeof combat !== "object") return null;
  const { _enemy_full, ...rest } = combat;
  const fullEnemy = combat._enemy_full || combat.enemy || null;
  const enemyDisplay =
    (combat.enemy && typeof combat.enemy.display_stats === "object" && combat.enemy.display_stats)
    || (fullEnemy && typeof fullEnemy.display_stats === "object" && fullEnemy.display_stats)
    || (fullEnemy ? computeCombatDisplayStats(fullEnemy, []) : null);
  const playerDisplay =
    (combat.player_display_stats && typeof combat.player_display_stats === "object"
      ? normalizeDisplayStats(combat.player_display_stats)
      : null);
  void _enemy_full;
  return {
    ...rest,
    player_display_stats: playerDisplay,
    enemy: publicEnemySummary(fullEnemy, { displayStats: enemyDisplay }) || combat.enemy || null,
    battle: {
      winner: combat.winner,
      events: combat.events || [],
      playerMaxHp: combat.playerMaxHp,
      opponentMaxHp: combat.opponentMaxHp,
      initiativeFirstSide: combat.opening_side,
      playerEnd: combat.playerEnd,
      opponentEnd: combat.opponentEnd,
      player_display_stats: playerDisplay,
    },
  };
}

/**
 * Shared simulator entry — equivalent combatants + deterministic rng → same outcome.
 * Does not trust client HP/damage/winner.
 */
export function SimulateCombat({
  player,
  opponent,
  playerItems = [],
  opponentItems = [],
  rng = secureRandom,
  opts = {},
  mode = "combat",
  encounterId = "",
} = {}) {
  if (!player || !opponent) {
    httpErr(400, "Missing combatants", "VALIDATION_ERROR");
  }
  const battle = simulateBattle(player, opponent, playerItems, opponentItems, {
    ...opts,
    rng,
    content: opts.content || mode,
    mode,
  });
  return buildCombatResult(battle, {
    mode,
    encounterId,
    enemy: opponent,
    characterId: player.id || "",
    player,
    playerItems,
    opponentItems,
  });
}

export function loadPlayerEquipped(character) {
  return loadEquippedItemsForCharacter(character?.id);
}

/** Max hit dealt by player from committed events (server-derived). */
export function maxPlayerHitFromCombat(combat) {
  let max = 0;
  for (const ev of combat?.events || []) {
    if (ev?.attacker !== "player") continue;
    const d = Number(ev.damage || ev.finalDamage || 0);
    if (d > max) max = d;
  }
  return max;
}

/** Mission soft encounter + sim (server RNG). */
export function simulateMissionCombat(character, mission, rng = secureRandom) {
  const enemy = generateMissionEncounter(character, mission, rng);
  const items = loadPlayerEquipped(character);
  return SimulateCombat({
    player: character,
    opponent: enemy,
    playerItems: items,
    opponentItems: [],
    rng,
    mode: "mission",
    encounterId: mission?.id || "",
  });
}

/** Resolve planet object for dungeon/wormhole enemy generation. */
export function resolveDungeonPlanet(planetId) {
  const id = Math.max(1, Math.floor(Number(planetId) || 1));
  try {
    return getDungeonPlanetById(id) || DUNGEON_PLANETS[0] || { id };
  } catch {
    return DUNGEON_PLANETS.find((p) => Number(p.id) === id) || { id };
  }
}

/** Dungeon / wormhole foe + sim. */
export function simulateDungeonCombat(
  character,
  { target, planetId, enemyIndex, rng = secureRandom } = {},
) {
  const resolved = target || {
    content: Number(planetId) > 10 ? "wormhole" : "dungeon",
    dungeonId: planetId,
    encounterNumber: enemyIndex,
    wormholeIndex: 0,
  };
  const enemy = generateDungeonEnemy({
    content: resolved.content,
    dungeonId: resolved.dungeonId || 1,
    encounterNumber: resolved.encounterNumber || 1,
    wormholeIndex: resolved.wormholeIndex || 0,
  });
  const items = loadPlayerEquipped(character);
  return SimulateCombat({
    player: character,
    opponent: enemy,
    playerItems: items,
    opponentItems: [],
    rng,
    mode: resolved.content === PHASE7_CONTENT_WORMHOLE ? "wormhole" : "dungeon",
    encounterId: enemy.id,
  });
}

/** Persist combat onto a Mission document for ClaimMission. Idempotent. */
export function commitMissionCombat(missionId, combatResult) {
  const mission = entities.Mission.get(missionId);
  if (!mission) httpErr(404, "Mission not found", "NOT_FOUND");
  return entities.Mission.update(missionId, {
    combat_result: combatResult,
    combat_id: combatResult.combat_id,
  });
}

export function readMissionCombat(mission) {
  return mission?.combat_result && typeof mission.combat_result === "object"
    ? mission.combat_result
    : null;
}

/**
 * Prepare (or replay) mission combat. Never trusts client combatants/winner.
 */
export function prepareMissionCombatForCharacter(character, mission, rng = secureRandom) {
  const existing = readMissionCombat(mission);
  if (existing?.combat_id && existing?.winner && Array.isArray(existing.events)) {
    return { combat: existing, replay: true, mission };
  }
  const combat = simulateMissionCombat(character, mission, rng);
  const updated = commitMissionCombat(mission.id, combat);
  return { combat, replay: false, mission: updated };
}

/** Persist pending dungeon combat on Character (cleared on Finish). */
export function commitDungeonPendingCombat(characterId, combatResult, meta = {}) {
  return entities.Character.update(characterId, {
    dungeon_pending_combat: {
      ...combatResult,
      meta: { ...meta },
    },
  });
}

export function readDungeonPendingCombat(character) {
  const p = character?.dungeon_pending_combat;
  return p && typeof p === "object" && p.combat_id ? p : null;
}

export function clearDungeonPendingCombat(characterId, extraPatch = {}) {
  return entities.Character.update(characterId, {
    ...extraPatch,
    dungeon_pending_combat: null,
  });
}

/** Persist pending Arena combat on Character (cleared on Finish). */
export function commitArenaPendingCombat(characterId, combatResult, meta = {}) {
  return entities.Character.update(characterId, {
    arena_pending_combat: {
      ...combatResult,
      meta: {
        offer_id: meta.offerId || null,
        challenge_id: meta.challengeId || null,
        arena_bot_id: meta.arenaBotId || null,
        real_character_id: meta.realCharacterId || null,
        is_bot: !!meta.isBot,
        opponent_rating: meta.opponentRating ?? ARENA_DEFAULT_RATING,
        opponent_summary: meta.opponentSummary || null,
        skip_cooldown: !!meta.skipCooldown,
        skip_paid: !!meta.skipPaid,
        skip_nova: Math.max(0, Math.floor(Number(meta.skipNova) || 0)),
      },
    },
  });
}

export function readArenaPendingCombat(character) {
  const p = character?.arena_pending_combat;
  return p && typeof p === "object" && p.combat_id ? p : null;
}

export function clearArenaPendingCombat(characterId, extraPatch = {}) {
  return entities.Character.update(characterId, {
    ...extraPatch,
    arena_pending_combat: null,
  });
}

/**
 * Simulate Arena PvP with shared engine (normal player caps, class passives).
 * Never trusts client combatants/winner.
 */
export function simulateArenaCombat(
  character,
  opponent,
  { playerItems = null, opponentItems = [], rng = secureRandom, encounterId = "" } = {},
) {
  const items = playerItems ?? loadPlayerEquipped(character);
  return SimulateCombat({
    player: character,
    opponent,
    playerItems: items,
    opponentItems: opponentItems || [],
    rng,
    mode: "arena",
    encounterId: encounterId || `arena-${character?.id || "p"}`,
  });
}

export function pendingArenaCombatConflicts(pending, { offerId = "", challengeId = "" } = {}) {
  if (!pending?.combat_id || !pending?.winner) return false;
  const meta = pending.meta || {};
  if (offerId && String(meta.offer_id || "") === String(offerId)) return false;
  if (challengeId && String(meta.challenge_id || "") === String(challengeId)) return false;
  return true;
}

/**
 * Prepare (or replay) Arena combat for a committed offer or direct challenge.
 */
export function prepareArenaCombatForCharacter(
  character,
  {
    offerId = "",
    challengeId = "",
    combatant,
    opponentItems = [],
    opponentSummary = null,
    arenaBotId = null,
    realCharacterId = null,
    isBot = false,
    opponentRating = ARENA_DEFAULT_RATING,
    skipCooldown = false,
    skipPaid = false,
    skipNova = 0,
    applyBeforeCommit = null,
    rng = secureRandom,
  } = {},
) {
  const pending = readArenaPendingCombat(character);
  const meta = pending?.meta || {};
  const sameOffer = offerId && String(meta.offer_id || "") === String(offerId || "");
  const sameChallenge = challengeId && String(meta.challenge_id || "") === String(challengeId || "");
  if (
    pending?.combat_id &&
    pending?.winner &&
    Array.isArray(pending.events) &&
    (sameOffer || sameChallenge)
  ) {
    return { combat: pending, replay: true, character };
  }
  if (pendingArenaCombatConflicts(pending, { offerId, challengeId })) {
    const e = new Error("Finish or recover the pending Arena fight first");
    e.status = 409;
    e.code = "ARENA_PENDING_COMBAT";
    throw e;
  }
  const encounterKey = challengeId
    ? `arena-challenge-${challengeId}`
    : `arena-offer-${offerId || nanoid(8)}`;
  const combat = simulateArenaCombat(character, combatant, {
    opponentItems,
    rng,
    encounterId: encounterKey,
  });
  if (typeof applyBeforeCommit === "function") {
    applyBeforeCommit(character, combat);
  }
  const updated = commitArenaPendingCombat(character.id, combat, {
    offerId,
    challengeId,
    arenaBotId,
    realCharacterId,
    isBot,
    opponentRating,
    opponentSummary,
    skipCooldown,
    skipPaid,
    skipNova,
  });
  return {
    combat: updated.arena_pending_combat || combat,
    replay: false,
    character: updated,
  };
}

/**
 * Prepare (or replay) dungeon combat for the given encounter keys.
 */
export function prepareDungeonCombatForCharacter(
  character,
  { target, planetId, enemyIndex, viewingWormhole = false, rng = secureRandom } = {},
) {
  const resolved = target || {
    content: viewingWormhole ? PHASE7_CONTENT_WORMHOLE : "dungeon",
    dungeonId: planetId,
    encounterNumber: enemyIndex,
    wormholeIndex: 0,
  };
  const pending = readDungeonPendingCombat(character);
  if (pendingCombatMatches(pending, resolved)) {
    return { combat: pending, replay: true, character };
  }
  const combat = simulateDungeonCombat(character, { target: resolved, rng });
  const updated = commitDungeonPendingCombat(character.id, combat, {
    content: resolved.content,
    dungeon_id: resolved.dungeonId,
    encounter_number: resolved.encounterNumber,
    wormhole_index: resolved.wormholeIndex,
    viewing_wormhole: resolved.content === PHASE7_CONTENT_WORMHOLE,
    planet_id: resolved.dungeonId,
    enemy_index: resolved.encounterNumber,
  });
  return { combat, replay: false, character: updated };
}
