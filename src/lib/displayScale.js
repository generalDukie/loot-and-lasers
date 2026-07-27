// Per-user station hub display preference (stored locally).
// Scale modes:
//   "auto"           — fit the whole design on screen (may letterbox)
//   "cover"          — fill the screen (may crop edges)
//   "fill-width"     — scale to viewport width (may clip top/bottom)
//   "contain-height" — scale to viewport height (may letterbox sides)
//   number           — fixed zoom factor (e.g. "1.5")
//
// Anchor controls horizontal placement when the scaled canvas is narrower
// than the viewport (useful on ultrawide monitors):
//   "left" | "center" | "right"
const KEY = "loot_display_scale";
const ANCHOR_KEY = "loot_display_anchor";

export const DISPLAY_OPTIONS = [
  { value: "auto", label: "Auto fit" },
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