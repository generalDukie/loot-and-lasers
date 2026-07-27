import { getEffectiveMissionDuration } from "@/lib/fuelMounts";

// ═══════════════════════════════════════════
// RACES
// ═══════════════════════════════════════════
export const RACES = {
  Zyrathi: {
    name: "Zyrathi",
    emoji: "🐉",
    tagline: "Scaled hotheads from the Ember Nebula",
    lore: "Dragonfolk with armor for skin and a temper for fuel. They punch first, negotiate later, and insist the smoking crater was 'defensive.' Great at war. Terrible at dinner parties.",
    bonuses: { strength: 0.06, vitality: 0.04 },
    skinColors: ["#2D5A3D", "#8B4513", "#4A0E4E", "#1C3D5A"],
    eyeStyles: ["Slit Ember", "Twin Flame", "Void Gaze"],
    markings: ["Tribal Scars", "Heat Lines", "Scale Crown", "None"],
  },
  Cognati: {
    name: "Cognati",
    emoji: "🤖",
    tagline: "Walking spreadsheets with laser opinions",
    lore: "Half chrome, half attitude, fully convinced they already simulated this conversation. They run the numbers, win the argument, then blue-screen when someone asks how their day was.",
    bonuses: { intellect: 0.06, agility: 0.04 },
    skinColors: ["#C0C0C0", "#1a1a2e", "#0D2137", "#3D3D3D"],
    eyeStyles: ["LED Array", "Holographic", "Scan Beam"],
    markings: ["Circuit Lines", "Data Streams", "Chrome Plating", "None"],
  },
  Luminae: {
    name: "Luminae",
    emoji: "🌟",
    tagline: "Living disco balls with a hero complex",
    lore: "Starlight given legs and an ego. They light up corridors, blind friends by accident, and somehow always land on their feet. Bring sunglasses. And maybe a mirror.",
    bonuses: { intellect: 0.04, luck: 0.06 },
    skinColors: ["#E8D5B7", "#C9B8FF", "#B8E6FF", "#FFE4B5"],
    eyeStyles: ["Star Burst", "Nebula Swirl", "Aurora Glow"],
    markings: ["Light Veins", "Star Map", "Constellation", "None"],
  },
  Grothak: {
    name: "Grothak",
    emoji: "💪",
    tagline: "High-gravity tanks who treat walls as suggestions",
    lore: "Grew up where the air weighs more than your regrets. Slow to start, impossible to stop, and vaguely offended by doors. If it needs smashing, hire a Grothak. If it needs subtlety… also hire a Grothak, then apologize.",
    bonuses: { strength: 0.04, vitality: 0.06 },
    skinColors: ["#696969", "#8B7355", "#4A4A4A", "#5C4033"],
    eyeStyles: ["Deep Set", "Crystal Shard", "Magma Core"],
    markings: ["Crack Lines", "Moss Growth", "Gem Inlays", "None"],
  },
  Synthara: {
    name: "Synthara",
    emoji: "🎭",
    tagline: "Face-swappers from the Shadow Reach",
    lore: "Professional strangers. They borrow faces, walk into restricted zones, and leave with the goods plus your dignity. Trust them? Sure. Just count the spoons afterward.",
    bonuses: { agility: 0.06, luck: 0.04 },
    skinColors: ["#2E1A47", "#1A3C34", "#3D1F1F", "#1A1A3C"],
    eyeStyles: ["Shifting Iris", "Mirrored", "Phantom Glow"],
    markings: ["Shadow Wisps", "Phase Lines", "Mimic Spots", "None"],
  },
};

// ═══════════════════════════════════════════
// CLASSES
// ═══════════════════════════════════════════
export const CLASSES = {
  Vanguard: {
    name: "Vanguard",
    emoji: "⚔️",
    tagline: "Heavy hitter with high armor and reliable damage",
    description: "Slow, heavy-hitting powerhouse. Vanguards wade into the thick of it with massive weapons and the armor to shrug off anything thrown back.",
    primaryStat: "strength",
    secondaryStat: "vitality",
    baseStats: { strength: 12, agility: 8, intellect: 6, vitality: 10, luck: 4 },
    special: {
      name: "Unstoppable",
      effect: "Every 4th attack deals 200% damage and ignores 25% of the target's armor.",
      identity: "Slow, heavy-hitting powerhouse.",
    },
  },
  "Shadow Operative": {
    name: "Shadow Operative",
    emoji: "🗡️",
    tagline: "Dodges attacks and lands devastating critical hits",
    description: "Operating from the shadows, these elite agents weave between blows and answer every dodge with a killing strike.",
    primaryStat: "agility",
    secondaryStat: "luck",
    baseStats: { strength: 7, agility: 14, intellect: 8, vitality: 5, luck: 6 },
    special: {
      name: "Shadowstep",
      effect: "Every successful dodge grants +25% damage on the next attack (resets after the attack).",
      identity: "Rewards evasive, high-risk gameplay.",
    },
  },
  Technomancer: {
    name: "Technomancer",
    emoji: "⚡",
    tagline: "High burst damage that partially ignores armor",
    description: "Blending psionic arts with overclocked tech, Technomancers unleash explosive bursts that punch straight through defenses.",
    primaryStat: "intellect",
    secondaryStat: "luck",
    baseStats: { strength: 5, agility: 7, intellect: 14, vitality: 6, luck: 8 },
    special: {
      name: "Overcharge",
      effect: "Every 3rd spell is guaranteed to critically strike and ignores 20% of the target's armor/shields.",
      identity: "Explosive burst damage.",
    },
  },
  "Astral Warden": {
    name: "Astral Warden",
    emoji: "🛡️",
    tagline: "Extremely durable survivor with shields and regeneration",
    description: "Not a healer — a survivor. Astral Wardens are nigh-impossible to kill, layering shields, regeneration, and damage reduction to simply refuse to die.",
    primaryStat: "vitality",
    secondaryStat: "intellect",
    baseStats: { strength: 8, agility: 6, intellect: 10, vitality: 14, luck: 2 },
    special: {
      name: "Cosmic Barrier",
      effect: "Begins every battle with a shield equal to 20% of max Health. Regenerates 2% of max Health at the start of every turn. Shield cannot be restored once broken.",
      identity: "The class that simply refuses to die.",
    },
  },
  "Cosmic Engineer": {
    name: "Cosmic Engineer",
    emoji: "🔧",
    tagline: "Gadgets, drones, and status effects win over time",
    description: "If it can be built, hacked, or jury-rigged, a Cosmic Engineer is already deploying it. Drones, poisons, burns, and EMPs turn the fight into a war of attrition they always win.",
    primaryStat: "intellect",
    secondaryStat: "luck",
    baseStats: { strength: 6, agility: 10, intellect: 12, vitality: 7, luck: 5 },
    special: {
      name: "Combat Drone",
      effect: "Deploys a drone at the start of combat that fires every other turn for 30% weapon damage. The drone cannot be targeted or destroyed.",
      identity: "Wins through gadgets and sustained pressure.",
    },
  },
};

// ═══════════════════════════════════════════
// MISSIONS
// ═══════════════════════════════════════════
export const MISSION_TEMPLATES = [
  { name: "Patrol the Rimward Sector", location: "Nebula Station Alpha", description: "Stroll the rim like you own the place. Mostly squinting at blips that are, statistically, 99% space geese. Bring snacks and a thermos of questionable coffee.", difficulty: "easy", sector: 1, duration_seconds: 60, risk: 1, rewards: { experience: 25, stardust: 50, item_rarity_chance: "common" }, level_requirement: 1 },
  { name: "Salvage Run: Derelict Freighter", location: "Wreck of the ISS Meridian", description: "The ISS Meridian went quiet forty years ago. The cargo? Still there. The crew? Also still there, sort of. Bring a crowbar, a strong denial gland, and maybe a spare pair of pants.", difficulty: "easy", sector: 1, duration_seconds: 120, risk: 2, rewards: { experience: 40, stardust: 80, item_rarity_chance: "uncommon" }, level_requirement: 1 },
  { name: "Asteroid Mining Operation", location: "Kelvari Belt", description: "Smack glowing space rocks until they confess their secrets. The rocks have started fighting back recently. Nobody knows why. It's a whole thing. Bring a bigger hammer.", difficulty: "medium", sector: 1, duration_seconds: 180, risk: 2, rewards: { experience: 65, stardust: 130, item_rarity_chance: "uncommon" }, level_requirement: 2 },
  { name: "Xeno-Archaeological Dig", location: "Planet Ashara IV", description: "Dig up ruins older than your grandpa's password. Whatever's buried down there keeps whispering your name in a language that shouldn't exist. It's probably fine. Probably.", difficulty: "medium", sector: 2, duration_seconds: 300, risk: 3, rewards: { experience: 100, stardust: 200, item_rarity_chance: "rare" }, level_requirement: 3 },
  { name: "Escort the Diplomat", location: "Luminae Homeworld", description: "Ambassador Zyr'tal is 'very important' and 'definitely not a war criminal.' Walk him through hostile territory while he critiques your posture. Do NOT, under any circumstances, let him order the seafood.", difficulty: "hard", sector: 2, duration_seconds: 420, risk: 3, rewards: { experience: 150, stardust: 300, item_rarity_chance: "rare" }, level_requirement: 4 },
  { name: "Infiltrate Pirate Stronghold", location: "Shadow Station Omega", description: "Sneak into the galaxy's worst-kept secret base, disable their shields, and try not to become someone's new parrot. Remember: stealth is just lying, but with extra steps and a turtleneck.", difficulty: "hard", sector: 3, duration_seconds: 600, risk: 4, rewards: { experience: 220, stardust: 450, item_rarity_chance: "epic" }, level_requirement: 5 },
  { name: "Void Rift Anomaly", location: "The Shattered Expanse", description: "A hole in spacetime is slowly eating the neighboring systems. Science says 'don't touch it.' We're paying you to touch it. A lot. With your hands. Good luck, you beautiful idiot.", difficulty: "elite", sector: 3, duration_seconds: 900, risk: 4, rewards: { experience: 350, stardust: 700, item_rarity_chance: "epic" }, level_requirement: 7 },
  { name: "Ancient AI Core Recovery", location: "Cognati Prime Archives", description: "Dive into a corrupted AI archive and rip out its glowing heart. The AI is unhappy about this. The AI has opinions. The AI has opinions AND lasers. This will be a conversation.", difficulty: "elite", sector: 4, duration_seconds: 1200, risk: 5, rewards: { experience: 500, stardust: 1000, item_rarity_chance: "legendary" }, level_requirement: 9 },
  { name: "Supernova Extraction", location: "Dying Star VX-9", description: "Harvest exotic matter from a star that is, cosmically speaking, about to throw the mother of all tantrums. The window is 'now-ish.' The star is 'also now-ish.' Please sync your watches. And your affairs.", difficulty: "legendary", sector: 4, duration_seconds: 1800, risk: 5, rewards: { experience: 800, stardust: 1500, item_rarity_chance: "legendary" }, level_requirement: 12 },
  { name: "Contraband Dash", location: "Keldris Reach", description: "Move some 'perfectly legal' cargo past a patrol that's definitely not looking for exactly this. The manifest says 'agricultural supplies.' The agricultural supplies are humming. Don't ask.", difficulty: "easy", sector: 1, duration_seconds: 90, risk: 1, rewards: { experience: 30, stardust: 60, item_rarity_chance: "common" }, level_requirement: 1 },
  { name: "Distress Signal: Freighter Vael", location: "Drift Sector 7", description: "A cargo ship sent a distress call consisting entirely of someone saying 'whoops' on a loop. Either they're very unlucky or very honest. Either way, they're paying.", difficulty: "easy", sector: 1, duration_seconds: 150, risk: 2, rewards: { experience: 45, stardust: 90, item_rarity_chance: "uncommon" }, level_requirement: 1 },
  { name: "Black Market Buy", location: "The Bazaar of Torment", description: "Meet a contact who insists on being called 'The Whisper' but whose real name is Gary. He's got rare goods and even rarer BO. Hold your breath and negotiate.", difficulty: "medium", sector: 1, duration_seconds: 210, risk: 2, rewards: { experience: 70, stardust: 140, item_rarity_chance: "uncommon" }, level_requirement: 2 },
  { name: "Bioluminescent Survey", location: "Glowlily Marshes of Vesh", description: "Catalogue glowing alien flora that communicates via color-coded mood lighting. Right now it's flashing 'annoyed pink.' You've been warned. Bring sunscreen. Emotional sunscreen.", difficulty: "medium", sector: 2, duration_seconds: 330, risk: 3, rewards: { experience: 110, stardust: 220, item_rarity_chance: "rare" }, level_requirement: 3 },
  { name: "Prison Break: Vault Helix", description: "Spring a wrongly-accused scientist from a maximum-security asteroid prison. The warden is a massive fan of his work and won't stop asking for selfies. Escape plan includes 'sorry, we're late for a thing.'", location: "Vault Helix Penal Colony", difficulty: "hard", sector: 2, duration_seconds: 450, risk: 3, rewards: { experience: 160, stardust: 320, item_rarity_chance: "rare" }, level_requirement: 4 },
  { name: "Hunt the Rogue Synthetic", location: "Ferro Wastes", description: "A combat android went rogue and is now living in a junkyard, writing poetry. It's actually quite good. You still have to decommission it. Bring tissues. And a really big magnet.", difficulty: "hard", sector: 3, duration_seconds: 540, risk: 4, rewards: { experience: 230, stardust: 460, item_rarity_chance: "epic" }, level_requirement: 5 },
  { name: "Quasar Heist", location: "Banking Nexus of Cygnus", description: "Rob the most secure vault in the galaxy. The vault's AI has been bored for 300 years and might actually help you just for the entertainment. Don't disappoint it. It remembers faces.", difficulty: "elite", sector: 3, duration_seconds: 810, risk: 4, rewards: { experience: 360, stardust: 720, item_rarity_chance: "epic" }, level_requirement: 7 },
  { name: "Diplomatic Incident Cleanup", location: "Cethylli Embassy Ring", description: "Two alien species are about to go to war over a mispronounced compliment. You have one hour to apologize in seven dialects, including one that doesn't have mouths. Bring phrasebooks and a sense of humility.", difficulty: "medium", sector: 2, duration_seconds: 270, risk: 3, rewards: { experience: 95, stardust: 190, item_rarity_chance: "rare" }, level_requirement: 3 },
  { name: "Ghost Ship Investigation", location: "Wreck of the Pale Horizon", description: "A ship reappeared after being lost for 200 years. The crew is gone. The coffee is still warm. The navigation logs just say 'we're sorry' on loop. Go figure out what 'sorry' means here.", difficulty: "hard", sector: 3, duration_seconds: 570, risk: 4, rewards: { experience: 240, stardust: 480, item_rarity_chance: "epic" }, level_requirement: 6 },
  { name: "Nebula Beast Migration", location: "Veil Nebula Corridor", description: "Escort a pod of migrating space leviathans through a shipping lane. The leviathans are enormous, gentle, and deeply curious about your ship. They will absolutely try to taste it. Be polite.", difficulty: "medium", sector: 1, duration_seconds: 240, risk: 2, rewards: { experience: 80, stardust: 160, item_rarity_chance: "uncommon" }, level_requirement: 2 },
  { name: "Black Hole Survey", location: "Accretion Rim of X-7", description: "Take readings from just outside a black hole. The physics get weird. Your watch runs backwards. Your lunch is now your dinner. Don't lean too far over the railing. There is no railing.", difficulty: "elite", sector: 4, duration_seconds: 1050, risk: 5, rewards: { experience: 400, stardust: 800, item_rarity_chance: "legendary" }, level_requirement: 8 },
];

// ═══════════════════════════════════════════
// ITEM GENERATION
// ═══════════════════════════════════════════
const ITEM_NAMES = {
  weapon: ["Plasma Rifle", "Ion Blaster", "Photon Cannon", "Pulse Repeater", "Neutrino Sniper", "Graviton Shotgun", "Phase Pistol", "Singularity Cannon"],
  armor: ["Nanoweave Suit", "Titan Plating", "Void Shell", "Quantum Mesh", "Stellar Guard", "Plasma Coat", "Crystal Carapace", "Shadow Shroud"],
  helmet: ["Neural Crown", "Scan Visor", "Astral Helm", "Combat HUD", "Psi Amplifier", "Void Mask", "Star Circlet", "Echo Chamber"],
  boots: ["Gravity Boots", "Phase Walkers", "Jet Treads", "Stealth Soles", "Mag-Lock Greaves", "Drift Runners", "Storm Striders", "Warp Steps"],
  legs: ["Void Greaves", "Plasma Leggings", "Titan Leg Plates", "Phase Treads", "Graviton Greaves", "Storm Leggings", "Crystal Shin Guards", "Shadow Greaves", "Nebula Leg Plating", "Ion Shin Guards", "Quantum Greaves", "Starforged Leggings", "Voidstrider Greaves", "Mag-Lock Leg Plates", "Pulse Leggings", "Solar Greaves", "Abyssal Leg Guards", "Photon Leggings", "Echo Greaves", "Drift Leg Plates", "Warp Shin Guards", "Singularity Greaves", "Specter Leggings", "Ember Leg Plates", "Frostbound Greaves", "Volt Leggings", "Prism Shin Guards", "Null Greaves", "Comet Leggings", "Astral Leg Plates", "Ironclad Greaves", "Nebula Shin Guards", "Voidwalker Leggings", "Cinder Leg Plates", "Glitch Greaves", "Horizon Leggings", "Tempest Shin Guards", "Obsidian Greaves", "Chrome Leggings", "Radiant Leg Plates", "Phantom Greaves", "Nova Shin Guards", "Tidal Leggings", "Magma Leg Plates", "Glacial Greaves", "Stellar Leggings", "Eclipse Shin Guards", "Vortex Greaves", "Lunar Leg Plates", "Genesis Leggings"],
  neck: ["Quantum Amulet", "Void Collar", "Nebula Pendant", "Star Choker", "Plasma Torc", "Ion Amulet", "Graviton Pendant", "Shadow Collar", "Crystal Necklace", "Phase Amulet", "Singularity Pendant", "Echo Collar", "Storm Torc", "Abyssal Amulet", "Photon Pendant", "Voidstrider Collar", "Mag-Lock Choker", "Solar Amulet", "Frostbound Pendant", "Volt Collar", "Prism Amulet", "Null Pendant", "Comet Choker", "Astral Collar", "Ironclad Amulet", "Nebula Choker", "Voidwalker Collar", "Cinder Amulet", "Glitch Pendant", "Horizon Collar", "Tempest Torc", "Obsidian Amulet", "Chrome Pendant", "Radiant Choker", "Phantom Collar", "Nova Amulet", "Tidal Pendant", "Magma Collar", "Glacial Amulet", "Stellar Choker", "Eclipse Pendant", "Vortex Collar", "Lunar Amulet", "Genesis Pendant", "Ember Torc", "Drift Pendant", "Wraith Collar", "Pulsar Amulet", "Quasar Choker", "Celestial Torc"],
  accessory: ["Quantum Amulet", "Data Core Ring", "Nebula Charm", "Warp Beacon", "Chrono Band", "Star Shard Pendant", "Void Capacitor", "Neural Link"],
  ship_module: ["Warp Drive MK-I", "Shield Amplifier", "Cargo Expander", "Sensor Array", "Cloaking Module", "Turret System", "Engine Booster", "Hull Reinforcement"],
};

// ═══════════════════════════════════════════
// CLASS-SPECIFIC SIGNATURE WEAPONS
// Each class has a weapon that favours its primary stat, making it the
// ideal drop for that class. These appear in the shop and as loot.
// ═══════════════════════════════════════════
export const CLASS_WEAPONS = {
  Vanguard:           { name: "Vanguard Assault Rifle", emoji: "🔫", flavor: "A rugged battle rifle that punches through armor with relentless fire." },
  "Shadow Operative": { name: "Shadowstrike Silencer",  emoji: "🗡️", flavor: "A suppressed pistol that finds the gaps in any defense." },
  Technomancer:       { name: "Arcane Pulse Caster",     emoji: "🔮", flavor: "Channels raw psionic energy into devastating energy bolts." },
  "Astral Warden":    { name: "Cosmic Aegis Blaster",   emoji: "✨", flavor: "Radiates protective starlight with every shot." },
  "Cosmic Engineer":  { name: "Plasma Multi-Cannon",    emoji: "💥", flavor: "Jury-rigged to fire everything from drones to EMPs." },
};

export const RARITY_MULTIPLIERS = { common: 1, uncommon: 1.3, rare: 1.7, epic: 2.2, legendary: 3 };

// Resolve a weapon icon from its base/full name. Prefers class signature matches,
// then known loot base names, then keyword heuristics — never falls back to the
// raw text name (that used to render as a giant label in arena/inventory).
const LOOT_WEAPON_EMOJIS = {
  "Plasma Rifle": "🔫", "Ion Blaster": "⚡", "Photon Cannon": "💥", "Pulse Repeater": "🔫",
  "Neutrino Sniper": "🎯", "Graviton Shotgun": "💥", "Phase Pistol": "🔫", "Singularity Cannon": "🌌",
};

export function weaponEmojiFor(name, baseName) {
  if (baseName && LOOT_WEAPON_EMOJIS[baseName]) return LOOT_WEAPON_EMOJIS[baseName];
  for (const w of Object.values(CLASS_WEAPONS)) {
    if (baseName === w.name || (name && name.includes(w.name))) return w.emoji;
  }
  if (name) {
    for (const [base, emoji] of Object.entries(LOOT_WEAPON_EMOJIS)) {
      if (name.includes(base)) return emoji;
    }
    const n = name.toLowerCase();
    if (/sword|blade|saber|katana/.test(n)) return "⚔️";
    if (/dagger|knife|silencer/.test(n)) return "🗡️";
    if (/staff|wand|caster|rod/.test(n)) return "🔮";
    if (/bow|crossbow/.test(n)) return "🏹";
    if (/axe|hammer|mace/.test(n)) return "🪓";
    if (/cannon|shotgun|launcher/.test(n)) return "💥";
    if (/sniper/.test(n)) return "🎯";
    if (/blaster|aegis/.test(n)) return "✨";
    if (/rifle|pistol|gun|repeater/.test(n)) return "🔫";
  }
  return "🔫";
}

// Maximum items a character can hold (equipped + unequipped combined).
export const INVENTORY_CAP = 10;

// Dynamic inventory cap — the Cargo Hold ship upgrade adds +1 slot per tier
// (up to +10), raising the cap from 10 to 20. Slots are discrete so the ship's
// upgrade multiplier does NOT apply here.
export function getInventoryCap(character) {
  const ids = getActiveShipMods(character);
  let bonus = 0;
  SHIP_MODS.cargo_hold.tiers.forEach((t) => { if (ids.includes(t.id)) bonus += t.inventory_cap_bonus || 0; });
  return Math.min(20, INVENTORY_CAP + bonus);
}
const RARITY_COLORS = { common: "#9CA3AF", uncommon: "#22C55E", rare: "#3B82F6", epic: "#A855F7", legendary: "#F59E0B" };

// Better gear unlocks as you level. Each tier has a minimum level before it can drop.
const RARITY_ORDER = ["common", "uncommon", "rare", "epic", "legendary"];
export const RARITY_UNLOCK_LEVEL = { common: 1, uncommon: 1, rare: 3, epic: 6, legendary: 12 };

function _maxUnlockedRarityIdx(level) {
  let idx = 0;
  for (let t = 0; t < RARITY_ORDER.length; t++) {
    if (level >= (RARITY_UNLOCK_LEVEL[RARITY_ORDER[t]] || 1)) idx = t;
  }
  return idx;
}

// Clamp a rarity down to the best tier the player's level has unlocked.
export function clampRarityByLevel(rarity, playerLevel = 1) {
  const level = Math.max(1, playerLevel || 1);
  const i = RARITY_ORDER.indexOf(rarity);
  return RARITY_ORDER[Math.max(0, Math.min(i < 0 ? 0 : i, _maxUnlockedRarityIdx(level)))];
}
const FLAVOR_TEXTS = [
  "Salvaged from a dead captain's grip.",
  "Hums with residual void energy.",
  "The previous owner didn't need it anymore.",
  "Smells faintly of ozone and regret.",
  "Serial number: [REDACTED]",
  "WARNING: May attract void entities.",
  "Certified pre-owned. One careful owner.",
  "Found in a suspiciously clean airlock.",
];

// ═══════════════════════════════════════════
// UNIQUE ITEM NAMING — every generated item gets a descriptive prefix (from
// its dominant stat) + base name + epithet so no two items share a name.
// ensureUniqueItemName is the safety net at creation time: if a generated
// name already exists in the player's inventory, a roman-numeral suffix is
// appended until it's unique.
// ═══════════════════════════════════════════
const STAT_PREFIXES = {
  strength: ["Mighty", "Brutal", "Crushing", "Titan-Forged", "Raging"],
  agility: ["Fleet", "Swift", "Phantom", "Nimble", "Tempest"],
  intellect: ["Brilliant", "Arcane", "Sage-Crafted", "Cognizant", "Psi-Touched"],
  vitality: ["Stalwart", "Enduring", "Bulwark", "Ironheart", "Resolute"],
  luck: ["Fortunate", "Auspicious", "Cursed", "Trickster's", "Fateful"],
};
const EPITHETS = [
  "of Ten Thousand Truths", "of Two Hundred Truths", "of the Crimson Dawn",
  "of Shattered Stars", "of the Void", "of Annihilation", "of the Eclipse",
  "of Eternal Starfire", "of the Singularity", "of Cosmic Wrath",
  "of Precision", "of the Nebula", "of Resonance", "of Storms",
  "of the Drift", "of Ash", "of the Whisper", "of the Last Light",
  "of Forgotten Kings", "of the Hollow Sun", "of Silent Thunder",
  "of the Pale Horizon", "of the Black Comet", "of Fractured Time",
  "of the Outer Dark", "of Ember and Ash", "of the Lost Signal",
  "of the Quantum Tide", "of the Gilded Wreck", "of Broken Oaths",
  "of the Dying Glow", "of the Long Night", "of the Iron Verdict",
  "of the Velvet Abyss", "of the Mirror Shard", "of the Wandering Star",
  "of the Cold Equation", "of the Final Argument", "of the Quiet End",
  "of the Hollow Crown", "of the Dead Frequency",
];

export function buildItemName(baseName, rarity, stats, rng = Math.random) {
  const statKeys = ["strength", "agility", "intellect", "vitality", "luck"];
  let dominant = "strength", best = -1;
  for (const k of statKeys) {
    const v = (stats && stats[k]) || 0;
    if (v > best) { best = v; dominant = k; }
  }
  const pool = STAT_PREFIXES[dominant] || STAT_PREFIXES.strength;
  const prefix = pool[Math.floor(rng() * pool.length)];
  const epithet = EPITHETS[Math.floor(rng() * EPITHETS.length)];
  const name = `${prefix} ${baseName} ${epithet}`;
  return rarity === "legendary" ? `The ${name}` : name;
}

function romanize(num) {
  const lookup = [["M", 1000], ["CM", 900], ["D", 500], ["CD", 400], ["C", 100], ["XC", 90], ["L", 50], ["XL", 40], ["X", 10], ["IX", 9], ["V", 5], ["IV", 4], ["I", 1]];
  let res = "";
  for (const [r, v] of lookup) { while (num >= v) { res += r; num -= v; } }
  return res;
}

// Guarantees an item's name doesn't collide with any existing name. If it
// does, appends a roman-numeral suffix (II, III, …) until unique.
export function ensureUniqueItemName(item, existingNames) {
  const taken = new Set((existingNames || []).filter(Boolean));
  if (!taken.has(item.name)) return item;
  const base = item.name;
  let n = 1;
  let name = base;
  while (taken.has(name)) {
    n++;
    name = `${base} ${romanize(n)}`;
  }
  return { ...item, name };
}

function _rollItem(rarity, playerLevel, type, rng) {
  const r = rng || Math.random;
  const itemType = type || ["weapon", "armor", "helmet", "boots", "legs", "neck", "accessory", "ship_module"][Math.floor(r() * 8)];
  const names = ITEM_NAMES[itemType];
  const baseName = names[Math.floor(r() * names.length)];
  const mult = RARITY_MULTIPLIERS[rarity];
  const baseValue = Math.max(1, Math.floor(playerLevel * 2 * mult));

  const stats = {};
  const statKeys = ["strength", "agility", "intellect", "vitality", "luck"];
  const numStats = rarity === "common" ? 1 : rarity === "uncommon" ? 2 : rarity === "rare" ? 3 : rarity === "epic" ? 4 : 5;
  const chosenStats = [...statKeys].sort(() => r() - 0.5).slice(0, numStats);
  chosenStats.forEach(s => { stats[s] = Math.max(1, Math.floor((r() * baseValue) + 1)); });

  return {
    name: buildItemName(baseName, rarity, stats, r),
    base_name: baseName,
    type: itemType,
    rarity,
    level_requirement: Math.max(1, playerLevel - 1),
    stats,
    flavor_text: FLAVOR_TEXTS[Math.floor(r() * FLAVOR_TEXTS.length)],
    sell_value: Math.floor(10 * mult * playerLevel),
    is_equipped: false,
    ...(itemType === "weapon" ? { emoji: weaponEmojiFor(baseName, baseName) } : {}),
  };
}

// Generates a class-specific signature weapon — stats heavily favour the
// class's primary stat, with a smaller secondary bonus.
export function generateClassWeapon(className, rarity, playerLevel, rng = Math.random) {
  const w = CLASS_WEAPONS[className] || CLASS_WEAPONS.Vanguard;
  const cls = CLASSES[className] || CLASSES.Vanguard;
  const mult = RARITY_MULTIPLIERS[rarity];
  const baseValue = Math.max(1, Math.floor(playerLevel * 2 * mult));

  const stats = {};
  const primary = cls.primaryStat || "strength";
  const secondary = cls.secondaryStat || "luck";
  stats[primary] = Math.max(2, Math.floor(baseValue * 0.7) + 1);
  stats[secondary] = Math.max(1, Math.floor(baseValue * 0.3) + 1);

  return {
    name: buildItemName(w.name, rarity, stats, rng),
    base_name: w.name,
    type: "weapon",
    rarity,
    level_requirement: Math.max(1, playerLevel - 1),
    stats,
    flavor_text: w.flavor,
    sell_value: Math.floor(15 * mult * playerLevel),
    is_equipped: false,
    emoji: w.emoji,
  };
}

export function generateItem(rarity, playerLevel, type) {
  // 20% chance for a class-specific signature weapon when rolling a weapon
  // (or when the type is random and lands on a weapon).
  const rollingWeapon = !type || type === "weapon";
  if (rollingWeapon && Math.random() < 0.20) {
    const classKeys = Object.keys(CLASS_WEAPONS);
    const className = classKeys[Math.floor(Math.random() * classKeys.length)];
    return generateClassWeapon(className, rarity, playerLevel);
  }
  return _rollItem(rarity, playerLevel, type, Math.random);
}

// ═══════════════════════════════════════════
// ATTRIBUTE POINTS
// ═══════════════════════════════════════════
export const STAT_POINTS_START = 10;
export const STAT_POINTS_PER_LEVEL = 4;

// ═══════════════════════════════════════════
// STARDUST (primary currency — earned via missions, arena, and dissolving gear in the Black Hole)
// ═══════════════════════════════════════════
export const STARDUST_PER_RARITY = { common: 8, uncommon: 20, rare: 50, epic: 120, legendary: 280 };

// Gear type weight — weapons/ship modules dissolve for more than materials/consumables.
export const STARDUST_TYPE_WEIGHT = {
  weapon: 1.4,
  armor: 1.2,
  helmet: 1.0,
  boots: 1.0,
  legs: 1.0,
  neck: 1.1,
  accessory: 1.15,
  ship_module: 1.35,
  material: 0.5,
  consumable: 0.6,
};

// Stardust yielded by dissolving an item — scales with rarity, stats, and item level,
// and varies per gear type so every kind of loot has a distinct salvage value.
export function computeStardustValue(item) {
  const base = STARDUST_PER_RARITY[item.rarity] ?? 8;
  const statSum = item.stats ? Object.values(item.stats).reduce((a, b) => a + (b || 0), 0) : 0;
  const statBonus = statSum * 2;
  const levelMult = 1 + (item.level_requirement || 1) * 0.15;
  const typeWeight = STARDUST_TYPE_WEIGHT[item.type] ?? 1;
  return Math.max(1, Math.round((base + statBonus) * levelMult * typeWeight));
}

// Nova-crystal cost for premium gear — legendary items require both currencies,
// and the crystal cost scales with item level so high-level legendaries cost more.
export const NOVA_CRYSTAL_PER_RARITY = { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 10 };
export function computeNovaCrystalCost(item) {
  const base = NOVA_CRYSTAL_PER_RARITY[item.rarity] ?? 0;
  if (!base) return 0;
  const levelMult = 1 + (item.level_requirement || 1) * 0.1;
  return Math.max(1, Math.round(base * levelMult));
}

// ═══════════════════════════════════════════
// ROTATING SHOP (refreshes every 6 hours) — spend stardust
// ═══════════════════════════════════════════
const SHOP_WINDOW_MS = 6 * 60 * 60 * 1000;

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function getShopWindow() {
  const ms = Date.now();
  const idx = Math.floor(ms / SHOP_WINDOW_MS);
  const startsAt = idx * SHOP_WINDOW_MS;
  const endsAt = startsAt + SHOP_WINDOW_MS;
  return { idx, startsAt, endsAt, secondsLeft: Math.max(0, Math.floor((endsAt - ms) / 1000)) };
}

export function generateShopInventory(seed, playerLevel) {
  const rng = mulberry32(seed * 7919 + 13);
  const r = () => rng();
  const types = ["weapon", "armor", "helmet", "boots", "legs", "neck", "accessory", "ship_module"];
  const slots = [];
  for (let i = 0; i < 6; i++) {
    const type = types[Math.floor(r() * types.length)];
    const roll = r();
    const rarity = clampRarityByLevel(
      roll < 0.4 ? "common" : roll < 0.7 ? "uncommon" : roll < 0.88 ? "rare" : roll < 0.97 ? "epic" : "legendary",
      playerLevel
    );
    const item = _rollItem(rarity, Math.max(1, playerLevel), type, r);
    // Shop prices scale with the same stardust value curve so costs track the economy.
    const cost = Math.max(5, Math.round(computeStardustValue(item) * 1.2));
    const nova_cost = computeNovaCrystalCost(item);
    slots.push({ ...item, _slotId: `${seed}-${i}`, cost, nova_cost });
  }
  // Class-specific signature weapon — premium slot, biased to higher rarity.
  const classKeys = Object.keys(CLASS_WEAPONS);
  const className = classKeys[Math.floor(r() * classKeys.length)];
  const cwRoll = r();
  const cwRarity = clampRarityByLevel(
    cwRoll < 0.25 ? "uncommon" : cwRoll < 0.60 ? "rare" : cwRoll < 0.88 ? "epic" : "legendary",
    playerLevel
  );
  const cwItem = generateClassWeapon(className, cwRarity, Math.max(1, playerLevel), r);
  const cwCost = Math.max(5, Math.round(computeStardustValue(cwItem) * 1.35));
  slots.push({ ...cwItem, _slotId: `${seed}-cw`, cost: cwCost, nova_cost: computeNovaCrystalCost(cwItem) });
  return slots;
}

// Shop consumables — 6 random stims per window, legendary appears 1% of the time.
// Each slot has a stable _slotId so purchases can be tracked and replaced individually.
export function generateShopConsumableSlots(seed) {
  const rng = mulberry32(seed * 4099 + 7);
  const slots = [];
  for (let i = 0; i < 6; i++) {
    const r = rng();
    let def;
    if (r < 0.01) {
      const legendary = CONSUMABLES.filter((c) => c.rarity === "legendary");
      def = legendary[Math.floor(rng() * legendary.length)];
    } else {
      const pool = CONSUMABLES.filter((c) => c.rarity !== "legendary");
      def = pool[Math.floor(rng() * pool.length)];
    }
    slots.push({ ...def, _slotId: `cons-${seed}-${i}` });
  }
  return slots;
}

// ═══════════════════════════════════════════
// ITEM DROP RATES — explicit % per mission loot tier (each row sums to 100).
// The mission's item_rarity_chance picks the row; a single roll picks the
// outcome rarity. Player level still gates the ceiling: any tier above the
// player's best-unlocked tier downgrades to that tier (rare unlocks at Lv3,
// epic at Lv6, legendary at Lv12).
// ═══════════════════════════════════════════
export const ITEM_DROP_RATES = {
  common:    { common: 85, uncommon: 12, rare: 3,  epic: 0,  legendary: 0  },
  uncommon:  { common: 55, uncommon: 35, rare: 8,  epic: 2,  legendary: 0  },
  rare:      { common: 25, uncommon: 40, rare: 25, epic: 8,  legendary: 2  },
  epic:      { common: 10, uncommon: 25, rare: 35, epic: 22, legendary: 8  },
  legendary: { common: 0,  uncommon: 10, rare: 30, epic: 35, legendary: 25 },
};

function _rollFromTable(rates) {
  const roll = Math.random() * 100;
  let cumulative = 0;
  for (const rarity of RARITY_ORDER) {
    cumulative += rates[rarity] || 0;
    if (roll < cumulative) return rarity;
  }
  return RARITY_ORDER[0];
}

// Roll loot rarity using the explicit drop-rate table above, clamped to the
// best tier the player's level has unlocked.
export function rollItemRarity(chanceString, playerLevel = 1) {
  const level = Math.max(1, playerLevel || 1);
  const maxIdx = _maxUnlockedRarityIdx(level);
  const rates = ITEM_DROP_RATES[chanceString] || ITEM_DROP_RATES.common;
  const idx = Math.min(RARITY_ORDER.indexOf(_rollFromTable(rates)), maxIdx);
  return RARITY_ORDER[idx];
}

export function getExpForLevel(level) {
  // Gentler early curve so the first levels come quickly; still scales long-term.
  return Math.floor(60 * Math.pow(1.42, level - 1));
}

// Early-game acceleration: bonus XP + cheaper fuel for the first ~15-20 minutes.
// Tapers off as you level so progression normalizes for the long haul.
export function getEarlyXpMultiplier(level = 1) {
  const l = Math.max(1, level || 1);
  if (l <= 2) return 2.2;
  if (l <= 4) return 1.6;
  if (l <= 7) return 1.3;
  if (l <= 10) return 1.12;
  return 1;
}

export function getEarlyFuelDiscount(level = 1) {
  const l = Math.max(1, level || 1);
  if (l <= 2) return 3;
  if (l <= 4) return 2;
  if (l <= 7) return 1;
  return 0;
}

// ═══════════════════════════════════════════
// FUEL (mission energy)
// ═══════════════════════════════════════════
export const FUEL_MAX = 100;
// Fuel is a flat pool that refills to full every 24h (no per-minute regen).
export const FUEL_CYCLE_MS = 24 * 60 * 60 * 1000;
export const FUEL_PURCHASE_AMOUNT = 20;
export const FUEL_PURCHASE_COST = 10; // nova crystals
export const FUEL_PURCHASE_MAX = 5; // per 24h cycle

export function computeFuelCost(template) {
  // 1 fuel = 1 minute of mission time (30s = 0.5, 40s = 0.67, 60s = 1, etc.)
  const durationSeconds = Math.floor(template.duration_seconds || 60);
  return Math.round((durationSeconds / 60) * 100) / 100;
}

// The actual fuel that will be deducted at launch — applies ship-mod reductions,
// the early-game fuel discount, and the 0.5 minimum floor. Use this everywhere
// a fuel cost is displayed so it matches the actual deduction.
export function getEffectiveFuelCost(character, mission) {
  // Fuel is charged per minute of the ACTUAL (effective) mission time, so it
  // matches the duration shown after warp/fuel-mount reductions.
  const effectiveSeconds = getEffectiveMissionDuration(character, mission);
  const raw = effectiveSeconds / 60 - getModEffectTotal(character, "fuel_cost_reduction");
  return Math.max(0.5, Math.round(raw * 100) / 100);
}

// Returns a patch refilling fuel to max once the 24h cycle elapses, else null.
export function checkFuelReset(character) {
  const max = character.max_fuel || FUEL_MAX;
  const resetAt = character.fuel_reset_at ? new Date(character.fuel_reset_at) : null;
  const now = Date.now();
  if (!resetAt || now - resetAt.getTime() >= FUEL_CYCLE_MS) {
    return { fuel: max, fuel_reset_at: new Date(now).toISOString(), fuel_purchases: 0 };
  }
  return null;
}

// ═══════════════════════════════════════════
// DAILY MISSIONS (randomized, risk-scaled — always generates 5 quests)
// ═══════════════════════════════════════════
const COLLECTIBLES = [
  { name: "Void Geode", emoji: "🪨" },
  { name: "Star Fragment", emoji: "⭐" },
  { name: "Plasma Vial", emoji: "🧪" },
  { name: "Relic Shard", emoji: "🏺" },
  { name: "Nebula Mote", emoji: "🌌" },
  { name: "Quantum Coin", emoji: "🪙" },
  { name: "Memory Crystal", emoji: "💠" },
  { name: "Stardust Cluster", emoji: "✨" },
];
const RISK_DIFFICULTY = { 1: "easy", 2: "medium", 3: "medium", 4: "hard", 5: "elite" };
const RISK_RARITY = { 1: "common", 2: "uncommon", 3: "rare", 4: "epic", 5: "legendary" };

// Level → max mission duration (seconds) via waypoints:
//   L1=30s, L5=150s (2.5m), L10=300s (5m), L15=600s (10m), L25=1200s (20m, cap).
// Each daily quest occupies a tier (¼, ½, full) of this value, so at L25 the
// three quests land on 5m / 10m / 20m and lower levels scale down proportionally.
const MISSION_DURATION_WAYPOINTS = [
  { lvl: 1, sec: 30 },
  { lvl: 5, sec: 150 },
  { lvl: 10, sec: 300 },
  { lvl: 15, sec: 600 },
  { lvl: 25, sec: 1200 },
];
const MISSION_MAX_DURATION = 1200;
function levelMissionDuration(level) {
  const lvl = Math.max(1, level || 1);
  if (lvl >= 25) return MISSION_MAX_DURATION;
  let i = 0;
  while (i < MISSION_DURATION_WAYPOINTS.length - 1 && MISSION_DURATION_WAYPOINTS[i + 1].lvl < lvl) i++;
  const a = MISSION_DURATION_WAYPOINTS[i];
  const b = MISSION_DURATION_WAYPOINTS[i + 1] || a;
  if (b.lvl === a.lvl || lvl <= a.lvl) return a.sec;
  const t = (lvl - a.lvl) / (b.lvl - a.lvl);
  return Math.round(a.sec + (b.sec - a.sec) * t);
}

export function generateDailyMissions(character) {
  const level = character.level || 1;
  const maxSector = (character.highest_sector || 1) + 1;
  const doable = MISSION_TEMPLATES.filter((m) => m.level_requirement <= level && m.sector <= maxSector);
  const pool = doable.length ? doable : MISSION_TEMPLATES.filter((m) => m.level_requirement <= level);
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  const base = shuffled.length ? shuffled : MISSION_TEMPLATES;

  // Offer 3 quests; if fewer templates are unlocked, cycle the pool
  // with fresh risk/duration/collectible rolls so each quest is distinct.
  return Array.from({ length: 3 }, (_, i) => {
    const t = base[i % base.length];
    const maxRisk = level <= 2 ? 3 : level <= 5 ? 4 : 5;
    const risk = 1 + Math.floor(Math.random() * maxRisk);
    const yieldMult = 0.6 + risk * 0.35;
    // Mission duration scales with level via waypoints: 30s@L1, 2.5m@L5,
    // 5m@L10, 10m@L15, 20m@L25 (cap). The 3 daily quests each occupy a
    // different tier (¼, ½, full of the level's max) so at L25 they land on
    // 5m / 10m / 20m, and lower levels scale down proportionally.
    const baseMax = levelMissionDuration(level);
    const tierFactor = [0.25, 0.5, 1.0][i] ?? 1.0;
    const duration = Math.min(MISSION_MAX_DURATION, Math.max(30, Math.round((baseMax * tierFactor) / 15) * 15));
    const collectible = COLLECTIBLES[Math.floor(Math.random() * COLLECTIBLES.length)];
    return {
      ...t,
      _seed: `${Date.now()}-${i}`,
      risk,
      difficulty: RISK_DIFFICULTY[risk],
      duration_seconds: duration,
      rewards: {
        experience: Math.round(t.rewards.experience * yieldMult),
        stardust: Math.round(t.rewards.stardust * yieldMult),
        item_rarity_chance: RISK_RARITY[risk],
        collectible,
      },
    };
  });
}

// ═══════════════════════════════════════════
// LOW-FUEL FALLBACK — a short, level-agnostic errand offered when the player
// can't afford any of their daily missions. Duration is scaled to spend most
// of the remaining fuel (clamped 30s–5m, snapped to 15s) so a player with 0.5
// fuel still gets a runnable 30-second mission regardless of level.
// ═══════════════════════════════════════════
export function generateLowFuelMission(character, currentFuel) {
  const level = character?.level || 1;
  const fuel = Math.max(0, currentFuel || 0);
  const duration = Math.min(300, Math.max(30, Math.floor((fuel * 60) / 15) * 15));
  const minutes = duration / 60;
  return {
    name: "Quick Salvage Sweep",
    description: "A fast burn through nearby debris — light on fuel, light on glory, but better than idling.",
    location: "Drift Sector 7",
    sector: 1,
    duration_seconds: duration,
    difficulty: "easy",
    risk: 1,
    level_requirement: 1,
    rewards: {
      experience: Math.max(5, Math.round(level * 8 * minutes)),
      stardust: Math.max(10, Math.round(level * 16 * minutes)),
      item_rarity_chance: "common",
    },
  };
}

// ═══════════════════════════════════════════
// CONSUMABLES — timed stat buffs (minor 6h / major 12h)
// Stored as items of type "consumable"; using one adds an entry to
// character.active_buffs { stat, mult, expires_at, name }.
// ═══════════════════════════════════════════
export const CONSUMABLE_TIERS = {
  common:    { mult: 0.05, duration_hours: 2,  label: "Minor",    rarity: "common",    cost: 40,  sell_value: 15 },
  uncommon:  { mult: 0.10, duration_hours: 6,  label: "Standard", rarity: "uncommon", cost: 80,  sell_value: 25 },
  rare:      { mult: 0.15, duration_hours: 10, label: "Major",    rarity: "rare",     cost: 220, sell_value: 60 },
  epic:      { mult: 0.20, duration_hours: 15, label: "Prime",    rarity: "epic",     cost: 500, sell_value: 120 },
  legendary: { mult: 0.20, duration_hours: 24, label: "Mythic",  rarity: "legendary", cost: 1200, sell_value: 300, allStats: true },
};

// Maximum times a stim's duration can be extended by stacking the same stim.
export const MAX_BUFF_STACKS = 3;
// Maximum distinct stats that can be boosted by stims simultaneously.
export const MAX_ACTIVE_STAT_TYPES = 3;
const CONSUMABLE_STATS = ["strength", "agility", "intellect", "vitality", "luck"];
export const CONSUMABLES = Object.entries(CONSUMABLE_TIERS).flatMap(([tierKey, tier]) => {
  if (tier.allStats) {
    return [{
      name: `${tier.label} Omni-Stim`,
      type: "consumable",
      rarity: tier.rarity,
      level_requirement: 1,
      stats: {},
      consumable: { stat: "all", mult: tier.mult, duration_hours: tier.duration_hours, tier: tierKey },
      sell_value: tier.sell_value,
      flavor_text: `Boosts ALL stats by ${Math.round(tier.mult * 100)}% for ${tier.duration_hours} hours.`,
      is_equipped: false,
      _cost: tier.cost,
    }];
  }
  return CONSUMABLE_STATS.map((stat) => ({
    name: `${tier.label} ${stat.charAt(0).toUpperCase() + stat.slice(1)} Stim`,
    type: "consumable",
    rarity: tier.rarity,
    level_requirement: 1,
    stats: {},
    consumable: { stat, mult: tier.mult, duration_hours: tier.duration_hours, tier: tierKey },
    sell_value: tier.sell_value,
    flavor_text: `Boosts ${stat} by ${Math.round(tier.mult * 100)}% for ${tier.duration_hours} hours.`,
    is_equipped: false,
    _cost: tier.cost,
  }));
});
export function consumableItem(def) {
  const { _cost, _slotId, ...rest } = def;
  return rest;
}
// Legendary consumables have a 1% drop rate; everything else is weighted by rarity.
export function randomConsumable() {
  if (Math.random() < 0.01) {
    const legendary = CONSUMABLES.filter((c) => c.rarity === "legendary");
    return legendary[Math.floor(Math.random() * legendary.length)];
  }
  const pool = CONSUMABLES.filter((c) => c.rarity !== "legendary");
  return pool[Math.floor(Math.random() * pool.length)];
}
export function getActiveBuffs(character) {
  const now = Date.now();
  return (character?.active_buffs || []).filter((b) => new Date(b.expires_at).getTime() > now);
}
export function applyBuffs(stats, buffs) {
  const out = { ...(stats || {}) };
  const allStats = ["strength", "agility", "intellect", "vitality", "luck"];
  for (const b of buffs || []) {
    if (b.stat === "all") {
      for (const k of allStats) out[k] = Math.round((out[k] || 0) * (1 + b.mult));
    } else {
      out[b.stat] = Math.round((out[b.stat] || 0) * (1 + b.mult));
    }
  }
  return out;
}

export { RARITY_COLORS };

// Maximum members a single guild can hold.
export const GUILD_MAX_MEMBERS = 50;

export const DIFFICULTY_COLORS = {
  easy: "#22C55E",
  medium: "#3B82F6",
  hard: "#F59E0B",
  elite: "#A855F7",
  legendary: "#EF4444",
};

export const STAT_ICONS = {
  strength: "⚔️",
  agility: "💨",
  intellect: "🧠",
  vitality: "❤️",
  luck: "🍀",
};

// Display label for an item's gear type. The stored type stays lowercase
// ("accessory"); only the visible label changes to "Ring".
export function gearTypeLabel(type) {
  if (!type) return "";
  if (type === "accessory") return "Ring";
  return type.charAt(0).toUpperCase() + type.slice(1);
}

export const STAT_DESCRIPTIONS = {
  strength: "+1 Physical Damage per point",
  agility: "+0.3% Dodge per point (cap 40%)",
  intellect: "+1 Tech Damage per point",
  vitality: "+8 HP & +0.5% Armor per point",
  luck: "+0.3% Crit Chance per point (cap 35%)",
};

// Class-aware stat description: only the class's primary stat grants damage, so
// Strength isn't labelled "physical damage" for a Technomancer, etc. Luck, dodge,
// HP and armor mechanics are universal and shown the same for every class.
export function getStatDescription(stat, className) {
  const cls = className ? CLASSES[className] : null;
  const isPrimary = stat === cls?.primaryStat;
  if (stat === "luck") return "+0.3% Crit Chance per point (cap 35%)";
  if (stat === "agility") return isPrimary
    ? "Primary damage · +0.3% Dodge/pt (cap 40%)"
    : "+0.3% Dodge per point (cap 40%)";
  if (stat === "vitality") return isPrimary
    ? "Primary damage · +8 HP & +0.5% Armor/pt"
    : "+8 HP & +0.5% Armor per point";
  if (stat === "strength") return isPrimary
    ? "Primary damage · +1 Physical Damage/pt"
    : "Off-stat — minor power contribution";
  if (stat === "intellect") return isPrimary
    ? "Primary damage · +1 Tech Damage/pt"
    : "Off-stat — minor power contribution";
  return STAT_DESCRIPTIONS[stat] || "";
}

// ═══════════════════════════════════════════
// SHIP MODIFICATIONS (permanent upgrades — purchased with stardust)
// Each category has sequential tiers; effects stack and are applied
// at mission launch (fuel cost / duration) and claim (stardust / xp).
// ═══════════════════════════════════════════
export const SHIP_MODS = {
  fuel_tank: {
    name: "Reinforced Fuel Tank",
    emoji: "⛽",
    category: "Propulsion",
    desc: "Expands your fuel reserves for longer expeditions before refuelling.",
    tiers: [
      { id: "fuel_tank_1", cost: 200, max_fuel_bonus: 2 },
      { id: "fuel_tank_2", cost: 450, max_fuel_bonus: 2 },
      { id: "fuel_tank_3", cost: 800, max_fuel_bonus: 2 },
      { id: "fuel_tank_4", cost: 1250, max_fuel_bonus: 2 },
      { id: "fuel_tank_5", cost: 1800, max_fuel_bonus: 2 },
      { id: "fuel_tank_6", cost: 2500, max_fuel_bonus: 2 },
      { id: "fuel_tank_7", cost: 3400, max_fuel_bonus: 2 },
      { id: "fuel_tank_8", cost: 4500, max_fuel_bonus: 2 },
      { id: "fuel_tank_9", cost: 5600, max_fuel_bonus: 2 },
      { id: "fuel_tank_10", cost: 6800, max_fuel_bonus: 2 },
    ],
  },
  fuel_efficiency: {
    name: "Fuel Injector Tune",
    emoji: "🔧",
    category: "Propulsion",
    desc: "Optimises combustion so every launch burns less fuel.",
    tiers: [
      { id: "fuel_efficiency_1", cost: 350, fuel_cost_reduction: 1 },
      { id: "fuel_efficiency_2", cost: 700, fuel_cost_reduction: 1 },
      { id: "fuel_efficiency_3", cost: 1100, fuel_cost_reduction: 1 },
      { id: "fuel_efficiency_4", cost: 1600, fuel_cost_reduction: 1 },
      { id: "fuel_efficiency_5", cost: 2200, fuel_cost_reduction: 1 },
      { id: "fuel_efficiency_6", cost: 2900, fuel_cost_reduction: 1 },
      { id: "fuel_efficiency_7", cost: 3700, fuel_cost_reduction: 1 },
      { id: "fuel_efficiency_8", cost: 4600, fuel_cost_reduction: 1 },
      { id: "fuel_efficiency_9", cost: 5600, fuel_cost_reduction: 1 },
      { id: "fuel_efficiency_10", cost: 6800, fuel_cost_reduction: 1 },
    ],
  },
  warp_drive: {
    name: "Warp Drive",
    emoji: "🌀",
    category: "Propulsion",
    desc: "Folds space to shorten every mission's travel time.",
    tiers: [
      { id: "warp_drive_1", cost: 500, mission_duration_reduction: 0.005 },
      { id: "warp_drive_2", cost: 950, mission_duration_reduction: 0.005 },
      { id: "warp_drive_3", cost: 1450, mission_duration_reduction: 0.005 },
      { id: "warp_drive_4", cost: 2000, mission_duration_reduction: 0.005 },
      { id: "warp_drive_5", cost: 2600, mission_duration_reduction: 0.005 },
      { id: "warp_drive_6", cost: 3300, mission_duration_reduction: 0.005 },
      { id: "warp_drive_7", cost: 4100, mission_duration_reduction: 0.005 },
      { id: "warp_drive_8", cost: 5000, mission_duration_reduction: 0.005 },
      { id: "warp_drive_9", cost: 6000, mission_duration_reduction: 0.005 },
      { id: "warp_drive_10", cost: 7100, mission_duration_reduction: 0.005 },
    ],
  },
  stardust_magnet: {
    name: "Stardust Magnet",
    emoji: "🧲",
    category: "Harvesting",
    desc: "Magnetic hull plating draws extra stardust from mission rewards.",
    tiers: [
      { id: "stardust_magnet_1", cost: 300, mission_stardust_mult: 0.005 },
      { id: "stardust_magnet_2", cost: 650, mission_stardust_mult: 0.005 },
      { id: "stardust_magnet_3", cost: 1050, mission_stardust_mult: 0.005 },
      { id: "stardust_magnet_4", cost: 1500, mission_stardust_mult: 0.005 },
      { id: "stardust_magnet_5", cost: 2000, mission_stardust_mult: 0.005 },
      { id: "stardust_magnet_6", cost: 2550, mission_stardust_mult: 0.005 },
      { id: "stardust_magnet_7", cost: 3150, mission_stardust_mult: 0.005 },
      { id: "stardust_magnet_8", cost: 3800, mission_stardust_mult: 0.005 },
      { id: "stardust_magnet_9", cost: 4500, mission_stardust_mult: 0.005 },
      { id: "stardust_magnet_10", cost: 5300, mission_stardust_mult: 0.005 },
    ],
  },
  neural_accel: {
    name: "Neural Accelerator",
    emoji: "🧠",
    category: "Computing",
    desc: "Boosts your shipboard AI for faster combat learning and XP gain.",
    tiers: [
      { id: "neural_accel_1", cost: 400, mission_xp_mult: 0.005 },
      { id: "neural_accel_2", cost: 800, mission_xp_mult: 0.005 },
      { id: "neural_accel_3", cost: 1250, mission_xp_mult: 0.005 },
      { id: "neural_accel_4", cost: 1750, mission_xp_mult: 0.005 },
      { id: "neural_accel_5", cost: 2300, mission_xp_mult: 0.005 },
      { id: "neural_accel_6", cost: 2900, mission_xp_mult: 0.005 },
      { id: "neural_accel_7", cost: 3550, mission_xp_mult: 0.005 },
      { id: "neural_accel_8", cost: 4250, mission_xp_mult: 0.005 },
      { id: "neural_accel_9", cost: 5000, mission_xp_mult: 0.005 },
      { id: "neural_accel_10", cost: 5800, mission_xp_mult: 0.005 },
    ],
  },
  cargo_hold: {
    name: "Cargo Hold",
    emoji: "📦",
    category: "Storage",
    desc: "Expands your cargo bay so you can carry more gear before your inventory fills.",
    tiers: [
      { id: "cargo_hold_1", cost: 600, inventory_cap_bonus: 1 },
      { id: "cargo_hold_2", cost: 1200, inventory_cap_bonus: 1 },
      { id: "cargo_hold_3", cost: 1900, inventory_cap_bonus: 1 },
      { id: "cargo_hold_4", cost: 2700, inventory_cap_bonus: 1 },
      { id: "cargo_hold_5", cost: 3600, inventory_cap_bonus: 1 },
      { id: "cargo_hold_6", cost: 4600, inventory_cap_bonus: 1 },
      { id: "cargo_hold_7", cost: 5700, inventory_cap_bonus: 1 },
      { id: "cargo_hold_8", cost: 6900, inventory_cap_bonus: 1 },
      { id: "cargo_hold_9", cost: 8200, inventory_cap_bonus: 1 },
      { id: "cargo_hold_10", cost: 9600, inventory_cap_bonus: 1 },
    ],
  },
};

// ═══════════════════════════════════════════
// SHIP TYPES (buyable hulls — unlocked at SHIP_UNLOCK_LEVEL)
// Each ship keeps its own independent mod loadout; inherent bonuses
// apply only while that ship is active.
// ═══════════════════════════════════════════
export const STARTER_SHIP = "scout";
export const SHIP_UNLOCK_LEVEL = 150;

export const SHIP_TYPES = {
  scout: {
    name: "Recon Scout", emoji: "🛩️", cost: 0, unlock_level: 1,
    desc: "Standard-issue exploration vessel. Reliable, if unremarkable.",
    inherent: {},
    upgrade_mult: 1.0,
  },
  frigate: {
    name: "Storm Frigate", emoji: "🚀", cost: 5000, unlock_level: 50,
    desc: "Military-grade frigate with reinforced hull plating and salvage magnets.",
    inherent: { mission_stardust_mult: 0.05 },
    upgrade_mult: 1.2,
  },
  cruiser: {
    name: "Galaxy Cruiser", emoji: "🛳️", cost: 15000, unlock_level: 150,
    desc: "Long-range endurance cruiser with an overcharged AI core.",
    inherent: { mission_xp_mult: 0.05, mission_duration_reduction: 0.03 },
    upgrade_mult: 1.4,
  },
  dreadnought: {
    name: "Void Dreadnought", emoji: "🛸", cost: 50000, unlock_level: 250,
    desc: "Capital-class warship. The ultimate command vessel.",
    inherent: { mission_stardust_mult: 0.10, mission_xp_mult: 0.10, fuel_cost_reduction: 1 },
    upgrade_mult: 1.6,
  },
};

// Minimum character level required to purchase a given ship hull.
export function getShipUnlockLevel(shipId) {
  return SHIP_TYPES[shipId]?.unlock_level || 1;
}

// Upgraded hulls amplify every installed mod's effect — +20% per ship tier.
export function getShipUpgradeMult(shipId) {
  return SHIP_TYPES[shipId]?.upgrade_mult ?? 1;
}

export function getActiveShipId(character) {
  return character?.active_ship || STARTER_SHIP;
}

export function getActiveShipType(character) {
  return SHIP_TYPES[getActiveShipId(character)] || SHIP_TYPES[STARTER_SHIP];
}

// Mods installed on the currently active ship (per-ship loadout).
export function getActiveShipMods(character) {
  const id = getActiveShipId(character);
  const loadouts = character?.ship_mod_loadouts;
  if (loadouts && Array.isArray(loadouts[id])) return loadouts[id];
  // Legacy fallback for characters that used the old flat ship_mods array.
  return character?.ship_mods || [];
}

export function computeMaxFuelForLoadout(modIds, shipId) {
  const ids = modIds || [];
  const mult = getShipUpgradeMult(shipId);
  let bonus = 0;
  Object.values(SHIP_MODS).forEach((cat) => {
    cat.tiers.forEach((t) => { if (ids.includes(t.id)) bonus += t.max_fuel_bonus || 0; });
  });
  return FUEL_MAX + Math.round(bonus * mult);
}

export function getInstalledMods(character) {
  const ids = getActiveShipMods(character);
  const out = [];
  Object.entries(SHIP_MODS).forEach(([catKey, cat]) => {
    cat.tiers.forEach((tier) => {
      if (ids.includes(tier.id)) out.push({ ...tier, catKey, catName: cat.name, catEmoji: cat.emoji });
    });
  });
  return out;
}

// Sum of a given effect across active-ship mods PLUS the active ship's inherent bonus.
export function getModEffectTotal(character, effectKey) {
  const mult = getShipUpgradeMult(getActiveShipId(character));
  const modTotal = getInstalledMods(character).reduce((sum, m) => sum + (m[effectKey] || 0), 0) * mult;
  const ship = getActiveShipType(character);
  return modTotal + (ship.inherent?.[effectKey] || 0);
}

export function getCategoryProgress(character, catKey) {
  const cat = SHIP_MODS[catKey];
  if (!cat) return { installed: 0, next: null, maxed: false };
  const ids = getActiveShipMods(character);
  const installed = cat.tiers.filter((t) => ids.includes(t.id)).length;
  return { installed, next: installed < cat.tiers.length ? cat.tiers[installed] : null, maxed: installed >= cat.tiers.length };
}

export function getShipInherentLabel(ship) {
  if (!ship?.inherent) return "";
  const inh = ship.inherent;
  const parts = [];
  if (inh.mission_stardust_mult) parts.push(`+${Math.round(inh.mission_stardust_mult * 100)}% Stardust`);
  if (inh.mission_xp_mult) parts.push(`+${Math.round(inh.mission_xp_mult * 100)}% XP`);
  if (inh.mission_duration_reduction) parts.push(`-${Math.round(inh.mission_duration_reduction * 100)}% Time`);
  if (inh.fuel_cost_reduction) parts.push(`-${inh.fuel_cost_reduction} Fuel`);
  const mult = ship?.upgrade_mult;
  if (mult && mult > 1) parts.push(`+${Math.round((mult - 1) * 100)}% Upgrade Power`);
  return parts.join(" · ");
}

export function getTierEffectLabel(tier, shipId) {
  if (!tier) return "";
  const mult = getShipUpgradeMult(shipId);
  const fmtPct = (v) => (v * 100).toFixed(1).replace(/\.0$/, "");
  const parts = [];
  if (tier.max_fuel_bonus) parts.push(`+${Math.round(tier.max_fuel_bonus * mult)} Max Fuel`);
  if (tier.mission_stardust_mult) parts.push(`+${fmtPct(tier.mission_stardust_mult * mult)}% Mission Stardust`);
  if (tier.mission_xp_mult) parts.push(`+${fmtPct(tier.mission_xp_mult * mult)}% Mission XP`);
  if (tier.fuel_cost_reduction) parts.push(`-${Math.round(tier.fuel_cost_reduction * mult)} Fuel per Mission`);
  if (tier.mission_duration_reduction) parts.push(`-${fmtPct(tier.mission_duration_reduction * mult)}% Mission Time`);
  if (tier.inventory_cap_bonus) parts.push(`+${tier.inventory_cap_bonus} Inventory Slots`);
  return parts.join(" · ") || "Ship Upgrade";
}

// Cumulative effect of every tier in a category at max rank, amplified by the
// active ship's upgrade multiplier — shown on the mod card as the end-goal total.
export function getMaxTierTotal(mod, shipId) {
  if (!mod?.tiers?.length) return "";
  const mult = getShipUpgradeMult(shipId);
  const sums = {};
  mod.tiers.forEach((t) => {
    Object.keys(t).forEach((k) => {
      if (k === "id" || k === "cost" || typeof t[k] !== "number") return;
      sums[k] = (sums[k] || 0) + t[k];
    });
  });
  const fmtPct = (v) => (v * 100).toFixed(1).replace(/\.0$/, "");
  const parts = [];
  if (sums.max_fuel_bonus) parts.push(`+${Math.round(sums.max_fuel_bonus * mult)} Max Fuel`);
  if (sums.mission_stardust_mult) parts.push(`+${fmtPct(sums.mission_stardust_mult * mult)}% Stardust`);
  if (sums.mission_xp_mult) parts.push(`+${fmtPct(sums.mission_xp_mult * mult)}% XP`);
  if (sums.fuel_cost_reduction) parts.push(`-${Math.round(sums.fuel_cost_reduction * mult)} Fuel/Mission`);
  if (sums.mission_duration_reduction) parts.push(`-${fmtPct(sums.mission_duration_reduction * mult)}% Time`);
  if (sums.inventory_cap_bonus) parts.push(`+${Math.round(sums.inventory_cap_bonus)} Inventory Slots`);
  return parts.join(" · ") || "Ship Upgrade";
}

// ═══════════════════════════════════════════
// GEAR CATALOG — static base gear types for collection tracking
// ═══════════════════════════════════════════
function buildGearCatalog() {
  const entries = [];
  for (const [type, names] of Object.entries(ITEM_NAMES)) {
    for (const name of names) {
      entries.push({ id: `${type}:${name}`, name, type });
    }
  }
  for (const w of Object.values(CLASS_WEAPONS)) {
    entries.push({ id: `weapon:${w.name}`, name: w.name, type: "weapon" });
  }
  return entries;
}

export const GEAR_CATALOG = buildGearCatalog();
export const GEAR_CATALOG_TOTAL = GEAR_CATALOG.length;

export function gearCatalogKey(item) {
  if (!item) return null;
  if (item.base_name && item.type) return `${item.type}:${item.base_name}`;
  if (item.type && item.name) {
    const match = GEAR_CATALOG.find((e) => e.type === item.type && item.name.includes(e.name));
    if (match) return match.id;
  }
  return item.id || null;
}