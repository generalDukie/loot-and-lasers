/**
 * Client preferences façade (Restoration 24).
 * Local device settings stay in localStorage; account prefs sync via Node RPCs.
 * Never treat local prefs as gameplay authority.
 */
import { api } from "@/api/gameClient";
import {
  getVolumes,
  setVolumes,
  getAudioPrefs,
  setPlayWhenMinimized,
} from "@/lib/audioEngine";
import {
  getDisplayScale,
  setDisplayScale,
  getDisplayAnchor,
  setDisplayAnchor,
} from "@/lib/displayScale";

/** Hardware / device keys — must not be sent to SaveAccountPreferences. */
export const LOCAL_DEVICE_KEYS = Object.freeze([
  "master",
  "music",
  "sfx",
  "playWhenMinimized",
  "displayScale",
  "displayAnchor",
]);

/** Account keys that may roam (Node users table). */
export const ACCOUNT_KEYS = Object.freeze(["legacy_display", "legacy_name"]);

export function loadLocalSettings() {
  return {
    scope: "local_device",
    audio: getVolumes(),
    audioPrefs: getAudioPrefs(),
    displayScale: getDisplayScale(),
    displayAnchor: getDisplayAnchor(),
  };
}

export function saveLocalSettings(patch = {}) {
  if (patch.audio) setVolumes(patch.audio);
  if (patch.audioPrefs && typeof patch.audioPrefs.playWhenMinimized === "boolean") {
    setPlayWhenMinimized(patch.audioPrefs.playWhenMinimized);
  }
  if (patch.displayScale != null) setDisplayScale(patch.displayScale);
  if (patch.displayAnchor != null) setDisplayAnchor(patch.displayAnchor);
  return loadLocalSettings();
}

export async function loadAccountPreferences() {
  const res = await api.functions.invoke("GetAccountPreferences", {});
  return res?.preferences || res?.data?.preferences || {};
}

export async function saveAccountPreferences(preferences) {
  const clean = {};
  for (const key of ACCOUNT_KEYS) {
    if (Object.prototype.hasOwnProperty.call(preferences || {}, key)) {
      clean[key] = preferences[key];
    }
  }
  const res = await api.functions.invoke("SaveAccountPreferences", { preferences: clean });
  return res?.preferences || res?.data?.preferences || clean;
}

/**
 * One-shot: ensure browser audio defaults exist (no-op if already set).
 * Does not import Godot settings or gameplay saves.
 */
export function migrateBrowserSettingsIfNeeded() {
  const local = loadLocalSettings();
  return { migrated: false, local };
}
