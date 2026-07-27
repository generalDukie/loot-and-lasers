// ═══════════════════════════════════════════
// GALAXY MAP DATA
// ═══════════════════════════════════════════
export const GALAXY_SECTORS = [
  {
    id: 1,
    name: "Verdant Expanse",
    danger: "low",
    description: "The frontier of civilized space. Patrol routes and mining operations keep these systems relatively safe for new operatives.",
    loot_rarity: "common",
    color: "#22C55E",
    planets: [
      { name: "Tharon Prime", type: "Terrestrial", icon: "🌍", description: "Lush jungle world teeming with alien flora." },
      { name: "Kelvari Belt", type: "Asteroid Field", icon: "☄️", description: "Rich mineral deposits scattered across a volatile field." },
      { name: "Nebula Station Alpha", type: "Space Station", icon: "🛰️", description: "Frontier trading post and patrol headquarters." },
    ],
  },
  {
    id: 2,
    name: "Ashen Reach",
    danger: "moderate",
    description: "A region scarred by ancient wars. Derelict ships and ruined colonies hide valuable salvage — and lingering threats.",
    loot_rarity: "uncommon",
    color: "#3B82F6",
    planets: [
      { name: "Ashara IV", type: "Alien Ruins", icon: "🏚️", description: "Crumbling spires of a civilization lost to time." },
      { name: "Wreck of the ISS Meridian", type: "Derelict Ship", icon: "🚀", description: "Abandoned cargo freighter drifting in the void." },
      { name: "Fort Vrak", type: "Military Base", icon: "🏰", description: "Decommissioned outpost with hidden armories." },
    ],
  },
  {
    id: 3,
    name: "Shadow Veil",
    danger: "high",
    description: "A nebula-shrouded region crawling with pirate syndicates and smuggler dens. Only experienced operatives should venture here.",
    loot_rarity: "rare",
    color: "#A855F7",
    planets: [
      { name: "Shadow Station Omega", type: "Pirate Stronghold", icon: "🏴‍☠️", description: "Lawless hub of the Crimson Fang syndicate." },
      { name: "Xenith Hollow", type: "Gas Giant", icon: "🪐", description: "Storm-wracked giant hiding floating refineries." },
      { name: "The Whispering Moon", type: "Moon", icon: "🌑", description: "Rumored to drive visitors mad with voices." },
    ],
  },
  {
    id: 4,
    name: "Shattered Expanse",
    danger: "extreme",
    description: "A region torn apart by a cosmic cataclysm. Void rifts and unstable spacetime make every journey a gamble with reality itself.",
    loot_rarity: "epic",
    color: "#F59E0B",
    planets: [
      { name: "The Rift", type: "Void Anomaly", icon: "🌀", description: "A tear in spacetime that devours entire systems." },
      { name: "Cognati Prime", type: "AI World", icon: "🤖", description: "Homeworld of the Cognati collective, now corrupted." },
      { name: "Echo Colony", type: "Ghost Colony", icon: "👻", description: "A settlement that vanished overnight. No bodies found." },
    ],
  },
  {
    id: 5,
    name: "Abyssal Core",
    danger: "lethal",
    description: "The deepest reaches of known space. Stars die here. Only legends return — and they don't speak of what they saw.",
    loot_rarity: "legendary",
    color: "#EF4444",
    planets: [
      { name: "VX-9", type: "Dying Star", icon: "⭐", description: "A star moments from supernova. Exotic matter awaits." },
      { name: "The Black Gate", type: "Singularity", icon: "🕳️", description: "An ancient megastructure orbiting a black hole." },
      { name: "World Zero", type: "Origin World", icon: "💫", description: "The first planet. Or so the legends say." },
    ],
  },
];

export const DANGER_LABELS = {
  low: "Low",
  moderate: "Moderate",
  high: "High",
  extreme: "Extreme",
  lethal: "Lethal",
};

export const DANGER_COLORS = {
  low: "#22C55E",
  moderate: "#3B82F6",
  high: "#A855F7",
  extreme: "#F59E0B",
  lethal: "#EF4444",
};

export const RARITY_LABELS = {
  common: "Common",
  uncommon: "Uncommon",
  rare: "Rare",
  epic: "Epic",
  legendary: "Legendary",
};