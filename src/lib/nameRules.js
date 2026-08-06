/** Shared rules for player-chosen display names (operative, legacy, guild). */

export const NAME_NO_DIGITS_MSG = "Names cannot contain numbers";
export const NAME_NO_SPACES_MSG = "Names cannot contain spaces";

export function nameHasDigits(name) {
  return /\d/.test(String(name ?? ""));
}

/** Any whitespace (space, tab, newline, etc.) — operative names only. */
export function nameHasWhitespace(name) {
  return /\s/.test(String(name ?? ""));
}

/** Strip ASCII digits from a name draft (for controlled inputs). */
export function stripDigitsFromName(value) {
  return String(value ?? "").replace(/\d/g, "");
}

/**
 * Operative / character display name (create + rename).
 * @returns {string|null} Error message, or null if ok.
 */
export function validatePlayerName(name, { min = 2, max = 24, label = "Name" } = {}) {
  const trimmed = String(name ?? "").trim();
  if (trimmed.length < min) return `${label} must be at least ${min} characters.`;
  if (trimmed.length > max) return `${label} must be ${max} characters or fewer.`;
  if (nameHasDigits(trimmed)) return NAME_NO_DIGITS_MSG;
  if (nameHasWhitespace(trimmed)) return NAME_NO_SPACES_MSG;
  return null;
}
