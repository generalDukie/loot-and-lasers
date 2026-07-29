/**
 * Direct-challenge opponent eligibility (server-side only).
 */

import { entities } from "../entities.js";
import { getUserById } from "../auth.js";
import { ArenaError, ArenaErrors } from "./errors.js";

const TEST_EMAIL_RE = /@(test|example|localhost)\./i;

export function isExcludedTestAccount(user) {
  if (!user) return true;
  if (user.exclude_from_arena || user.is_test || user.is_dev) return true;
  if (user.email && TEST_EMAIL_RE.test(user.email)) return true;
  return false;
}

export function isArenaBanned(characterId) {
  const list = entities.PlayerModeration.filter({ character_id: characterId }, "-created_date", 5);
  for (const m of list || []) {
    if (m.arena_banned || m.arena_suspended) return true;
    if (m.suspended_until && new Date(m.suspended_until).getTime() > Date.now()) return true;
  }
  return false;
}

export function buildDefenseSnapshot(opponentChar) {
  if (!opponentChar?.id) return null;
  const equipped = entities.Item.filter(
    { character_id: opponentChar.id, is_equipped: true },
    "-created_date",
    20
  );
  return {
    characterId: opponentChar.id,
    name: opponentChar.name,
    race: opponentChar.race,
    class: opponentChar.class,
    level: opponentChar.level || 1,
    arena_rating: opponentChar.arena_rating || 1000,
    arena_wins: opponentChar.arena_wins || 0,
    arena_losses: opponentChar.arena_losses || 0,
    stats: opponentChar.stats || {},
    appearance: opponentChar.appearance || {},
    avatar_url: opponentChar.avatar_url || null,
    active_title: opponentChar.active_title || null,
    equippedItems: (equipped || []).map((it) => ({
      id: it.id,
      name: it.name,
      type: it.type,
      rarity: it.rarity,
      base_name: it.base_name,
      stats: it.stats || {},
      level: it.level,
    })),
    capturedAt: new Date().toISOString(),
  };
}

/**
 * Resolve and validate opponent for a direct challenge.
 * Throws ArenaError with stable codes.
 */
export function resolveEligibleOpponent({
  challengerUser,
  challengerChar,
  opponentCharacterId,
}) {
  if (!opponentCharacterId) {
    throw new ArenaError(
      ArenaErrors.ARENA_INVALID_REQUEST,
      "opponentCharacterId required"
    );
  }
  if (opponentCharacterId === challengerChar.id) {
    throw new ArenaError(
      ArenaErrors.ARENA_CANNOT_CHALLENGE_SELF,
      "Cannot challenge your own character"
    );
  }

  const opponent = entities.Character.get(opponentCharacterId);
  if (!opponent || opponent.deleted || opponent.is_deleted) {
    throw new ArenaError(
      ArenaErrors.ARENA_OPPONENT_NOT_ELIGIBLE,
      "Opponent not found or deleted",
      404
    );
  }

  const oppAccountId = opponent.created_by_id;
  if (!oppAccountId) {
    throw new ArenaError(
      ArenaErrors.ARENA_OPPONENT_NOT_ELIGIBLE,
      "Opponent account unavailable"
    );
  }
  if (oppAccountId === challengerUser.id) {
    throw new ArenaError(
      ArenaErrors.ARENA_SAME_ACCOUNT_CHALLENGE,
      "Cannot challenge another character on your account"
    );
  }

  const oppUser = getUserById(oppAccountId);
  if (!oppUser) {
    throw new ArenaError(
      ArenaErrors.ARENA_OPPONENT_NOT_ELIGIBLE,
      "Opponent account missing"
    );
  }
  if (isExcludedTestAccount(oppUser) && process.env.NODE_ENV === "production") {
    throw new ArenaError(
      ArenaErrors.ARENA_OPPONENT_NOT_ELIGIBLE,
      "Opponent not eligible"
    );
  }

  if (isArenaBanned(opponent.id) || isArenaBanned(challengerChar.id)) {
    throw new ArenaError(
      ArenaErrors.ARENA_OPPONENT_NOT_ELIGIBLE,
      "Arena access restricted"
    );
  }

  // Ranked = has participated or has a rating (default 1000 still counts as ranked).
  const rating = Number(opponent.arena_rating);
  if (!Number.isFinite(rating) && opponent.arena_rating != null) {
    throw new ArenaError(
      ArenaErrors.ARENA_OPPONENT_NOT_ELIGIBLE,
      "Opponent has invalid arena rating"
    );
  }

  const defense = buildDefenseSnapshot(opponent);
  if (!defense) {
    throw new ArenaError(
      ArenaErrors.ARENA_DEFENSE_SNAPSHOT_UNAVAILABLE,
      "Defense snapshot unavailable"
    );
  }

  return {
    opponent,
    opponentAccountId: oppAccountId,
    opponentUser: oppUser,
    defenseSnapshot: defense,
    opponentRating: opponent.arena_rating || 1000,
  };
}

export function assertOwnsCharacter(user, characterId) {
  const ch = entities.Character.get(characterId);
  if (!ch || ch.created_by_id !== user.id) {
    throw new ArenaError(
      ArenaErrors.ARENA_CHARACTER_NOT_OWNED,
      "Not your character",
      403
    );
  }
  return ch;
}

/** Safe public fields for rankings / challenge preview. */
export function publicArenaCard(char, extras = {}) {
  if (!char) return null;
  return {
    characterId: char.id,
    name: char.name,
    race: char.race,
    class: char.class,
    level: char.level || 1,
    arenaRating: char.arena_rating || 1000,
    arenaWins: char.arena_wins || 0,
    arenaLosses: char.arena_losses || 0,
    activeTitle: char.active_title || null,
    ...extras,
  };
}
