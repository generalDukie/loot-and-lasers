/**
 * Shared art direction for character + equipment SVG art.
 * Hand-painted fantasy/sci-fi cartoon: bold ink, soft cel bands, vibrant accents.
 */
import { RARITY_COLORS } from "@/lib/gameData";

export const ART_INK = "#120a1c";
export const ART_RIM = "#ffffff";
export const ART_SW = 5; // primary outline
export const ART_SW_FINE = 2.5;

export const RACE_ACCENT = {
  Zyrathi: { a: "#FF6B1A", b: "#C9300A", glow: "#FF9E4F" },
  Cognati: { a: "#00E5FF", b: "#1A6B8A", glow: "#7DF9FF" },
  Luminae: { a: "#FFE9A8", b: "#C9B8FF", glow: "#FFF6D0" },
  Grothak: { a: "#FF8C42", b: "#8B7355", glow: "#FFB347" },
  Synthara: { a: "#9D6BFF", b: "#2E1A47", glow: "#D4B5FF" },
};

export function shade(hex, amt) {
  if (!hex) return "#888888";
  let c = String(hex).replace("#", "");
  if (c.length === 3) c = c.split("").map((x) => x + x).join("");
  const num = parseInt(c, 16);
  if (Number.isNaN(num)) return "#888888";
  const r = Math.max(0, Math.min(255, ((num >> 16) & 255) + amt));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (num & 255) + amt));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

export function rarityColor(rarity) {
  return RARITY_COLORS[rarity] || RARITY_COLORS.common || "#9CA3AF";
}

/**
 * Detail tier for gear kits — denser art at higher rarity / level.
 * low = common silhouette, mid = vents/rivets, high = filigree + plasma.
 */
export function gearDetailTier(rarity, levelRequirement = 1) {
  const r = String(rarity || "common").toLowerCase();
  const lv = Math.max(1, Number(levelRequirement) || 1);
  if (r === "legendary" || (r === "epic" && lv >= 10)) return "high";
  if (r === "epic" || r === "rare" || (r === "uncommon" && lv >= 8)) return "mid";
  if (r === "uncommon" || r === "rare") return "mid";
  if (lv >= 12) return "mid";
  return "low";
}

export function rarityGlowStrength(rarity) {
  switch (String(rarity || "common").toLowerCase()) {
    case "legendary": return { outer: "55", inset: "40", blur: 18 };
    case "epic": return { outer: "48", inset: "35", blur: 15 };
    case "rare": return { outer: "40", inset: "28", blur: 13 };
    case "uncommon": return { outer: "36", inset: "24", blur: 12 };
    default: return { outer: "30", inset: "18", blur: 10 };
  }
}

/** Soft 3-band cel paint stops for SVG linearGradient children. */
export function paintStops(skin, light, dark) {
  return [
    { offset: "0%", color: light },
    { offset: "40%", color: light },
    { offset: "45%", color: skin },
    { offset: "72%", color: skin },
    { offset: "78%", color: dark },
    { offset: "100%", color: dark },
  ];
}
