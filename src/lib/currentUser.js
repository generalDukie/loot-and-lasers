// Always-current snapshot of the logged-in user, kept in sync by AuthContext.
// socialEngine reads this instead of caching api.auth.me() itself, so a
// session/token change (login, logout, preview-as) is reflected immediately —
// no stale user id can ever cause one account's character to load for another.
let _uid = null;
let _user = null;

export function setCurrentUserId(id) {
  _uid = id || null;
}

export function getCurrentUserId() {
  return _uid;
}

// Stores the full user object (includes extra fields like active_character_id
// and purchased_slots) so engines can read them without an extra API call.
export function setCurrentUser(user) {
  _user = user || null;
  if (user?.id) _uid = user.id;
}

export function getCurrentUser() {
  return _user;
}