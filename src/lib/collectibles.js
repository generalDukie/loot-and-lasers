// ═══════════════════════════════════════════
// COLLECTIBLES — alien species, artifacts, relics
// ═══════════════════════════════════════════

// 30 hand-crafted alien species (enemy-only, discovered via battle).
// Each id maps to a unique animation in SpeciesAvatar.
export const ALIEN_SPECIES = [
  { id: 1, name: "Voidglider", emoji: "🦑", color: "#A855F7", rarity: "rare", lore: "Drifts through hard vacuum feeding on starlight." },
  { id: 2, name: "Ember Wraith", emoji: "🔥", color: "#F97316", rarity: "uncommon", lore: "A living flame that haunts volcanic worlds." },
  { id: 3, name: "Frost Lich", emoji: "🧊", color: "#06B6D4", rarity: "epic", lore: "Ancient sorcerers preserved in eternal ice." },
  { id: 4, name: "Quartzling", emoji: "💎", color: "#14B8A6", rarity: "uncommon", lore: "Sentient crystals that hum in harmonic chords." },
  { id: 5, name: "Nebulax", emoji: "🌌", color: "#6366F1", rarity: "rare", lore: "Born inside a nebula, it is more cloud than creature." },
  { id: 6, name: "Sporeling", emoji: "🍄", color: "#22C55E", rarity: "common", lore: "A walking fungus that spreads with every step." },
  { id: 7, name: "Krakoth", emoji: "🦈", color: "#64748B", rarity: "rare", lore: "Abyssal apex predator with teeth like stalactites." },
  { id: 8, name: "Solaris Moth", emoji: "🦋", color: "#FBBF24", rarity: "rare", lore: "Drawn to dying stars; its wings store solar fire." },
  { id: 9, name: "Void Crab", emoji: "🦀", color: "#8B5CF6", rarity: "uncommon", lore: "Armored scavenger that nests in wrecked hulls." },
  { id: 10, name: "Plasma Wisp", emoji: "💫", color: "#EC4899", rarity: "epic", lore: "A spark of pure energy that dances between dimensions." },
  { id: 11, name: "Core Worm", emoji: "🪱", color: "#78350F", rarity: "rare", lore: "Burrows through planetary cores, swallowing stone." },
  { id: 12, name: "Star Jelly", emoji: "🪼", color: "#F472B6", rarity: "uncommon", lore: "Floating bioluminescent drifter of the deep void." },
  { id: 13, name: "Magma Golem", emoji: "🗿", color: "#EF4444", rarity: "epic", lore: "A titan of cooled lava with a molten heart." },
  { id: 14, name: "Echo Specter", emoji: "👻", color: "#C4B5FD", rarity: "rare", lore: "A memory given form; it repeats your last words." },
  { id: 15, name: "Iron Scarab", emoji: "🪲", color: "#94A3B8", rarity: "common", lore: "Mechanoid insect that swarms derelict stations." },
  { id: 16, name: "Storm Harpy", emoji: "🦅", color: "#EAB308", rarity: "uncommon", lore: "Rides ion storms, screaming static." },
  { id: 17, name: "Abyssal Angler", emoji: "🐟", color: "#1E3A8A", rarity: "rare", lore: "Lures prey with a false star on its forehead." },
  { id: 18, name: "Crystal Mantis", emoji: "🦗", color: "#2DD4BF", rarity: "rare", lore: "Strikes faster than light refracts through its blades." },
  { id: 19, name: "Void Leviathan", emoji: "🐉", color: "#7C3AED", rarity: "legendary", lore: "A serpent long enough to eclipse a small moon." },
  { id: 20, name: "Pollen Sprite", emoji: "🌼", color: "#FACC15", rarity: "common", lore: "Tiny fey that bloom only on garden worlds." },
  { id: 21, name: "Rust Specter", emoji: "🤖", color: "#B45309", rarity: "uncommon", lore: "A corroded drone still running on a dead captain's orders." },
  { id: 22, name: "Glacial Titan", emoji: "⛄", color: "#67E8F9", rarity: "epic", lore: "A roaming iceberg given cruel intelligence." },
  { id: 23, name: "Photon Serpent", emoji: "🐍", color: "#FCD34D", rarity: "rare", lore: "Slithers along beams of light, leaving rainbows." },
  { id: 24, name: "Bramble Beast", emoji: "🌵", color: "#16A34A", rarity: "uncommon", lore: "Rooted predator that waits centuries for one meal." },
  { id: 25, name: "Tidal Naga", emoji: "🐊", color: "#0EA5E9", rarity: "rare", lore: "Surfs the gravity tides of shattered moons." },
  { id: 26, name: "Cinder Imp", emoji: "😈", color: "#DC2626", rarity: "common", lore: "Mischievous fire-sprite that ignites fuses for fun." },
  { id: 27, name: "Null Cub", emoji: "🐻", color: "#334155", rarity: "epic", lore: "A cub of the Null King; absorbs light around it." },
  { id: 28, name: "Prism Drake", emoji: "🐲", color: "#F59E0B", rarity: "epic", lore: "Scales split white light into weaponized spectra." },
  { id: 29, name: "Gravmoth", emoji: "🦋", color: "#A78BFA", rarity: "rare", lore: "Bends gravity with each wingbeat." },
  { id: 30, name: "Genesis Eye", emoji: "👁️", color: "#FBBF24", rarity: "legendary", lore: "The watcher at World Zero. It saw the beginning." },
];

// ── Artifacts (100) — procedurally named, stable ids ──
const ART_PREFIX = ["Codex", "Shard", "Heart", "Eye", "Crown", "Key", "Core", "Seal", "Tome", "Blade", "Orb", "Scepter", "Compass", "Mask", "Horn"];
const ART_SUFFIX = ["of the Void", "of Eternity", "of the Nebula", "of the Abyss", "of First Light", "of the Singularity", "of the Ancients", "of the Endless", "of the Forgotten", "of Genesis", "of the Rift", "of the Cosmos", "of the Pale Star", "of the Deep", "of the Last Dawn"];
const ART_EMOJI = ["📜", "💎", "👁️", "👑", "🔑", "🔆", "🔮", "🪬", "📕", "🗡️", "🔮", "🦯", "🧭", "🎭", "📯"];

export const ARTIFACTS = Array.from({ length: 100 }, (_, i) => {
  const rarity = i < 8 ? "legendary" : i < 24 ? "epic" : i < 55 ? "rare" : i < 80 ? "uncommon" : "common";
  return {
    id: i + 1,
    name: `${ART_PREFIX[i % 15]} ${ART_SUFFIX[Math.floor(i / 15) % 15]}`,
    emoji: ART_EMOJI[i % 15],
    rarity,
    lore: `Recovered relic #${i + 1}. Its origin predates recorded galactic history.`,
  };
});

// ── Relics (500) — procedurally named, stable ids (20 adjectives × 25 nouns) ──
const REL_ADJ = ["Cracked", "Glowing", "Ancient", "Rusted", "Shimmering", "Frozen", "Burned", "Whispering", "Pulsing", "Fractured", "Dusty", "Polished", "Cursed", "Blessed", "Singing", "Molten", "Petrified", "Translucent", "Tarnished", "Humming"];
const REL_NOUN = ["Idol", "Amulet", "Coin", "Charm", "Totem", "Sigil", "Tablet", "Fragment", "Token", "Talisman", "Reliquary", "Shard", "Mote", "Wisp", "Vessel", "Censer", "Pendant", "Rune", "Glyph", "Mark", "Seal", "Brand", "Figurine", "Locket", "Crest"];
const REL_EMOJI = ["🗿", "📿", "🪙", "🔮", "🦴", "🔰", "🪶", "🏺", "🧿", "🔱", "⚱️", "💠", "✨", "🌫️", "🪔", "🪔", "📿", "🔠", "💠", "🔖", "🔖", "🏷️", "🧸", "💌", "🎖️"];

export const RELICS = Array.from({ length: 500 }, (_, i) => {
  const rarity = i < 15 ? "legendary" : i < 50 ? "epic" : i < 160 ? "rare" : i < 320 ? "uncommon" : "common";
  return {
    id: i + 1,
    name: `${REL_ADJ[i % 20]} ${REL_NOUN[Math.floor(i / 20) % 25]}`,
    emoji: REL_EMOJI[i % 25],
    rarity,
    lore: `A minor relic of a forgotten people.`,
  };
});

export const SPECIES_COUNT = ALIEN_SPECIES.length;
export const ARTIFACT_COUNT = ARTIFACTS.length;
export const RELIC_COUNT = RELICS.length;