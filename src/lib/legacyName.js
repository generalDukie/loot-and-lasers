/** How the account legacy name appears on public/hero profiles. */
export const LEGACY_DISPLAY_SURNAME = "surname";
export const LEGACY_DISPLAY_FAMILY = "family";

export function normalizeLegacyDisplay(mode) {
  return mode === LEGACY_DISPLAY_FAMILY ? LEGACY_DISPLAY_FAMILY : LEGACY_DISPLAY_SURNAME;
}

/** Strip JSON/Godot null sentinels so names never show "null" / "<null>". */
export function cleanNameText(value) {
  if (value == null) return "";
  const s = String(value).trim();
  if (!s) return "";
  const low = s.toLowerCase();
  if (low === "null" || low === "<null>" || low === "nil" || low === "undefined") return "";
  return s;
}

export function familyLabel(legacyName) {
  const last = cleanNameText(legacyName);
  return last ? `The ${last} Family` : "";
}

/**
 * Catch-up prompt (Home / hub): the account already runs multiple operatives
 * but predates the surname system, so nothing ties them together yet.
 */
export function needsLegacyName(user, characterCount = 0) {
  const existing = cleanNameText(user?.legacy_name);
  if (existing) return false;
  return Math.max(0, Number(characterCount) || 0) >= 2;
}

/**
 * Create flow: the surname is mandatory from the second operative onward, so
 * one existing character is already enough to require it.
 */
export function needsLegacyNameForCreate(user, existingCharacterCount = 0) {
  const existing = cleanNameText(user?.legacy_name);
  if (existing) return false;
  return Math.max(0, Number(existingCharacterCount) || 0) >= 1;
}

/**
 * Everyday / HUD name — keeps the operative first name readable.
 * Surname mode: "First Last". Family mode: first name only (family line is for hero/profile).
 */
export function fullName(character, accountLegacyName = "") {
  if (!character) return "";
  const first = cleanNameText(character.name);
  const last =
    cleanNameText(character.legacy_name) || cleanNameText(accountLegacyName);
  const mode = normalizeLegacyDisplay(character.legacy_display);
  if (!last || mode === LEGACY_DISPLAY_FAMILY) return first;
  if (!first) return last;
  return `${first} ${last}`;
}

/**
 * Small line under the hero gear pane in family mode.
 * Empty in surname mode (surname already appears after the operative name).
 */
export function heroFamilyLine(character, accountLegacyName = "") {
  if (!character) return "";
  const last =
    cleanNameText(character.legacy_name) || cleanNameText(accountLegacyName);
  const mode = normalizeLegacyDisplay(character.legacy_display);
  if (mode !== LEGACY_DISPLAY_FAMILY || !last) return "";
  return familyLabel(last);
}

/**
 * Public profile headline — always keeps the account recognizable.
 * Surname mode: "First Last". Family mode: "The X Family" (operative name shown beneath).
 */
export function profileDisplayName(character, accountLegacyName = "") {
  if (!character) return "";
  const first = cleanNameText(character.name);
  const last =
    cleanNameText(character.legacy_name) || cleanNameText(accountLegacyName);
  const mode = normalizeLegacyDisplay(character.legacy_display);
  if (mode === LEGACY_DISPLAY_FAMILY && last) return familyLabel(last);
  if (last) return first ? `${first} ${last}` : last;
  return first;
}
