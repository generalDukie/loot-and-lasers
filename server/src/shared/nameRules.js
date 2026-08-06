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

export function assertNameHasNoDigits(name, label = "Name") {
  if (nameHasDigits(name)) {
    const err = new Error(`${label} cannot contain numbers`);
    err.status = 400;
    throw err;
  }
}

export function assertNameHasNoSpaces(name, label = "Name") {
  if (nameHasWhitespace(name)) {
    const err = new Error(NAME_NO_SPACES_MSG);
    err.status = 400;
    throw err;
  }
}
