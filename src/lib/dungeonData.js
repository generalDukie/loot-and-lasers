// ═══════════════════════════════════════════
// DUNGEON PLANETS — 10-world PvE crawl
// ═══════════════════════════════════════════
export const DUNGEON_PLANETS = [
  { id: 1, name: "Verdant Expanse", icon: "🌍", color: "#22C55E", description: "Lush frontier world. The local fauna has teeth. Consider it a warm-up.", bossName: "Tharon Hive-Mother", bossEmoji: "👾", shipMod: "Plasma Drive" },
  { id: 2, name: "Ashen Reach", icon: "🏚️", color: "#3B82F6", description: "War-scarred ruins crawling with scavengers and worse. Watch the rooftops.", bossName: "Warden of Ash", bossEmoji: "🔥", shipMod: "Warp Coil" },
  { id: 3, name: "Shadow Veil", icon: "🏴‍☠️", color: "#A855F7", description: "A nebula-smuggler's paradise. Everyone here wants your stardust and your organs.", bossName: "Captain Vex", bossEmoji: "💀", shipMod: "Phase Shift" },
  { id: 4, name: "Shattered Expanse", icon: "🌀", color: "#F59E0B", description: "Spacetime is more of a suggestion here. Reality bites back.", bossName: "The Riftlord", bossEmoji: "🌀", shipMod: "Singularity Engine" },
  { id: 5, name: "Abyssal Core", icon: "🕳️", color: "#EF4444", description: "Where stars go to die. Something down there is eating the light itself.", bossName: "Void Devourer", bossEmoji: "🕳️", shipMod: "Void Sail" },
  { id: 6, name: "Frostfall Reach", icon: "❄️", color: "#06B6D4", description: "A frozen hellscape where the cold has learned to hunt in packs.", bossName: "Glacial Warden", bossEmoji: "🧊", shipMod: "Cryo Thruster" },
  { id: 7, name: "Ember Maw", icon: "🌋", color: "#F97316", description: "A volcanic world ruled by things that swim in magma and breathe fire.", bossName: "Magma Titan", bossEmoji: "🌋", shipMod: "Solar Booster" },
  { id: 8, name: "Void Sanctum", icon: "🌑", color: "#7C3AED", description: "A temple carved into a dead moon. The priests never left. Neither will you, easily.", bossName: "The Null King", bossEmoji: "🌑", shipMod: "Quantum Anchor" },
  { id: 9, name: "Crystal Nexus", icon: "💎", color: "#14B8A6", description: "A lattice-world of living crystal that refracts your worst memories into lasers.", bossName: "Prism Sovereign", bossEmoji: "💎", shipMod: "Aether Wing" },
  { id: 10, name: "World Zero", icon: "💫", color: "#FBBF24", description: "The first planet. The last stop. Whatever started everything is waiting here.", bossName: "The Genesis", bossEmoji: "💫", shipMod: "Genesis Core" },
];

// ═══════════════════════════════════════════
// INFINITE DUNGEON — endless depths unlocked after World Zero is conquered.
// Reuses the engine's planet-based scaling (enemy power & rewards climb with
// planet.id = 11, 12, 13, …). No ship mods drop here — those are exclusive to
// the 10-world story crawl — so the final boss can only be completed once.
// ═══════════════════════════════════════════
const INFINITE_THEMES = [
  { name: "Shattered", icon: "🌌", color: "#9D6BFF", description: "Reality fragments into an endless crawl. There is no exit — only depth.", bossName: "The Fracture", bossEmoji: "🌌" },
  { name: "Abyssal", icon: "🖤", color: "#7C3AED", description: "The dark has teeth and patience. Keep descending.", bossName: "The Hollow", bossEmoji: "🖤" },
  { name: "Temporal", icon: "⏳", color: "#06B6D4", description: "Time loops and bites its own tail. Every step is a debt.", bossName: "Chronovore", bossEmoji: "⏳" },
  { name: "Celestial", icon: "✨", color: "#FBBF24", description: "The stars themselves line up to end you. Shine on anyway.", bossName: "The Zenith", bossEmoji: "✨" },
];

export function getInfinitePlanet(depth) {
  const d = Math.max(1, depth);
  const theme = INFINITE_THEMES[(d - 1) % INFINITE_THEMES.length];
  return {
    id: DUNGEON_PLANETS.length + d,
    name: `${theme.name} Depth ${d}`,
    icon: theme.icon,
    color: theme.color,
    description: theme.description,
    bossName: theme.bossName,
    bossEmoji: theme.bossEmoji,
    shipMod: null,
  };
}