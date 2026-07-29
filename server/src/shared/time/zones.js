/**
 * IANA time-zone validation and helpers.
 * Never use fixed offsets (UTC-5) or abbreviations (EST/CST) as schedule identity.
 */

export const DEFAULT_GAME_ZONE = "America/New_York";

/** Common zones the admin UI may offer. Any valid IANA id is accepted at runtime. */
export const KNOWN_ZONES = Object.freeze([
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Singapore",
  "Australia/Sydney",
  "Pacific/Auckland",
]);

const _validCache = new Map();

/** Abbreviations that Intl may accept but are ambiguous / not IANA area/location ids. */
const REJECTED_ZONE_IDS = new Set([
  "EST",
  "EDT",
  "CST",
  "CDT",
  "MST",
  "MDT",
  "PST",
  "PDT",
  "BST",
  "GMT",
  "UTC+0",
  "UTC-5",
]);

/** Returns true if `timeZoneId` is a valid IANA zone for Intl. */
export function isValidTimeZone(timeZoneId) {
  if (!timeZoneId || typeof timeZoneId !== "string") return false;
  const id = timeZoneId.trim();
  if (_validCache.has(id)) return _validCache.get(id);
  // Require Area/Location form (or UTC / Etc/*). Reject abbreviations and fixed offsets.
  const okShape =
    id === "UTC" ||
    id === "Etc/UTC" ||
    id === "Etc/GMT" ||
    (/^[A-Za-z_]+\/[A-Za-z0-9_\-+]+$/.test(id) && !REJECTED_ZONE_IDS.has(id));
  if (!okShape || REJECTED_ZONE_IDS.has(id)) {
    _validCache.set(id, false);
    return false;
  }
  try {
    Intl.DateTimeFormat("en-US", { timeZone: id }).format(new Date());
    _validCache.set(id, true);
    return true;
  } catch {
    _validCache.set(id, false);
    return false;
  }
}

export function assertTimeZone(timeZoneId) {
  if (!isValidTimeZone(timeZoneId)) {
    const err = new Error(`Invalid IANA time zone: ${timeZoneId}`);
    err.code = "INVALID_TIME_ZONE";
    throw err;
  }
  return timeZoneId;
}

/** Format parts of an instant in a named zone. */
export function getZonedParts(instant, timeZoneId) {
  assertTimeZone(timeZoneId);
  const d = instant instanceof Date ? instant : new Date(instant);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timeZoneId,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  });
  const map = {};
  for (const p of fmt.formatToParts(d)) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
    weekday: map.weekday, // Sun Mon ...
  };
}

/** Calendar date YYYY-MM-DD in a named zone. */
export function zonedDateKey(instant, timeZoneId = DEFAULT_GAME_ZONE) {
  const p = getZonedParts(instant, timeZoneId);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Short zone label for display (may be EST/EDT — display only, never storage). */
export function zonedShortName(instant, timeZoneId) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timeZoneId,
      timeZoneName: "short",
    }).formatToParts(instant instanceof Date ? instant : new Date(instant));
    return parts.find((p) => p.type === "timeZoneName")?.value || timeZoneId;
  } catch {
    return timeZoneId;
  }
}
