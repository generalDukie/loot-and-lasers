// ═══════════════════════════════════════════
// DUNGEON PLANETS — 10-world PvE crawl
// ═══════════════════════════════════════════

export const DUNGEON_PLANETS = [
  {
    id: 1, name: "Verdant Expanse", icon: "🌍", color: "#22C55E",
    description: "Lush frontier world. The local fauna has teeth. Consider it a warm-up.",
    lore: "Scout charts mark this as the soft edge of known space — until the canopy closes and the Brood answers. Every trail here was walked by something that never came back.",
    bossName: "Tharon Brood Matriarch", bossEmoji: "👾",
    races: ["Grothak", "Zyrathi"], classes: ["Vanguard", "Astral Warden"],
    enemyNames: ["Thornback", "Moss Reaver", "Canopy Stalker", "Rootmaw", "Sporekin", "Verdant Fang"],
    bossRace: "Grothak", bossClass: "Astral Warden",
  },
  {
    id: 2, name: "Ashen Reach", icon: "🏚️", color: "#3B82F6",
    description: "War-scarred ruins crawling with scavengers and worse. Watch the rooftops.",
    lore: "Once a trade hub, now a bone-yard of collapsed spires. Snipers nest in the ash, and the Warden still collects tithes in blood and scrap.",
    bossName: "Warden of Ash", bossEmoji: "🔥",
    races: ["Synthara", "Cognati"], classes: ["Vanguard", "Technomancer"],
    enemyNames: ["Ash Runner", "Ruin Sniper", "Scrap Hound", "Cinder Guard", "Rubble Knight", "Ember Jack"],
    bossRace: "Synthara", bossClass: "Vanguard",
  },
  {
    id: 3, name: "Shadow Veil", icon: "🏴‍☠️", color: "#A855F7",
    description: "A nebula-smuggler's paradise. Everyone here wants your stardust and your organs.",
    lore: "Fog thick enough to hide a fleet. Deals are sealed with knives, and Captain Zyrik's flag means your cargo already belongs to someone else.",
    bossName: "Captain Zyrik", bossEmoji: "💀",
    races: ["Zyrathi", "Luminae"], classes: ["Shadow Operative", "Void Runner", "Cosmic Engineer"],
    enemyNames: ["Veilcutter", "Dust Smuggler", "Night Hook", "Black Nebula", "Quiet Blade", "Zyrik Mate"],
    bossRace: "Zyrathi", bossClass: "Shadow Operative",
  },
  {
    id: 4, name: "Shattered Expanse", icon: "🌀", color: "#F59E0B",
    description: "Spacetime is more of a suggestion here. Reality bites back.",
    lore: "Navigation logs contradict themselves. You may arrive before you left. The Riftlord feeds on those who try to make sense of the folds.",
    bossName: "The Riftlord", bossEmoji: "🌀",
    races: ["Cognati", "Synthara"], classes: ["Technomancer", "Cosmic Engineer"],
    enemyNames: ["Rift Tick", "Echo Twin", "Chrono Wisp", "Fracture", "Paradox Hound", "Foldling"],
    bossRace: "Cognati", bossClass: "Technomancer",
  },
  {
    id: 5, name: "Abyssal Core", icon: "🕳️", color: "#EF4444",
    description: "Where stars go to die. Something down there is eating the light itself.",
    lore: "No beacon lasts long here. Crews report the dark moving against the grain — and a hunger that learned their names from the silence.",
    bossName: "Void Devourer", bossEmoji: "🕳️",
    races: ["Luminae", "Grothak"], classes: ["Astral Warden", "Shadow Operative", "Void Runner"],
    enemyNames: ["Light-Eater", "Abyss Maw", "Null Spawn", "Dark Current", "Hunger", "Umbral"],
    bossRace: "Luminae", bossClass: "Astral Warden",
  },
  {
    id: 6, name: "Frostfall Reach", icon: "❄️", color: "#06B6D4",
    description: "A frozen hellscape where the cold has learned to hunt in packs.",
    lore: "Wind that cuts like wire. The packs don't chase heat — they herd it. The Glacial Warden keeps the ice honest, and visitors rare.",
    bossName: "Glacial Warden", bossEmoji: "🧊",
    races: ["Cognati", "Grothak"], classes: ["Vanguard", "Astral Warden"],
    enemyNames: ["Ice Howler", "Rimeclaw", "Frost Pack", "Shard Wolf", "Glacier Kin", "Whiteout"],
    bossRace: "Grothak", bossClass: "Vanguard",
  },
  {
    id: 7, name: "Ember Maw", icon: "🌋", color: "#F97316",
    description: "A volcanic world ruled by things that swim in magma and breathe fire.",
    lore: "The crust is a thin lid on a living furnace. Magma lanes are roads if you can stand the heat — and the Titan that calls them home.",
    bossName: "Magma Titan", bossEmoji: "🌋",
    races: ["Synthara", "Grothak"], classes: ["Vanguard", "Technomancer"],
    enemyNames: ["Magma Skimmer", "Cinder Drake", "Lava Wight", "Ember Serpent", "Pyre Guard", "Scoria"],
    bossRace: "Synthara", bossClass: "Technomancer",
  },
  {
    id: 8, name: "Void Sanctum", icon: "🌑", color: "#7C3AED",
    description: "A temple carved into a dead moon. The priests never left. Neither will you, easily.",
    lore: "Hymns still echo in vacuum. The Null King's congregation doesn't sleep — it waits for pilgrims foolish enough to pray aloud.",
    bossName: "The Null King", bossEmoji: "🌑",
    races: ["Luminae", "Zyrathi"], classes: ["Astral Warden", "Shadow Operative", "Void Runner"],
    enemyNames: ["Moon Acolyte", "Silent Choir", "Null Priest", "Dead Cantor", "Sanctum Shade", "Vesperite"],
    bossRace: "Luminae", bossClass: "Shadow Operative",
  },
  {
    id: 9, name: "Crystal Nexus", icon: "💎", color: "#14B8A6",
    description: "A lattice-world of living crystal that refracts your worst memories into lasers.",
    lore: "Every facet is a mirror with an opinion. Walk carefully — the Prism Sovereign turns regret into a weapon and calls it judgment.",
    bossName: "Prism Sovereign", bossEmoji: "💎",
    races: ["Cognati", "Luminae"], classes: ["Technomancer", "Cosmic Engineer"],
    enemyNames: ["Facet Wraith", "Prism Scout", "Lattice Blade", "Refractor", "Geode Knight", "Shardling"],
    bossRace: "Cognati", bossClass: "Cosmic Engineer",
  },
  {
    id: 10, name: "World Zero", icon: "💫", color: "#FBBF24",
    description: "The first planet. The last stop of the known Frontier. Clear The Genesis to open the Wormhole beyond.",
    lore: "Charts end here for a reason. The Genesis is not a guardian — it is a lock. Break it, and the Wormhole stops pretending to be sealed.",
    bossName: "The Genesis", bossEmoji: "💫",
    races: ["Synthara", "Cognati", "Luminae"], classes: ["Technomancer", "Astral Warden", "Cosmic Engineer"],
    enemyNames: ["Proto Guard", "First Echo", "Zero Spawn", "Origin Wisp", "Seedling", "Primeform"],
    bossRace: "Synthara", bossClass: "Cosmic Engineer",
  },
];

// ═══════════════════════════════════════════
// INFINITE DUNGEON — endless depths unlocked after World Zero is conquered.
// ═══════════════════════════════════════════
const INFINITE_THEMES = [
  {
    name: "Shattered", icon: "🌌", color: "#9D6BFF",
    description: "Reality fragments into an endless crawl. There is no exit — only depth.",
    bossName: "The Fracture", bossEmoji: "🌌",
    races: ["Cognati", "Synthara"], classes: ["Technomancer", "Cosmic Engineer"],
    enemyNames: ["Shard Echo", "Broken Twin", "Fold Wraith", "Fractling"],
    bossRace: "Cognati", bossClass: "Technomancer",
  },
  {
    name: "Abyssal", icon: "🖤", color: "#7C3AED",
    description: "The dark has teeth and patience. Keep descending.",
    bossName: "The Hollow", bossEmoji: "🖤",
    races: ["Luminae", "Zyrathi"], classes: ["Shadow Operative", "Void Runner", "Astral Warden"],
    enemyNames: ["Hollow Bite", "Deep Shade", "Null Maw", "Abyss Tick"],
    bossRace: "Luminae", bossClass: "Astral Warden",
  },
  {
    name: "Temporal", icon: "⏳", color: "#06B6D4",
    description: "Time loops and bites its own tail. Every step is a debt.",
    bossName: "Chronovore", bossEmoji: "⏳",
    races: ["Cognati", "Grothak"], classes: ["Technomancer", "Vanguard"],
    enemyNames: ["Time Debt", "Loop Hound", "Yesterday", "Second Skin"],
    bossRace: "Cognati", bossClass: "Technomancer",
  },
  {
    name: "Celestial", icon: "✨", color: "#FBBF24",
    description: "The stars themselves line up to end you. Shine on anyway.",
    bossName: "The Zenith", bossEmoji: "✨",
    races: ["Luminae", "Synthara"], classes: ["Astral Warden", "Cosmic Engineer"],
    enemyNames: ["Star Choir", "Nova Kin", "Zenith Spark", "Solarite"],
    bossRace: "Luminae", bossClass: "Cosmic Engineer",
  },
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
    races: theme.races,
    classes: theme.classes,
    enemyNames: theme.enemyNames,
    bossRace: theme.bossRace,
    bossClass: theme.bossClass,
  };
}

export function getDungeonPlanetById(id) {
  if (id <= DUNGEON_PLANETS.length) {
    return DUNGEON_PLANETS.find((p) => p.id === id) || DUNGEON_PLANETS[0];
  }
  return getInfinitePlanet(id - DUNGEON_PLANETS.length);
}

/** Map selection id for the post–World Zero infinite entrance. */
export const WORMHOLE_ID = "wormhole";

export function getWormholePlanet(depth) {
  const d = Math.max(1, depth || 1);
  const planet = getInfinitePlanet(d);
  return {
    ...planet,
    name: `The Wormhole · Depth ${d}`,
    icon: "🌀",
    description: "Beyond World Zero, spacetime folds into an endless corridor. There is no last floor — only deeper.",
    lore: "Past the Genesis lock, every depth is a new shape of the same hunger. Charts burn out. Compasses spin. The only way is through — and through never ends.",
  };
}
