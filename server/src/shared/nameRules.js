/** Shared rules for player-chosen display names (operative, legacy, guild). */

export const NAME_NO_DIGITS_MSG = "Names cannot contain numbers";

export function nameHasDigits(name) {
  return /\d/.test(String(name ?? ""));
}

export function assertNameHasNoDigits(name, label = "Name") {
  if (nameHasDigits(name)) {
    const err = new Error(`${label} cannot contain numbers`);
    err.status = 400;
    throw err;
  }
}
