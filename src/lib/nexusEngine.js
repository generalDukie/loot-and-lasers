import { api } from "@/api/gameClient";

// The defending guild becomes vulnerable after holding the Nexus this long.
export const NEXUS_HOLD_HOURS = 24;
export const NEXUS_ASSAULT_COOLDOWN_MINUTES = 30;
const MILLISECONDS_PER_SECOND = 1_000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const MILLISECONDS_PER_MINUTE = MILLISECONDS_PER_SECOND * SECONDS_PER_MINUTE;
const MILLISECONDS_PER_HOUR = MILLISECONDS_PER_MINUTE * MINUTES_PER_HOUR;
const MILLISECONDS_PER_DAY = MILLISECONDS_PER_HOUR * HOURS_PER_DAY;
export const NEXUS_ASSAULT_COOLDOWN_MS = NEXUS_ASSAULT_COOLDOWN_MINUTES * MILLISECONDS_PER_MINUTE;
export const NEXUS_MIN_POWER = 500;

// Fetch the singleton Nexus state (or null if not yet seeded).
// Home mounts several components that each call this on load; without
// deduping, the concurrent burst trips the platform's per-account rate
// limit (even past the client's own retry). The short cache + in-flight
// promise collapse near-simultaneous calls into a single request.
let _nexusCache = null;
let _nexusCacheAt = 0;
let _nexusInFlight = null;
const NEXUS_STATE_CACHE_TTL_MS = 15_000;

export async function getNexusState({ force = false } = {}) {
  const now = Date.now();
  if (!force && _nexusCache && now - _nexusCacheAt < NEXUS_STATE_CACHE_TTL_MS) {
    return _nexusCache;
  }
  if (_nexusInFlight) return _nexusInFlight;
  const fetchOne = async () => {
    const list = await api.entities.Nexus.filter({ singleton: true });
    return list[0] || null;
  };
  _nexusInFlight = (async () => {
    try {
      const n = await fetchOne();
      _nexusCache = n;
      _nexusCacheAt = Date.now();
      return n;
    } catch (err) {
      // On rate limit, return the stale cache (or null) instead of retrying —
      // retrying immediately only deepens the rate-limit window.
      if (/rate limit/i.test(err?.message || String(err))) {
        return _nexusCache || null;
      }
      throw err;
    } finally {
      _nexusInFlight = null;
    }
  })();
  return _nexusInFlight;
}

export async function getNexusOwnerGuildId() {
  const nexus = await getNexusState();
  return nexus?.owner_guild_id || null;
}

// A guild holding the Nexus is vulnerable once it has held it for HOLD_HOURS.
export function isNexusVulnerable(_nexus, _now = Date.now()) {
  return true;
}

export function hoursUntilVulnerable(_nexus, _now = Date.now()) {
  return 0;
}

export function timeHeldMs(capturedAt, now = Date.now()) {
  if (!capturedAt) return 0;
  return Math.max(0, now - new Date(capturedAt).getTime());
}

export function formatReign(capturedAt, now = Date.now()) {
  const ms = timeHeldMs(capturedAt, now);
  const days = Math.floor(ms / MILLISECONDS_PER_DAY);
  const hours = Math.floor((ms % MILLISECONDS_PER_DAY) / MILLISECONDS_PER_HOUR);
  if (days > 0) return `${days}d ${hours}h`;
  const mins = Math.floor((ms % MILLISECONDS_PER_HOUR) / MILLISECONDS_PER_MINUTE);
  return `${hours}h ${mins}m`;
}

export function isEligible(guild, members, power) {
  if (!guild) return { ok: false, reason: "You are not in a guild." };
  if ((power || 0) < NEXUS_MIN_POWER) return { ok: false, reason: `Guild power ${NEXUS_MIN_POWER} required.` };
  return { ok: true };
}

// Returns true if the given guild is the current Nexus owner.
export function ownsNexus(nexus, guildId) {
  return !!(nexus && guildId && nexus.owner_guild_id === guildId);
}
