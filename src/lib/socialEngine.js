import { api } from "@/api/gameClient";
import { getCurrentUserId, getCurrentUser } from "@/lib/currentUser";
import { normalizeForSearch } from "@/lib/utils";

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
    if (activeId) {
      try {
        const ch = await api.entities.Character.get(activeId);
        if (ch && ch.created_by_id === uid) return ch;
      } catch {}
    }
    // Fallback: newest character owned by this user.
    const list = await api.entities.Character.filter({ created_by_id: uid }, "-created_date", 3);
    const ch = list[0] || null;
    // Defensive: never trust a record that isn't actually owned by this user.
    if (ch && ch.created_by_id !== uid) return null;
    // Migration: if the user has a character but no active set, pin the newest.
    if (ch && !activeId) {
      try { await api.auth.updateMe({ active_character_id: ch.id }); } catch {}
    }
    return ch;
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

// Refresh the cache with a known-fresh payload (e.g. a realtime update event)
// WITHOUT busting it — so navigating between menus within the TTL serves the
// latest data instantly instead of refetching and re-tripping the rate limiter.
export function primeMyCharacterCache(char) {
  if (!char || !char.created_by_id) return;
  _meCache = { userId: char.created_by_id, char, at: Date.now() };
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

// Search players by name (case-insensitive partial match).
export async function searchCharacters(query, excludeId) {
  const q = (query || "").trim();
  if (!q) return [];
  const norm = (s) => normalizeForSearch(s);
  const nq = norm(q);
  const all = await api.entities.Character.list("-created_date", 200);
  return all.filter((c) => c.id !== excludeId && norm(c.name).includes(nq)).slice(0, 20);
}

export async function getFriends(characterId) {
  return api.entities.Friendship.filter({ participant_ids: characterId });
}

export async function getIncomingRequests(characterId) {
  return api.entities.FriendRequest.filter({ to_character_id: characterId, status: "pending" });
}

export async function getOutgoingRequests(characterId) {
  return api.entities.FriendRequest.filter({ from_character_id: characterId, status: "pending" });
}

export async function getBlocks(characterId) {
  return api.entities.Block.filter({ blocker_id: characterId });
}

export async function isBlockedBy(blockerId, blockedId) {
  const list = await api.entities.Block.filter({ blocker_id: blockerId, blocked_id: blockedId });
  return list.length > 0;
}

export async function getCharacterById(id) {
  const all = await api.entities.Character.list("-created_date", 200);
  return all.find((c) => c.id === id) || null;
}

// Fetch full character records for a list of ids (deduped).
export async function getCharactersByIds(ids) {
  const uniq = [...new Set(ids.filter(Boolean))];
  if (uniq.length === 0) return [];
  const all = await api.entities.Character.list("-created_date", 200);
  const set = new Set(uniq);
  return all.filter((c) => set.has(c.id));
}

export async function getPresenceMap(characterIds) {
  if (!characterIds.length) return {};
  const all = await api.entities.PlayerPresence.list("-created_date", 200);
  const set = new Set(characterIds);
  const map = {};
  all.filter((p) => set.has(p.character_id)).forEach((p) => { map[p.character_id] = p; });
  return map;
}

export async function sendFriendRequest(fromChar, toChar) {
  if (fromChar.id === toChar.id) throw new Error("Cannot friend yourself.");
  const blocked = await isBlockedBy(toChar.id, fromChar.id);
  if (blocked) throw new Error("You cannot send a request to this player.");
  const existing = await api.entities.FriendRequest.filter({
    $or: [
      { from_character_id: fromChar.id, to_character_id: toChar.id, status: "pending" },
      { from_character_id: toChar.id, to_character_id: fromChar.id, status: "pending" },
    ],
  });
  if (existing.length > 0) throw new Error("A request is already pending between you.");
  const friends = await getFriends(fromChar.id);
  const already = friends.some((f) => (f.participant_ids || []).includes(toChar.id));
  if (already) throw new Error("You are already friends.");

  const req = await api.entities.FriendRequest.create({
    from_character_id: fromChar.id, to_character_id: toChar.id,
    from_name: fromChar.name, to_name: toChar.name, status: "pending",
  });
  // The notification is a side effect — if it fails (rate limit, permission),
  // it must NOT surface as a "could not send" error since the request itself
  // already succeeded.
  try {
    await api.asServiceRole.entities.AppNotification.create({
      owner_id: toChar.id, type: "friend_request", title: fromChar.name,
      body: "sent you a friend request", related_id: req.id, read: false,
    });
  } catch {}
  return req;
}

export async function acceptRequest(request, myChar) {
  const participants = [request.from_character_id, request.to_character_id].sort();
  await api.entities.Friendship.create({ participant_ids: participants });
  await api.entities.FriendRequest.update(request.id, { status: "accepted" });
  await api.asServiceRole.entities.AppNotification.create({
    owner_id: request.from_character_id, type: "system", title: myChar.name,
    body: "accepted your friend request", read: false,
  });
}

export async function declineRequest(request) {
  await api.entities.FriendRequest.update(request.id, { status: "declined" });
}

export async function removeFriend(characterId, otherId) {
  const friends = await getFriends(characterId);
  const f = friends.find((fr) => (fr.participant_ids || []).includes(otherId));
  if (f) await api.entities.Friendship.delete(f.id);
}

export async function blockPlayer(blocker, blocked) {
  // Remove friendship + decline pending requests, then block.
  await removeFriend(blocker.id, blocked.id);
  const pend = await api.entities.FriendRequest.filter({ from_character_id: blocked.id, to_character_id: blocker.id, status: "pending" });
  if (pend[0]) await api.entities.FriendRequest.update(pend[0].id, { status: "declined" });
  const existing = await api.entities.Block.filter({ blocker_id: blocker.id, blocked_id: blocked.id });
  if (existing.length === 0) {
    await api.entities.Block.create({ blocker_id: blocker.id, blocked_id: blocked.id, blocked_name: blocked.name });
  }
}

export async function unblockPlayer(blockerId, blockedId) {
  const list = await api.entities.Block.filter({ blocker_id: blockerId, blocked_id: blockedId });
  if (list[0]) await api.entities.Block.delete(list[0].id);
}

export async function reportPlayer(reporterId, reported, reason, context, snapshot) {
  return api.entities.Report.create({
    reporter_id: reporterId, reported_id: reported.id, reported_name: reported.name,
    reason, context: context || "global_chat", message_snapshot: snapshot || "", status: "open",
  });
}