// Global soundtrack router — keeps station ambience flowing across page
// changes, and swaps to the cantina tune only while on /missions.
import { startStationAmbient, stopStationAmbient, isStationAmbientPlaying } from "@/lib/stationAmbient";
import { startCantina, stopCantina, isCantinaPlaying } from "@/lib/cantinaAudio";

/** @type {"ambient" | "cantina" | null} */
let mode = null;
let cantinaMuted = false;

export function getSoundtrackMode() {
  return mode;
}

export function isCantinaMuted() {
  return cantinaMuted;
}

export function setCantinaMuted(muted) {
  cantinaMuted = !!muted;
  if (mode !== "cantina") return;
  if (cantinaMuted) stopCantina();
  else startCantina();
}

export function requestSoundtrack(next) {
  const target = next === "ambient" || next === "cantina" ? next : null;

  if (mode === target) {
    // Ensure the requested bed is actually audible (e.g. after a mute toggle
    // or a browser audio-context suspend), without rebuilding from scratch.
    if (target === "ambient" && !isStationAmbientPlaying()) startStationAmbient();
    if (target === "cantina" && !cantinaMuted && !isCantinaPlaying()) startCantina();
    return;
  }

  mode = target;
  if (target === "cantina") {
    stopStationAmbient();
    if (!cantinaMuted) startCantina();
    return;
  }
  // Leaving the cantina clears a page-local mute so the next visit plays again.
  cantinaMuted = false;
  if (target === "ambient") {
    stopCantina();
    startStationAmbient();
    return;
  }
  stopCantina();
  stopStationAmbient();
}

export function soundtrackForPath(pathname) {
  if (!pathname) return null;
  if (
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password"
  ) {
    return null;
  }
  if (pathname === "/missions") return "cantina";
  return "ambient";
}
