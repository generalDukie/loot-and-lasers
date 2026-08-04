import { entities } from "./entities.js";

export const GameplayContextCodes = Object.freeze({
  UNAUTHENTICATED: "UNAUTHENTICATED",
  CHARACTER_NOT_FOUND: "CHARACTER_NOT_FOUND",
  NO_SELECTED_CHARACTER: "NO_SELECTED_CHARACTER",
  CHARACTER_NOT_OWNED: "CHARACTER_NOT_OWNED",
});

export function gameplayError(status, message, code, details = undefined) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  if (details !== undefined) err.details = details;
  return err;
}

/**
 * Resolve a Character only from the authenticated Node account.
 * Explicit ids are accepted solely for endpoints whose contract requires them;
 * they never bypass ownership validation.
 */
export function resolveSelectedCharacter(
  user,
  { explicitId = "", required = true } = {},
) {
  if (!user?.id) {
    throw gameplayError(
      401,
      "Unauthorized",
      GameplayContextCodes.UNAUTHENTICATED,
    );
  }

  const owned = entities.Character.filter(
    { created_by_id: user.id },
    "-created_date",
    50,
  );
  if (!owned.length) {
    if (!required) return null;
    throw gameplayError(
      404,
      "No character",
      GameplayContextCodes.CHARACTER_NOT_FOUND,
    );
  }

  const characterId = String(explicitId || user.active_character_id || "").trim();
  if (!characterId) {
    if (!required) return null;
    throw gameplayError(
      409,
      "No selected character",
      GameplayContextCodes.NO_SELECTED_CHARACTER,
    );
  }

  const character = entities.Character.get(characterId);
  if (!character) {
    throw gameplayError(
      404,
      "Character not found",
      GameplayContextCodes.CHARACTER_NOT_FOUND,
    );
  }
  if (character.created_by_id !== user.id) {
    throw gameplayError(
      403,
      "Selected character is not owned by this account",
      GameplayContextCodes.CHARACTER_NOT_OWNED,
    );
  }
  return character;
}

