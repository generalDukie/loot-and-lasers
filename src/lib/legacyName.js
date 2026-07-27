/** How the account legacy name appears on public/hero profiles. */
export const LEGACY_DISPLAY_SURNAME = "surname";
export const LEGACY_DISPLAY_FAMILY = "family";

export function normalizeLegacyDisplay(mode) {
  return mode === LEGACY_DISPLAY_FAMILY ? LEGACY_DISPLAY_FAMILY : LEGACY_DISPLAY_SURNAME;
}

export function familyLabel(legacyName) {
  const last = (legacyName || "").trim();
  return last ? `the ${last} family` : "";
}

/**
 * Everyday / HUD name — keeps the operative first name readable.
 * Surname mode: "First Last". Family mode: first name only (family line is for profiles).
 */
export function fullName(character) {
  if (!character) return "";
  const first = character.name || "";
  const last = character.legacy_name || "";
  const mode = normalizeLegacyDisplay(character.legacy_display);
  if (!last || mode === LEGACY_DISPLAY_FAMILY) return first;
  return `${first} ${last}`;
}

/**
 * Profile headline — surname as last name, or "the ____ family" instead of the
 * operative display name when family mode is selected.
 */
export function profileDisplayName(character) {
  if (!character) return "";
  const first = character.name || "";
  const last = (character.legacy_name || "").trim();
  const mode = normalizeLegacyDisplay(character.legacy_display);
  if (mode === LEGACY_DISPLAY_FAMILY && last) return familyLabel(last);
  if (last) return `${first} ${last}`;
  return first;
}
