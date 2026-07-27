import { api } from "@/api/gameClient";

// The defending guild becomes vulnerable after holding the Nexus this long.
export const NEXUS_HOLD_HOURS = 24;
export const NEXUS_ASSAULT_COOLDOWN_MS = 30 * 60 * 1000;
export const NEXUS_MIN_GUILD_LEVEL = 3;
export const NEXUS_MIN_MEMBERS = 5;
export const NEXUS_MIN_POWER = 500;

// Fetch the singleton Nexus state (or null if not yet seeded).
// Home mounts several components that each call this on load; without
// deduping, the concurrent burst trips the platform's per-account rate
// limit (even past the client's own retry). The short cache + in-flight
// promise collapse near-simultaneous calls into a single request.
let _nexusCache = null;
let _nexusCacheAt = 0;
let _nexusInFlight = null;
const NEXUS_TTL = 15000;

export async function getNexusState({ force = false } = {}) {
  const now = Date.now();
  if (!force && _nexusCache && now - _nexusCacheAt < NEXUS_TTL) return _nexusCache;
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
export function isNexusVulnerable(nexus, now = Date.now()) {
  if (!nexus || !nexus.owner_guild_id) return true;
  if (nexus.status === "vulnerable") return true;
  const heldMs = now - new Date(nexus.captured_at).getTime();
  return heldMs >= NEXUS_HOLD_HOURS * 3600 * 1000;
}

export function hoursUntilVulnerable(nexus, now = Date.now()) {
  if (!nexus || !nexus.owner_guild_id) return 0;
  const heldMs = now - new Date(nexus.captured_at).getTime();
  const remaining = NEXUS_HOLD_HOURS * 3600 * 1000 - heldMs;
  return Math.max(0, Math.ceil(remaining / 3600000));
}

export function timeHeldMs(capturedAt, now = Date.now()) {
  if (!capturedAt) return 0;
  return Math.max(0, now - new Date(capturedAt).getTime());
}

export function formatReign(capturedAt, now = Date.now()) {
  const ms = timeHeldMs(capturedAt, now);
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  if (days > 0) return `${days}d ${hours}h`;
  const mins = Math.floor((ms % 3600000) / 60000);
  return `${hours}h ${mins}m`;
}

export function isEligible(guild, members, power) {
  if (!guild) return { ok: false, reason: "You are not in a guild." };
  if ((guild.level || 1) < NEXUS_MIN_GUILD_LEVEL) return { ok: false, reason: `Guild level ${NEXUS_MIN_GUILD_LEVEL} required.` };
  if ((members || []).length < NEXUS_MIN_MEMBERS) return { ok: false, reason: `${NEXUS_MIN_MEMBERS} active members required.` };
  if ((power || 0) < NEXUS_MIN_POWER) return { ok: false, reason: `Guild power ${NEXUS_MIN_POWER} required.` };
  return { ok: true };
}

// Returns true if the given guild is the current Nexus owner.
export function ownsNexus(nexus, guildId) {
  return !!(nexus && guildId && nexus.owner_guild_id === guildId);
}