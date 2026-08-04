import { api } from "@/api/gameClient";
import { getCurrentUserId, getCurrentUser } from "@/lib/currentUser";

// Short-lived cache + backoff retry for the most frequently-called fetch.
// Many pages/engines call getMyCharacter() on mount and on intervals; without
// deduping, rapid bursts trip the platform's per-account rate limit. The cache
// collapses near-simultaneous calls into one, and the retry recovers transient
// 429s so a single throttled request no longer crashes the page.
//
// The cache is KEYED BY USER ID so a character belonging to one account can
// never be served to a different account — the previous unkeyed cache would
// hand back whichever character it fetched last, leaking it across users on
// any cache hit.
let _meCache = null;       // { userId, char, at }
let _meInFlight = null;    // { userId, promise }
const ME_TTL = 10000;

// Resolve the current user id from the AuthContext-synced snapshot (always
// current — no stale cache), falling back to api.auth.me() only before the
// context has initialized (e.g. first paint).
async function currentUserId() {
  const uid = getCurrentUserId();
  if (uid) return uid;
  const user = await api.auth.me();
  return user.id;
}

export async function getMyCharacter({ force = false } = {}) {
  const uid = await currentUserId();
  const now = Date.now();
  if (!force && _meCache && _meCache.userId === uid && now - _meCache.at < ME_TTL) {
    return _meCache.char;
  }
  if (_meInFlight && _meInFlight.userId === uid) return _meInFlight.promise;
  const fetchOne = async () => {
    // Prefer the user's chosen active character (stored on the user record).
    const me = getCurrentUser() || (await api.auth.me().catch(() => null));
    const activeId = me?.active_character_id || null;
    let ch = null;
    if (activeId) {
      try {
        const got = await api.entities.Character.get(activeId);
        if (got && got.created_by_id === uid) ch = got;
      } catch {}
    }
    if (!ch) {
      // Fallback: newest character owned by this user.
      const list = await api.entities.Character.filter({ created_by_id: uid }, "-created_date", 3);
      ch = list[0] || null;
      // Defensive: never trust a record that isn't actually owned by this user.
      if (ch && ch.created_by_id !== uid) ch = null;
      // Migration: if the user has a character but no active set, pin the newest.
      if (ch && !activeId) {
        try { await api.auth.updateMe({ active_character_id: ch.id }); } catch {}
      }
    }
    if (!ch) return null;
    return {
      ...ch,
      legacy_name: ch.legacy_name || me?.legacy_name || null,
      legacy_display: ch.legacy_display || me?.legacy_display || "surname",
    };
  };
  const MAX_RETRIES = 3;
  const isTransient = (msg) => /rate limit|429|network|fetch|timeout|econnaborted|failed to fetch|5\d{2}/i.test(msg);
  const p = (async () => {
    try {
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          const ch = await fetchOne();
          _meCache = { userId: uid, char: ch, at: Date.now() };
          return ch;
        } catch (err) {
          const msg = err?.message || String(err);
          if (attempt < MAX_RETRIES && isTransient(msg)) {
            await new Promise((r) => setTimeout(r, 350 * Math.pow(2, attempt)));
            continue;
          }
          // Terminal failure: return the last-known character (or null) so the
          // page renders instead of spinning forever on a rate-limited fetch.
          return _meCache && _meCache.userId === uid ? _meCache.char : null;
        }
      }
      return _meCache && _meCache.userId === uid ? _meCache.char : null;
    } finally {
      _meInFlight = null;
    }
  })();
  _meInFlight = { userId: uid, promise: p };
  return p;
}

// Drop the cached character (e.g. right after creating one) so the next
// getMyCharacter() fetches fresh from the server.
export function bustMyCharacterCache() {
  _meCache = null;
  _meInFlight = null;
}

/** Listeners notified when the active character cache is primed with fresh data. */
const _characterCacheListeners = new Set();

/**
 * Subscribe to cache primes so the shell (and any shared character state) can
 * update live when a page merges currency after a claim/spend.
 * @returns {() => void} unsubscribe
 */
export function subscribeMyCharacterCache(listener) {
  if (typeof listener !== "function") return () => {};
  _characterCacheListeners.add(listener);
  return () => _characterCacheListeners.delete(listener);
}

/**
 * Refresh the cache with a known-fresh payload (e.g. after a claim/spend or
 * realtime update) WITHOUT busting it — so navigating between menus within the
 * TTL serves the latest data instantly.
 *
 * @param {object} char
 * @param {{ emit?: boolean }} [opts] — set emit:false when the caller already
 *   updated React state (avoids a redundant notify loop).
 */
export function primeMyCharacterCache(char, opts = {}) {
  if (!char || !char.created_by_id) return;
  _meCache = { userId: char.created_by_id, char, at: Date.now() };
  if (opts.emit === false) return;
  for (const fn of _characterCacheListeners) {
    try { fn(char); } catch { /* ignore listener errors */ }
  }
}

// All characters owned by the current user (max 3 — 1 free + 2 purchased slots).
export async function getMyCharacters() {
  const uid = await currentUserId();
  if (!uid) return [];
  return api.entities.Character.filter({ created_by_id: uid }, "-created_date", 10);
}

// Pin a character as the account's active operative and drop the cache so the
// next read picks up the switch.
export async function setActiveCharacter(characterId) {
  await api.auth.updateMe({ active_character_id: characterId });
  bustMyCharacterCache();
}

// Search players by name (case-insensitive partial match) — Node SearchCharacters.
export async function searchCharacters(query, excludeId) {
  const q = (query || "").trim();
  if (!q) return [];
  const res = await api.functions.invoke("SearchCharacters", { query: q, limit: 20 });
  const results = Array.isArray(res?.results) ? res.results : Array.isArray(res?.data?.results) ? res.data.results : [];
  return results.filter((c) => c.id !== excludeId).slice(0, 20);
}

export async function getFriends(characterId) {
  void characterId;
  const res = await api.functions.invoke("GetSocialState", {});
  const data = res?.data || res || {};
  return Array.isArray(data.friends) ? data.friends : [];
}

export async function getIncomingRequests(characterId) {
  void characterId;
  const res = await api.functions.invoke("GetSocialState", {});
  const data = res?.data || res || {};
  return Array.isArray(data.incoming_requests) ? data.incoming_requests : [];
}

export async function getOutgoingRequests(characterId) {
  void characterId;
  const res = await api.functions.invoke("GetSocialState", {});
  const data = res?.data || res || {};
  return Array.isArray(data.outgoing_requests) ? data.outgoing_requests : [];
}

export async function getBlocks(characterId) {
  void characterId;
  const res = await api.functions.invoke("GetSocialState", {});
  const data = res?.data || res || {};
  return Array.isArray(data.blocks) ? data.blocks : [];
}

export async function isBlockedBy(blockerId, blockedId) {
  const blocks = await getBlocks(blockerId);
  return blocks.some((b) => b.blocked_id === blockedId);
}

export async function getCharacterById(id) {
  const res = await api.functions.invoke("GetPublicProfile", { character_id: id });
  return res?.profile || res?.data?.profile || null;
}

// Fetch full character records for a list of ids (deduped).
export async function getCharactersByIds(ids) {
  const uniq = [...new Set(ids.filter(Boolean))];
  if (uniq.length === 0) return [];
  const res = await api.functions.invoke("GetCharactersByIds", { ids: uniq });
  return Array.isArray(res?.characters)
    ? res.characters
    : Array.isArray(res?.data?.characters)
      ? res.data.characters
      : [];
}

export async function getPresenceMap(characterIds) {
  if (!characterIds.length) return {};
  const res = await api.functions.invoke("GetPresenceMap", { character_ids: characterIds });
  return res?.presence || res?.data?.presence || {};
}

export async function sendFriendRequest(fromChar, toChar) {
  if (fromChar.id === toChar.id) throw new Error("Cannot friend yourself.");
  const res = await api.functions.invoke("SendFriendRequest", {
    to_character_id: toChar.id,
  });
  if (res?.error) throw new Error(res.error);
  return res?.request || res?.data?.request || res;
}

export async function acceptRequest(request, myChar) {
  void myChar;
  await api.functions.invoke("AcceptFriendRequest", { request_id: request.id });
}

export async function declineRequest(request) {
  await api.functions.invoke("DeclineFriendRequest", { request_id: request.id });
}

export async function removeFriend(characterId, otherId) {
  void characterId;
  await api.functions.invoke("RemoveFriend", { character_id: otherId });
}

export async function blockPlayer(blocker, blocked) {
  void blocker;
  await api.functions.invoke("BlockPlayer", { character_id: blocked.id });
}

export async function unblockPlayer(blockerId, blockedId) {
  void blockerId;
  await api.functions.invoke("UnblockPlayer", { character_id: blockedId });
}

export async function reportPlayer(reporterId, reported, reason, context, snapshot) {
  return api.entities.Report.create({
    reporter_id: reporterId, reported_id: reported.id, reported_name: reported.name,
    reason, context: context || "global_chat", message_snapshot: snapshot || "", status: "open",
  });
}