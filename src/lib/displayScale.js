// Per-user station hub display preference (stored locally).
// Resolved by src/lib/gameViewport.js → GameCanvas (authoritative 16:9 system).
// Scale modes:
//   "auto"           — largest 16:9 fit inside the browser (default, preferred)
//   "cover"          — fill the screen (may crop edges)
//   "fill-width"     — scale to browser width (may clip top/bottom)
//   "contain-height" — scale to browser height (may pillarbox sides)
//   number           — fixed zoom vs 1920×1080 design (e.g. "1.5")
//
// Anchor controls horizontal placement when the game pane is narrower
// than the browser (ultrawide):
//   "left" | "center" | "right"
const KEY = "loot_display_scale";
const ANCHOR_KEY = "loot_display_anchor";

export const DISPLAY_OPTIONS = [
  { value: "auto", label: "16:9 fit" },
  { value: "cover", label: "Fill screen" },
  { value: "fill-width", label: "Fill width" },
  { value: "contain-height", label: "Fill height" },
  { value: "1", label: "100%" },
  { value: "1.25", label: "125%" },
  { value: "1.5", label: "150%" },
  { value: "1.75", label: "175%" },
  { value: "2", label: "200%" },
];

export const ANCHOR_OPTIONS = [
  { value: "left", label: "Left" },
  { value: "center", label: "Center" },
  { value: "right", label: "Right" },
];

export function getDisplayScale() {
  if (typeof window === "undefined") return "auto";
  return localStorage.getItem(KEY) || "auto";
}

export function setDisplayScale(v) {
  localStorage.setItem(KEY, v);
  window.dispatchEvent(new Event("display-scale-change"));
}

export function getDisplayAnchor() {
  if (typeof window === "undefined") return "center";
  return localStorage.getItem(ANCHOR_KEY) || "center";
}

export function setDisplayAnchor(v) {
  localStorage.setItem(ANCHOR_KEY, v);
  window.dispatchEvent(new Event("display-anchor-change"));
}