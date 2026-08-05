/**
 * Account preferences that roam with the user (Restoration 24).
 * Hardware / graphics / audio stay on the client — never stored here.
 */
import { db } from "../db.js";
import { getUserById, getUserRowById, stampCharacterLegacy } from "../auth.js";
import { NAME_NO_DIGITS_MSG } from "./nameRules.js";

const LEGACY_DISPLAY = new Set(["surname", "family"]);

function httpErr(status, message, code) {
  const e = new Error(message);
  e.status = status;
  e.code = code || "PREFERENCES_ERROR";
  throw e;
}

/** Whitelist of account-scoped preferences (Node-authoritative). */
export const ACCOUNT_PREFERENCE_KEYS = Object.freeze([
  "legacy_display",
  "legacy_name",
]);

export function serializeAccountPreferences(user) {
  if (!user) return null;
  return {
    legacy_display: user.legacy_display === "family" ? "family" : "surname",
    legacy_name: user.legacy_name || null,
  };
}

export function getAccountPreferences(userId) {
  const user = getUserById(userId);
  if (!user) httpErr(404, "User not found");
  return serializeAccountPreferences(user);
}

/**
 * Patch account preferences. Rejects unknown keys (no hardware settings).
 */
export function saveAccountPreferences(userId, patch = {}) {
  if (!userId) httpErr(401, "Unauthorized");
  const incoming = patch && typeof patch === "object" ? patch : {};
  for (const key of Object.keys(incoming)) {
    if (!ACCOUNT_PREFERENCE_KEYS.includes(key)) {
      httpErr(400, `Preference not synchronizable: ${key}`, "INVALID_PREFERENCE");
    }
  }
  const sets = [];
  const vals = [];
  const legacyStamp = {};
  if (Object.prototype.hasOwnProperty.call(incoming, "legacy_display")) {
    const mode = incoming.legacy_display === "family" ? "family" : "surname";
    if (!LEGACY_DISPLAY.has(mode)) httpErr(400, "Invalid legacy_display");
    sets.push("legacy_display = ?");
    vals.push(mode);
    legacyStamp.legacy_display = mode;
  }
  if (Object.prototype.hasOwnProperty.call(incoming, "legacy_name")) {
    // The surname is permanent — preferences sync may set it once, never rewrite
    // or clear it, or an account could shed the identity other players know.
    const locked = getUserRowById(userId)?.legacy_name || "";
    const name = incoming.legacy_name == null ? "" : String(incoming.legacy_name).trim();
    if (locked) {
      if (name && name !== locked) {
        httpErr(409, "Legacy name is permanent and cannot be changed", "LEGACY_NAME_LOCKED");
      }
    } else if (name) {
      if (name.length < 2 || name.length > 20) {
        httpErr(400, "Legacy name must be 2–20 characters");
      }
      if (/\d/.test(name)) httpErr(400, NAME_NO_DIGITS_MSG);
      sets.push("legacy_name = ?");
      vals.push(name);
      legacyStamp.legacy_name = name;
    }
  }
  if (!sets.length) {
    return getAccountPreferences(userId);
  }
  sets.push("updated_date = ?");
  vals.push(new Date().toISOString());
  vals.push(userId);
  db.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
  stampCharacterLegacy(userId, legacyStamp);
  return getAccountPreferences(userId);
}

/** Local-device settings that must never sync to Node (documentation + tests). */
export const LOCAL_DEVICE_SETTING_KEYS = Object.freeze([
  "master_volume",
  "music_volume",
  "sfx_volume",
  "fullscreen",
  "window_mode",
  "play_music_when_unfocused",
  "vsync",
  "combat_anim_speed",
  "screen_shake_scale",
  "display_scale",
  "display_anchor",
  "resolution",
  "monitor_index",
  "input_bindings",
]);
