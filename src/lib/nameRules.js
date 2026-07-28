/** Shared rules for player-chosen display names (operative, legacy, guild). */

export const NAME_NO_DIGITS_MSG = "Names cannot contain numbers";

export function nameHasDigits(name) {
  return /\d/.test(String(name ?? ""));
}

/** Strip ASCII digits from a name draft (for controlled inputs). */
export function stripDigitsFromName(value) {
  return String(value ?? "").replace(/\d/g, "");
}

/**
 * @returns {string|null} Error message, or null if ok.
 */
export function validatePlayerName(name, { min = 2, max = 24, label = "Name" } = {}) {
  const trimmed = String(name ?? "").trim();
  if (trimmed.length < min) return `${label} must be at least ${min} characters.`;
  if (trimmed.length > max) return `${label} must be ${max} characters or fewer.`;
  if (nameHasDigits(trimmed)) return NAME_NO_DIGITS_MSG;
  return null;
}
