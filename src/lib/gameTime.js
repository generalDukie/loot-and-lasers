// Central game-clock helper. All daily resets (daily login, arena attempts,
// dungeon deaths) roll over at midnight Eastern Time, which automatically
// observes US daylight saving (EST ↔ EDT) via the America/New_York zone.
// Client and server share this exact logic so they always agree on "today".
export function todayET() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

/** Milliseconds until the next Eastern Time midnight (quota rollover). */
export function msUntilNextETMidnight(from = Date.now()) {
  const startDay = new Date(from).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  let lo = from;
  let hi = from + 26 * 60 * 60 * 1000;
  while (hi - lo > 250) {
    const mid = Math.floor((lo + hi) / 2);
    const day = new Date(mid).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    if (day === startDay) lo = mid;
    else hi = mid;
  }
  return Math.max(0, hi - from);
}

/** Compact countdown for quota chips — e.g. "5h 12m" or "42m". */
export function formatEtaShort(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return "<1m";
}