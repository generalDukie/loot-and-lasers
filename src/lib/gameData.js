import { getEffectiveMissionDuration } from "@/lib/fuelMounts";
import { todayET } from "@/lib/gameTime";
import {
  EQUIPMENT_SLOTS,
  rollItemStats,
  computeItemVendorValue,
} from "@/lib/itemGeneration";

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
/** Starting attributes by primary type (always sum to 50). */
export const CLASS_TYPE_BASE_STATS = {
  strength:  { strength: 15, agility: 8,  intellect: 6,  vitality: 14, luck: 7  },
  agility:   { strength: 7,  agility: 15, intellect: 7,  vitality: 11, luck: 10 },
  intellect: { strength: 6,  agility: 8,  intellect: 15, vitality: 13, luck: 8  },
};

export const CLASSES = {
  Vanguard: {
    name: "Vanguard",
    emoji: "⚔️",
    tagline: "Heavy hitter with reliable Strength damage",
    description: "Slow, heavy-hitting powerhouse. Vanguards wade into the thick of it with massive weapons — Strength fuels their damage, not armor.",
    primaryStat: "strength",
    secondaryStat: "vitality",
    baseStats: { ...CLASS_TYPE_BASE_STATS.strength },
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
    baseStats: { ...CLASS_TYPE_BASE_STATS.agility },
    special: {
      name: "Shadowstep",
      effect: "Every successful dodge grants +25% damage on the next attack (resets after the attack).",
      identity: "Rewards evasive, high-risk gameplay.",
    },
  },
  Technomancer: {
    name: "Technomancer",
    emoji: "⚡",
    tagline: "High burst Tech damage that partially pierces resists",
    description: "Blending psionic arts with overclocked tech, Technomancers unleash explosive Tech bursts. Intellect fuels damage — not Tech Resistance.",
    primaryStat: "intellect",
    secondaryStat: "luck",
    baseStats: { ...CLASS_TYPE_BASE_STATS.intellect },
    special: {
      name: "Overcharge",
      effect: "Every 3rd spell is guaranteed to critically strike and ignores 20% of the target's armor/shields.",
      identity: "Explosive burst damage.",
    },
  },
  "Astral Warden": {
    name: "Astral Warden",
    emoji: "🛡️",
    tagline: "Strength-fueled survivor with shields and regeneration",
    description: "Not a healer — a survivor. Astral Wardens smash through fights with raw strength while layering shields and regeneration to simply refuse to die.",
    primaryStat: "strength",
    secondaryStat: "vitality",
    baseStats: { ...CLASS_TYPE_BASE_STATS.strength },
    special: {
      name: "Cosmic Barrier",
      effect: "Begins every battle with a shield equal to 20% of max Health. Regenerates 2% of max Health at the start of every turn. Shield cannot be restored once broken.",
      identity: "The class that simply refuses to die.",
    },
  },
  "Void Runner": {
    name: "Void Runner",
    emoji: "☄️",
    tagline: "Blazing agility — strikes come in pairs",
    description: "Born in the slipstreams between stars, Void Runners fight at a tempo others can't match. They weave, feint, and land a twin strike before the enemy finishes blinking.",
    primaryStat: "agility",
    secondaryStat: "luck",
    baseStats: { ...CLASS_TYPE_BASE_STATS.agility },
    special: {
      name: "Twin Fang",
      effect: "Every 3rd attack hits twice — each strike deals 70% weapon damage.",
      identity: "Speed kills. Twice.",
    },
  },
  "Cosmic Engineer": {
    name: "Cosmic Engineer",
    emoji: "🔧",
    tagline: "Gadgets, drones, and status effects win over time",
    description: "If it can be built, hacked, or jury-rigged, a Cosmic Engineer is already deploying it. Drones, poisons, burns, and EMPs turn the fight into a war of attrition they always win.",
    primaryStat: "intellect",
    secondaryStat: "luck",
    baseStats: { ...CLASS_TYPE_BASE_STATS.intellect },
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
  // Early-board filler — keeps the cantina stocked with 8 unique names from level 1.
  { name: "Mail Run: Express Capsule", location: "Orbital Post Hub", description: "Deliver a sealed capsule that ticks when you shake it. The postal clerk says it's 'definitely not a bomb.' The postal clerk is sweating. A lot.", difficulty: "easy", sector: 1, duration_seconds: 75, risk: 1, rewards: { experience: 22, stardust: 45, item_rarity_chance: "common" }, level_requirement: 1 },
  { name: "Sensor Calibration Sweep", location: "Relay Buoy Cluster 12", description: "Tap every buoy with a wrench until the network stops screaming in binary. Yes, you are the IT department of deep space. No, there is no help desk.", difficulty: "easy", sector: 1, duration_seconds: 100, risk: 1, rewards: { experience: 28, stardust: 55, item_rarity_chance: "common" }, level_requirement: 1 },
  { name: "Lost Pet Retrieval", location: "Hangar Deck C", description: "Someone's pet void-ferret escaped into the vents. It has twelve eyes, zero manners, and your lunch. Bring gloves. Bring snacks. Bring regret.", difficulty: "easy", sector: 1, duration_seconds: 110, risk: 1, rewards: { experience: 26, stardust: 52, item_rarity_chance: "common" }, level_requirement: 1 },
  { name: "Cantina Tab Collection", location: "Station Corridor 9", description: "Politely remind three patrons that drinks aren't free. One of them is a cyborg. One of them is armed. One of them is both and also your cousin.", difficulty: "easy", sector: 1, duration_seconds: 85, risk: 2, rewards: { experience: 32, stardust: 65, item_rarity_chance: "common" }, level_requirement: 1 },
  { name: "Scrap Yard Sort", location: "Junk Moon Delta", description: "Sort 'valuable salvage' from 'cursed garbage' in a yard that rearranges itself when you blink. Wear boots you don't love.", difficulty: "easy", sector: 1, duration_seconds: 130, risk: 2, rewards: { experience: 38, stardust: 75, item_rarity_chance: "uncommon" }, level_requirement: 1 },
  { name: "Comet Tail Sampling", location: "Approach Vector K-4", description: "Scoop ice from a comet's tail without getting flash-frozen into a motivational poster. The science team wants samples. The science team is very far away.", difficulty: "easy", sector: 1, duration_seconds: 140, risk: 2, rewards: { experience: 42, stardust: 85, item_rarity_chance: "uncommon" }, level_requirement: 1 },
  { name: "Drone Herding Duty", location: "Fabrication Ring", description: "Round up a flock of maintenance drones that developed a personality and a union. They demand better oil. You demand they stop nesting in the airlocks.", difficulty: "medium", sector: 1, duration_seconds: 200, risk: 2, rewards: { experience: 58, stardust: 115, item_rarity_chance: "uncommon" }, level_requirement: 2 },
  { name: "Static Storm Mapping", location: "Ion Flats", description: "Fly through a lightning field and draw a map that won't fry your console. Your hair will never be the same. Neither will your insurance.", difficulty: "medium", sector: 1, duration_seconds: 220, risk: 2, rewards: { experience: 62, stardust: 125, item_rarity_chance: "uncommon" }, level_requirement: 2 },
];

// ═══════════════════════════════════════════
// ITEM GENERATION
// ═══════════════════════════════════════════
const ITEM_NAMES = {
  weapon: [
    "Plasma Rifle", "Ion Blaster", "Photon Cannon", "Pulse Repeater", "Neutrino Sniper", "Graviton Shotgun", "Phase Pistol", "Singularity Cannon",
    "Void Saber", "Photon Cleaver", "Starforged Blade", "Quantum Dagger", "Shadow Needle", "Phase Knife",
    "Nebula Bow", "Ion Longbow", "Graviton Axe", "Titan Maul", "Arc Staff", "Psionic Wand",
  ],
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
  Vanguard:           { name: "Vanguard Assault Rifle", emoji: "🔫", style: "shoot", flavor: "A rugged battle rifle that punches through armor with relentless fire." },
  "Shadow Operative": { name: "Shadowstrike Silencer",  emoji: "🗡️", style: "stab",  flavor: "A suppressed blade that finds the gaps in any defense." },
  Technomancer:       { name: "Arcane Pulse Caster",     emoji: "🔮", style: "shoot", flavor: "Channels raw psionic energy into devastating energy bolts." },
  "Astral Warden":    { name: "Cosmic Aegis Blaster",   emoji: "✨", style: "shoot", flavor: "Radiates protective starlight with every shot." },
  "Void Runner":      { name: "Slipstream Needles",    emoji: "☄️", style: "stab",  flavor: "Twin monofilament blades that strike before the echo arrives." },
  "Cosmic Engineer":  { name: "Plasma Multi-Cannon",    emoji: "💥", style: "shoot", flavor: "Jury-rigged to fire everything from drones to EMPs." },
};

export const RARITY_MULTIPLIERS = { common: 1, uncommon: 1.3, rare: 1.7, epic: 2.2, legendary: 3 };

// Resolve a weapon icon from its base/full name. Prefers class signature matches,
// then known loot base names, then keyword heuristics — never falls back to the
// raw text name (that used to render as a giant label in arena/inventory).
const LOOT_WEAPON_EMOJIS = {
  "Plasma Rifle": "🔫", "Ion Blaster": "⚡", "Photon Cannon": "💥", "Pulse Repeater": "🔫",
  "Neutrino Sniper": "🎯", "Graviton Shotgun": "💥", "Phase Pistol": "🔫", "Singularity Cannon": "🌌",
  "Void Saber": "⚔️", "Photon Cleaver": "⚔️", "Starforged Blade": "⚔️",
  "Quantum Dagger": "🗡️", "Shadow Needle": "🗡️", "Phase Knife": "🗡️",
  "Nebula Bow": "🏹", "Ion Longbow": "🏹",
  "Graviton Axe": "🪓", "Titan Maul": "🪓",
  "Arc Staff": "🔮", "Psionic Wand": "🔮",
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
    if (/sword|blade|saber|katana|cleaver/.test(n)) return "⚔️";
    if (/dagger|knife|needle|silencer/.test(n)) return "🗡️";
    if (/staff|wand|caster|rod/.test(n)) return "🔮";
    if (/bow|crossbow|longbow/.test(n)) return "🏹";
    if (/axe|hammer|mace|maul/.test(n)) return "🪓";
    if (/cannon|shotgun|launcher/.test(n)) return "💥";
    if (/sniper/.test(n)) return "🎯";
    if (/blaster|aegis/.test(n)) return "✨";
    if (/rifle|pistol|gun|repeater/.test(n)) return "🔫";
  }
  return "⚔️";
}

// Combat motion for arena visuals: swing / stab / shoot — derived from the
// equipped weapon, not the fighter's class (so a Vanguard with a saber swings).
export function weaponCombatStyleFor(name, baseName, emoji) {
  for (const w of Object.values(CLASS_WEAPONS)) {
    if (baseName === w.name || (name && name.includes(w.name))) return w.style || "shoot";
  }
  const e = emoji || weaponEmojiFor(name, baseName);
  if (e === "⚔️" || e === "🪓") return "swing";
  if (e === "🗡️" || e === "🔪") return "stab";
  const n = `${baseName || ""} ${name || ""}`.toLowerCase();
  if (/sword|blade|saber|katana|cleaver|axe|hammer|mace|maul|club/.test(n)) return "swing";
  if (/dagger|knife|needle|silencer|rapier/.test(n)) return "stab";
  return "shoot";
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
  const itemType = type || EQUIPMENT_SLOTS[Math.floor(r() * EQUIPMENT_SLOTS.length)];
  const names = ITEM_NAMES[itemType] || ITEM_NAMES.weapon;
  const baseName = names[Math.floor(r() * names.length)];
  const itemLevel = Math.max(1, playerLevel || 1);
  const { stats } = rollItemStats({ itemLevel, type: itemType, rarity, rng: r });

  const item = {
    name: buildItemName(baseName, rarity, stats, r),
    base_name: baseName,
    type: itemType,
    rarity,
    level_requirement: itemLevel,
    stats,
    flavor_text: FLAVOR_TEXTS[Math.floor(r() * FLAVOR_TEXTS.length)],
    is_equipped: false,
    ...(itemType === "weapon" ? { emoji: weaponEmojiFor(baseName, baseName) } : {}),
  };
  item.sell_value = computeItemVendorValue(item);
  return item;
}

// Class signature weapons keep name/flavor/emoji, but stats use the same
// randomized budget system as other gear (no class-forced primary bias).
export function generateClassWeapon(className, rarity, playerLevel, rng = Math.random) {
  const w = CLASS_WEAPONS[className] || CLASS_WEAPONS.Vanguard;
  const itemLevel = Math.max(1, playerLevel || 1);
  const { stats } = rollItemStats({ itemLevel, type: "weapon", rarity, rng });
  const item = {
    name: buildItemName(w.name, rarity, stats, rng),
    base_name: w.name,
    type: "weapon",
    rarity,
    level_requirement: itemLevel,
    stats,
    flavor_text: w.flavor,
    is_equipped: false,
    emoji: w.emoji,
  };
  item.sell_value = computeItemVendorValue(item);
  return item;
}

export function generateItem(rarity, playerLevel, type) {
  // 20% chance for a class-signature weapon skin when rolling a weapon
  // (stats remain fully randomized — no class-locked attributes).
  const rollingWeapon = !type || type === "weapon";
  if (rollingWeapon && Math.random() < 0.20) {
    const classKeys = Object.keys(CLASS_WEAPONS);
    const className = classKeys[Math.floor(Math.random() * classKeys.length)];
    return generateClassWeapon(className, rarity, playerLevel);
  }
  return _rollItem(rarity, playerLevel, type, Math.random);
}

// ═══════════════════════════════════════════
// ATTRIBUTE POINTS — bought with Stardust (unlimited)
// Free level-up points removed; each permanent +1 costs escalating SD.
// ═══════════════════════════════════════════
export const STAT_POINTS_START = 0;
/** @deprecated Attributes are purchased with Stardust — level-ups grant 0. */
export const STAT_POINTS_PER_LEVEL = 0;

/** Design chart waypoints (1-indexed purchase → Stardust cost). */
const ATTR_PURCHASE_COST_WAYPOINTS = [
  [1, 10],
  [10, 15],
  [20, 25],
  [30, 40],
  [40, 65],
  [50, 100],
  [75, 225],
  [100, 500],
  [150, 1_500],
  [200, 4_000],
  [300, 20_000],
  [400, 75_000],
  [500, 225_000],
  [600, 600_000],
  [650, 1_000_000],
];

/**
 * Stardust cost for purchase number `n` (1 = first bought point).
 * Charted range uses waypoints; beyond 650: Cost(n) = ROUND(10 * (1 + (n-1)/97.54)^5.657).
 */
export function getAttributePointCost(purchaseNumber) {
  const n = Math.max(1, Math.floor(purchaseNumber || 1));
  if (n <= 650) {
    return Math.max(1, Math.round(lerpWaypoints(n, ATTR_PURCHASE_COST_WAYPOINTS)));
  }
  return Math.max(1, Math.round(10 * (1 + (n - 1) / 97.54) ** 5.657));
}

export const ATTR_STAT_KEYS = ["strength", "agility", "intellect", "vitality", "luck"];

/**
 * Purchases already bought for one attribute (each stat has its own cost curve).
 * Prefers `attribute_purchases_by_stat[stat]`; else derives from stats vs class base.
 */
export function getAttributePurchaseCount(character, stat) {
  if (!character) return 0;
  if (stat) {
    const by = character.attribute_purchases_by_stat;
    if (by && typeof by[stat] === "number" && Number.isFinite(by[stat])) {
      return Math.max(0, Math.floor(by[stat]));
    }
    const base = CLASSES[character.class]?.baseStats || {};
    return Math.max(0, (character.stats?.[stat] || 0) - (base[stat] || 0));
  }
  // Total across all stats (legacy / sync helper).
  if (
    character.attribute_purchases_by_stat
    && typeof character.attribute_purchases_by_stat === "object"
  ) {
    return ATTR_STAT_KEYS.reduce(
      (sum, k) => sum + getAttributePurchaseCount(character, k),
      0,
    );
  }
  if (typeof character.attribute_purchases === "number" && Number.isFinite(character.attribute_purchases)) {
    return Math.max(0, Math.floor(character.attribute_purchases));
  }
  return ATTR_STAT_KEYS.reduce(
    (sum, k) => sum + getAttributePurchaseCount(character, k),
    0,
  );
}

/** Cost of the next +1 for a specific attribute (each stat scales independently). */
export function getNextAttributePointCost(character, stat) {
  if (!stat) {
    // Cheapest next buy among all stats — useful for “can afford anything?” checks.
    return Math.min(...ATTR_STAT_KEYS.map((k) => getNextAttributePointCost(character, k)));
  }
  return getAttributePointCost(getAttributePurchaseCount(character, stat) + 1);
}

/** Level-ups no longer grant free attribute points (Stardust sink instead). */
export function getStatPointsForLevel(_level) {
  return 0;
}

/** @deprecated Always 0 — kept so level-up call sites stay stable. */
export function getStatPointsForLevelRange(_fromLevel, _toLevel) {
  return 0;
}

// ═══════════════════════════════════════════
// STARDUST (primary currency — earned via missions, arena, and dissolving gear in the Void)
// ═══════════════════════════════════════════
export const STARDUST_PER_RARITY = { common: 8, uncommon: 20, rare: 50, epic: 120, legendary: 280 };

// Gear type weight — re-exported from itemGeneration (weapon/ship modules sell higher).
export { ITEM_SELL_TYPE_WEIGHT as STARDUST_TYPE_WEIGHT } from "@/lib/itemGeneration";
export {
  getFullSetAttributeBudget,
  getItemStatBudget,
  rollItemStats,
  computeItemVendorValue,
} from "@/lib/itemGeneration";

// Stardust yielded by dissolving an item — scales with rolled attribute budget,
// rarity, and gear slot (see itemGeneration.computeItemVendorValue).
export function computeStardustValue(item) {
  return computeItemVendorValue(item);
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
// ROTATING SHOP / BLACK MARKET (6h armory+stims; daily hot deal)
// ═══════════════════════════════════════════
const SHOP_WINDOW_MS = 6 * 60 * 60 * 1000;
const SHOP_GEAR_TYPES = ["weapon", "armor", "helmet", "boots", "legs", "neck", "accessory", "ship_module"];

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

/** Nova cost to reroll a market stall. */
export const SHOP_REFRESH_COST = 10;

const VENDOR_LINES = [
  "Cash only. No names. No receipts.",
  "If the badge asks, you found it in a wreck.",
  "Hot piece under the tarp — don't make me shout.",
  "Everything's clean. Relatively.",
  "You blink, someone else buys it.",
  "I don't do refunds. I do introductions.",
  "Price is a suggestion. Manners aren't.",
  "Smells like ozone and opportunity in here.",
  "Don't touch the crate unless you're buying the crate.",
  "Whisper what you need. I'll pretend I didn't hear.",
  "Armory's honest. My smile isn't.",
  "Come back after midnight — same junk, better stories.",
];

export function getVendorLine(seed = 0) {
  const i = Math.abs(Math.floor(seed)) % VENDOR_LINES.length;
  return VENDOR_LINES[i];
}

/** Haggle: ~40% buy at 10% off; otherwise listing is yanked (no purchase). */
export function rollHaggle(rng = Math.random) {
  const roll = typeof rng === "function" ? rng() : Math.random();
  if (roll < 0.4) {
    return { ok: true, mult: 0.9, key: "deal", label: "They blinked — 10% off" };
  }
  return {
    ok: false,
    mult: 0,
    key: "refused",
    label: "Deal soured — they yanked the listing",
  };
}

/**
 * Persistable market state for the current 6h window + daily hot deal.
 * Window fields reset every 6h; hot_day / hot_purchased / hot_yanked follow ET midnight.
 */
export function normalizeShopMeta(character, win = getShopWindow(), day = todayET()) {
  const prev = character?.shop_meta || {};
  const hot_day = day;
  const hot_purchased = prev.hot_day === day ? !!prev.hot_purchased : false;
  const hot_yanked = prev.hot_day === day ? !!prev.hot_yanked : false;
  if (!prev.window_idx || prev.window_idx !== win.idx) {
    return {
      window_idx: win.idx,
      gear_refresh: 0,
      cons_refresh: 0,
      purchased: {},
      yanked: {},
      hot_day,
      hot_purchased,
      hot_yanked,
    };
  }
  return {
    window_idx: win.idx,
    gear_refresh: Math.max(0, Math.floor(prev.gear_refresh || 0)),
    cons_refresh: Math.max(0, Math.floor(prev.cons_refresh || 0)),
    purchased: prev.purchased && typeof prev.purchased === "object" ? { ...prev.purchased } : {},
    yanked: prev.yanked && typeof prev.yanked === "object" ? { ...prev.yanked } : {},
    hot_day,
    hot_purchased,
    hot_yanked,
  };
}

export function shopGearSeed(meta, win = getShopWindow()) {
  return (win?.idx || 0) + (meta?.gear_refresh || 0);
}

export function shopConsSeed(meta, win = getShopWindow()) {
  return (win?.idx || 0) + (meta?.cons_refresh || 0);
}

function pickShopGearType(r) {
  return SHOP_GEAR_TYPES[Math.floor(r() * SHOP_GEAR_TYPES.length)];
}

function priceShopItem(item, mult = 1.2) {
  const cost = Math.max(5, Math.round(computeStardustValue(item) * mult));
  const nova_cost = computeNovaCrystalCost(item);
  return { cost, nova_cost };
}

function makeScrapCrate(seed, i, r, playerLevel) {
  const a = _rollItem("common", Math.max(1, playerLevel), pickShopGearType(r), r);
  const b = _rollItem("common", Math.max(1, playerLevel), pickShopGearType(r), r);
  const base = priceShopItem(a, 1.1).cost + priceShopItem(b, 1.1).cost;
  return {
    name: "Scrap Crate",
    type: "material",
    rarity: "common",
    emoji: "📦",
    stats: {},
    level_requirement: 1,
    flavor_text: "Two common scraps, no questions asked.",
    _slotId: `${seed}-crate-${i}`,
    _bundle: "scrap_crate",
    bundle_items: [a, b],
    cost: Math.max(8, Math.round(base * 0.82)),
    nova_cost: 0,
  };
}

/**
 * Armory stock (6 pieces). ~8% chance a filler slot is a scrap crate bundle.
 */
export function generateShopInventory(seed, playerLevel) {
  const rng = mulberry32(seed * 7919 + 13);
  const r = () => rng();
  const slots = [];

  for (let i = 0; i < 5; i++) {
    if (r() < 0.08) {
      slots.push(makeScrapCrate(seed, i, r, playerLevel));
      continue;
    }
    const type = pickShopGearType(r);
    const roll = r();
    const rarity = clampRarityByLevel(
      roll < 0.4 ? "common" : roll < 0.7 ? "uncommon" : roll < 0.88 ? "rare" : roll < 0.97 ? "epic" : "legendary",
      playerLevel
    );
    const item = _rollItem(rarity, Math.max(1, playerLevel), type, r);
    const { cost, nova_cost } = priceShopItem(item, 1.2);
    slots.push({ ...item, _slotId: `${seed}-${i}`, cost, nova_cost });
  }

  // Class signature weapon — random class each restock.
  const classKeys = Object.keys(CLASS_WEAPONS);
  const cwClass = classKeys[Math.floor(r() * classKeys.length)];
  const cwRoll = r();
  const cwRarity = clampRarityByLevel(
    cwRoll < 0.25 ? "uncommon" : cwRoll < 0.60 ? "rare" : cwRoll < 0.88 ? "epic" : "legendary",
    playerLevel
  );
  const cwItem = generateClassWeapon(cwClass, cwRarity, Math.max(1, playerLevel), r);
  const cwPriced = priceShopItem(cwItem, 1.35);
  slots.push({ ...cwItem, _slotId: `${seed}-cw`, cost: cwPriced.cost, nova_cost: cwPriced.nova_cost });
  return slots;
}

/** One spotlight piece per ET day — not affected by Armory restock. */
export function generateHotDeal(dayKey, playerLevel) {
  const dayNum = String(dayKey || todayET()).split("-").reduce((a, p) => a + Number(p || 0), 0);
  const rng = mulberry32(dayNum * 104729 + 77);
  const r = () => rng();
  const type = pickShopGearType(r);
  const roll = r();
  const rarity = clampRarityByLevel(
    roll < 0.15 ? "uncommon" : roll < 0.45 ? "rare" : roll < 0.78 ? "epic" : "legendary",
    playerLevel
  );
  const item = _rollItem(rarity, Math.max(1, playerLevel), type, r);
  const { cost, nova_cost } = priceShopItem(item, 1.05); // slight list discount vs normal
  return {
    ...item,
    _slotId: `hot-${dayKey}`,
    _hotDeal: true,
    cost,
    nova_cost,
  };
}

function makeStimTrio(seed, i, rng) {
  const picks = [];
  for (let n = 0; n < 3; n++) {
    const pool = CONSUMABLES.filter((c) => c.rarity !== "legendary");
    picks.push(pool[Math.floor(rng() * pool.length)]);
  }
  const raw = picks.reduce((s, p) => s + (p._cost || p.sell_value || 25), 0);
  return {
    name: "Stim Trio",
    type: "consumable",
    rarity: "rare",
    flavor_text: "Three stims, one handshake.",
    consumable: { stat: "all", mult: 0, duration_hours: 0, tier: "bundle" },
    _slotId: `cons-${seed}-trio-${i}`,
    _bundle: "stim_trio",
    bundle_items: picks,
    _cost: Math.max(30, Math.round(raw * 0.85)),
    sell_value: Math.round(raw * 0.4),
  };
}

// Shop consumables — 6 slots; ~10% chance a slot is a Stim Trio bundle.
export function generateShopConsumableSlots(seed) {
  const rng = mulberry32(seed * 4099 + 7);
  const slots = [];
  for (let i = 0; i < 6; i++) {
    if (rng() < 0.10) {
      slots.push(makeStimTrio(seed, i, rng));
      continue;
    }
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

/** Linear interpolate a value between [x0,y0] design waypoints. */
function lerpWaypoints(level, points) {
  const L = Math.max(1, Math.floor(level || 1));
  if (L <= points[0][0]) return points[0][1];
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    if (L <= x1) {
      const t = (L - x0) / (x1 - x0);
      return y0 + (y1 - y0) * t;
    }
  }
  const [xA, yA] = points[points.length - 2];
  const [xB, yB] = points[points.length - 1];
  const slope = (yB - yA) / (xB - xA);
  return yB + slope * (L - xB);
}

/**
 * XP needed to advance from level L → L+1.
 * Uses the design waypoint chart through 500 (matches published table),
 * then the closed form forever after:
 *   ROUND(2.106 × L^1.532 × (1 + (L/266)^3.683))
 * Pacing: 1→50 ~3d, 50→100 ~1wk, 100→200 ~2wk, then progressively slower.
 */
const XP_TO_NEXT_WAYPOINTS = [
  [1, 40],
  [5, 50],
  [10, 120],
  [15, 150],
  [25, 335],
  [50, 1135],
  [75, 1810],
  [100, 2590],
  [150, 4460],
  [200, 14300],
  [250, 19800],
  [300, 51700],
  [350, 65000],
  [400, 159000],
  [450, 190000],
  [500, 228000],
];

export function getExpForLevel(level) {
  const L = Math.max(1, Math.floor(level || 1));
  if (L <= 500) {
    return Math.max(1, Math.round(lerpWaypoints(L, XP_TO_NEXT_WAYPOINTS)));
  }
  return Math.max(1, Math.round(2.106 * (L ** 1.532) * (1 + (L / 266) ** 3.683)));
}

// Design chart: mission XP granted per 1 fuel spent.
const MISSION_XP_PER_FUEL_WAYPOINTS = [
  [1, 10],
  [10, 16],
  [25, 29],
  [50, 57],
  [75, 90],
  [100, 130],
  [150, 223],
  [200, 334],
  [250, 461],
  [300, 603],
  [350, 758],
  [400, 927],
  [450, 1108],
  [500, 1301],
];

// Design chart: stardust per 1 fuel (SD/F) — independent of XP/fuel.
// L1–300 from mission chart; L300–500 from arena/economy high-band chart.
const MISSION_SD_PER_FUEL_WAYPOINTS = [
  [1, 4],
  [5, 5],
  [10, 8],
  [15, 12],
  [20, 18],
  [25, 25],
  [50, 60],
  [75, 120],
  [100, 225],
  [150, 600],
  [200, 1_500],
  [250, 3_500],
  [300, 7_500],
  [325, 10_135],
  [350, 13_693],
  [375, 18_502],
  [400, 25_000],
  [425, 31_746],
  [450, 40_311],
  [475, 51_188],
  [500, 65_000],
];

/** Mission XP per 1 fuel at this level (design chart). */
export function getMissionXpPerFuel(level = 1) {
  return Math.max(1, Math.round(lerpWaypoints(level, MISSION_XP_PER_FUEL_WAYPOINTS)));
}

/** Mission stardust per 1 fuel at this level (SD/F). */
export function getMissionStardustPerFuel(level = 1) {
  return Math.max(1, Math.round(lerpWaypoints(level, MISSION_SD_PER_FUEL_WAYPOINTS)));
}

/** Arena win Stardust = SD/F(playerLevel) × 5/3 (≈1.667). */
export function getArenaStardustReward(level = 1) {
  return Math.max(1, Math.round((getMissionStardustPerFuel(level) * 5) / 3));
}

/** Arena win XP = XP/F(playerLevel) × 5/7 (≈0.714). */
export function getArenaXpReward(level = 1) {
  return Math.max(1, Math.round((getMissionXpPerFuel(level) * 5) / 7));
}

/** Per-mission efficiency roll — 0.90 to 1.10 inclusive-ish. */
export function rollMissionEfficiency(rng = Math.random) {
  const raw = 0.9 + rng() * 0.2;
  return Math.round(raw * 100) / 100;
}

/** Clamp / default efficiency for older missions missing the field. */
export function normalizeMissionEfficiency(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.min(1.1, Math.max(0.9, Math.round(n * 100) / 100));
}

/** Display helper: 1.09 → "+9%", 0.93 → "-7%". */
export function formatEfficiencyPct(efficiency) {
  const pct = Math.round((normalizeMissionEfficiency(efficiency) - 1) * 100);
  if (pct === 0) return "±0%";
  return pct > 0 ? `+${pct}%` : `${pct}%`;
}

/**
 * Mission XP = Fuel × Level XP/F × efficiency (0.90–1.10).
 * Before ship/collection bonuses.
 */
export function computeMissionXpFromFuel(fuelCost, level = 1, efficiency = 1) {
  const fuel = Math.max(0, Number(fuelCost) || 0);
  const eff = normalizeMissionEfficiency(efficiency);
  return Math.max(fuel > 0 ? 1 : 0, Math.round(fuel * getMissionXpPerFuel(level) * eff));
}

/**
 * Mission Stardust = Fuel × Level SD/F × efficiency (0.90–1.10).
 * Before ship/nexus bonuses.
 */
export function computeMissionStardustFromFuel(fuelCost, level = 1, efficiency = 1) {
  const fuel = Math.max(0, Number(fuelCost) || 0);
  const eff = normalizeMissionEfficiency(efficiency);
  return Math.max(fuel > 0 ? 1 : 0, Math.round(fuel * getMissionStardustPerFuel(level) * eff));
}

/**
 * Passthrough for non-mission grants. Pacing lives in getExpForLevel + XP/fuel.
 * Kept so call sites stay stable.
 */
export function scaleXpReward(baseXp, _level = 1) {
  const base = Math.max(0, Number(baseXp) || 0);
  return Math.max(base > 0 ? 1 : 0, Math.round(base));
}

/**
 * Combat/frontier XP — scales with the mission XP/fuel chart so fights stay
 * relevant at every band. `baseXp` is treated as ~L1 "fuel-minutes" × 10.
 */
export function scaleCombatXp(baseXp, playerLevel = 1, contentLevel = 1) {
  const pl = Math.max(1, playerLevel || 1);
  const cl = Math.max(1, contentLevel || 1);
  const relative = Math.max(0.5, Math.min(1.65, 0.55 + 0.45 * (pl / cl)));
  const fuelEquiv = (Number(baseXp) || 0) / 10;
  return Math.max(1, Math.round(fuelEquiv * getMissionXpPerFuel(pl) * relative));
}

/** @deprecated Prefer getMissionXpPerFuel / computeMissionXpFromFuel. */
export function getEarlyXpMultiplier(_level = 1) {
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
export const FUEL_PURCHASE_MAX = 10; // per 24h cycle (200 fuel total)
/** Smallest chargeable fuel unit (L1–5 short jobs = 15s = 0.25 fuel). */
export const MISSION_MIN_FUEL = 0.25;

export function computeFuelCost(template) {
  // 1 fuel = 1 minute of mission time (30s = 0.5, 40s = 0.67, 60s = 1, etc.)
  const durationSeconds = Math.floor(template.duration_seconds || 60);
  return Math.round((durationSeconds / 60) * 100) / 100;
}

// The actual fuel that will be deducted at launch — applies ship-mod reductions,
// the early-game fuel discount, and the 0.5 minimum floor. Use this everywhere
// a fuel cost is displayed so it matches the actual deduction.
export function getEffectiveFuelCost(character, mission) {
  // Residual / explicit fuel missions pin their cost so low-fuel offers stay runnable.
  if (typeof mission?.fuel_cost === "number") {
    return Math.max(MISSION_MIN_FUEL, Math.round(mission.fuel_cost * 100) / 100);
  }
  // Fuel is charged per minute of the ACTUAL (effective) mission time, so it
  // matches the duration shown after warp/fuel-mount reductions.
  const effectiveSeconds = getEffectiveMissionDuration(character, mission);
  const raw = effectiveSeconds / 60 - getModEffectTotal(character, "fuel_cost_reduction");
  return Math.max(MISSION_MIN_FUEL, Math.round(raw * 100) / 100);
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
// QUEST GIVERS — cantina patrons that rotate per mission offer
// ═══════════════════════════════════════════
export const QUEST_GIVERS = [
  { emoji: "🤖", name: "CLANK", color: "#00E5FF" },
  { emoji: "👽", name: "Zyx", color: "#9D5CFF" },
  { emoji: "🐙", name: "Capt. Tentak", color: "#FF6B35" },
  { emoji: "🧙", name: "Old Maru", color: "#FFD700" },
  { emoji: "👻", name: "Wraith Vin", color: "#8BE8FF" },
  { emoji: "🦊", name: "Rix", color: "#FF9E4F" },
  { emoji: "🐉", name: "Drako", color: "#FF4D6D" },
  { emoji: "🛸", name: "Skip", color: "#5CFFB0" },
  { emoji: "🐺", name: "Grimma", color: "#A3A3A3" },
  { emoji: "🧟", name: "Moss", color: "#84CC16" },
  { emoji: "🦜", name: "Squawk", color: "#F472B6" },
  { emoji: "🦎", name: "Slick", color: "#34D399" },
];

export function pickQuestGiver(rng = Math.random, excludeNames = []) {
  const excluded = new Set(excludeNames || []);
  const pool = QUEST_GIVERS.filter((g) => !excluded.has(g.name));
  const list = pool.length ? pool : QUEST_GIVERS;
  return list[Math.floor(rng() * list.length)];
}

// ═══════════════════════════════════════════
// DAILY MISSIONS (randomized — always offers 3 quests from a larger rotating pool)
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

// Design chart — mission duration brackets by level (fuel = minutes).
//   L1–5:   15s–45s   (0.25–0.75 fuel)
//   L6–10:  1–2.5 min (1–2.5 fuel)
//   L11–15: 2.5–10 min
//   L16+:   5–20 min
const MISSION_DURATION_BRACKETS = [
  { maxLevel: 5, minSec: 15, maxSec: 45 },
  { maxLevel: 10, minSec: 60, maxSec: 150 },
  { maxLevel: 15, minSec: 150, maxSec: 600 },
  { maxLevel: Infinity, minSec: 300, maxSec: 1200 },
];
const MISSION_MAX_DURATION = 1200;

export function getMissionDurationBracket(level = 1) {
  const lvl = Math.max(1, level || 1);
  return MISSION_DURATION_BRACKETS.find((b) => lvl <= b.maxLevel) || MISSION_DURATION_BRACKETS[MISSION_DURATION_BRACKETS.length - 1];
}

/** Snap seconds to a clean 15s tick within the level's min/max. */
export function rollMissionDurationSeconds(level = 1, unit = Math.random()) {
  const { minSec, maxSec } = getMissionDurationBracket(level);
  const t = Math.min(1, Math.max(0, Number(unit) || 0));
  const raw = minSec + (maxSec - minSec) * t;
  const snapped = Math.round(raw / 15) * 15;
  return Math.min(MISSION_MAX_DURATION, Math.max(minSec, snapped));
}

export function generateDailyMissions(character) {
  const level = character.level || 1;
  const maxSector = (character.highest_sector || 1) + 1;
  const doable = MISSION_TEMPLATES.filter((m) => m.level_requirement <= level && m.sector <= maxSector);
  const pool = doable.length ? doable : MISSION_TEMPLATES.filter((m) => m.level_requirement <= level);
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  const base = shuffled.length ? shuffled : MISSION_TEMPLATES;

  // Offer 3 quests drawn from the rotating template pool. Duration is rolled
  // once within the level bracket (no short/mid/long variants). Quest givers
  // are unique on the board — no two patrons offer jobs at once.
  const givers = [...QUEST_GIVERS].sort(() => Math.random() - 0.5);
  return Array.from({ length: 3 }, (_, i) => {
    const t = base[i % base.length];
    // Single duration within the level's min–max (not tiered variants).
    const duration = rollMissionDurationSeconds(level);
    const collectible = COLLECTIBLES[Math.floor(Math.random() * COLLECTIBLES.length)];
    const { difficulty: _d, risk: _r, rewards: _oldRewards, ...tpl } = t;
    const draft = {
      ...tpl,
      _seed: `${Date.now()}-${i}`,
      patron: givers[i % givers.length],
      duration_seconds: duration,
      stardust_efficiency: 1,
      xp_efficiency: 1,
    };
    const fuelEst = getEffectiveFuelCost(character, draft);
    // Loot floor scales gently with level — no risk rating.
    const rarityKey = level >= 12 ? "epic" : level >= 7 ? "rare" : level >= 3 ? "uncommon" : "common";
    return {
      ...draft,
      rewards: {
        experience: computeMissionXpFromFuel(fuelEst, level, 1),
        stardust: computeMissionStardustFromFuel(fuelEst, level, 1),
        item_rarity_chance: rarityKey,
        collectible,
      },
    };
  });
}

// ═══════════════════════════════════════════
// LOW-FUEL FALLBACK — level-agnostic errands sized to leftover fuel.
// 0.5 fuel → 30s, 1 fuel → 60s, etc. (clamped 30s–5m). Always level_requirement 1
// so a high-level player with scraps of fuel can still spend the remainder.
// ═══════════════════════════════════════════
const LOW_FUEL_TEMPLATES = [
  {
    name: "Quick Salvage Sweep",
    description: "A fast burn through nearby debris — light on fuel, light on glory, but better than idling.",
    location: "Drift Sector 7",
  },
  {
    name: "Scavenge the Dock Lights",
    description: "Pop a few broken bay lamps for scrap wire. Tiny job, tiny tank — still counts.",
    location: "Hangar Rim",
  },
  {
    name: "Courier Hop: One Parcel",
    description: "Drop a sealed envelope two decks over. The recipient tips in dust. Barely.",
    location: "Station Corridor 3",
  },
];

export function generateLowFuelMission(character, currentFuel, excludePatronNames = [], slot = 0) {
  const level = character?.level || 1;
  // Round to hundredths so 0.5 fuel is never lost to float noise.
  const fuel = Math.round(Math.max(0, currentFuel || 0) * 100) / 100;
  // Spend as much of the remainder as possible on a clean 15s-snapped timer.
  const duration = Math.min(300, Math.max(15, Math.round((fuel * 60) / 15) * 15));
  const fuelCost = Math.min(fuel, Math.round((duration / 60) * 100) / 100);
  const tpl = LOW_FUEL_TEMPLATES[slot % LOW_FUEL_TEMPLATES.length];
  const pinnedFuel = Math.max(MISSION_MIN_FUEL, fuelCost);
  return {
    name: tpl.name,
    description: tpl.description,
    location: tpl.location,
    sector: 1,
    duration_seconds: duration,
    level_requirement: 1,
    // Pin cost to remainder so mounts/reductions can't push it above what you have.
    fuel_cost: pinnedFuel,
    stardust_efficiency: 1,
    xp_efficiency: 1,
    _lowFuel: true,
    patron: pickQuestGiver(Math.random, excludePatronNames),
    rewards: {
      experience: computeMissionXpFromFuel(pinnedFuel, level, 1),
      stardust: computeMissionStardustFromFuel(pinnedFuel, level, 1),
      item_rarity_chance: "common",
    },
  };
}

// Build 1–3 residual jobs that all fit in `currentFuel`, with unique patrons.
export function generateLowFuelBoard(character, currentFuel, count = 3) {
  const fuel = Math.round(Math.max(0, currentFuel || 0) * 100) / 100;
  if (fuel < MISSION_MIN_FUEL) return [];
  const n = Math.min(count, LOW_FUEL_TEMPLATES.length);
  const used = [];
  return Array.from({ length: n }, (_, i) => {
    const m = generateLowFuelMission(character, fuel, used, i);
    if (m.patron?.name) used.push(m.patron.name);
    return m;
  });
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

/** Attribute accent colors — stims, chips, and attribute UI share these. */
export const STAT_COLORS = {
  strength: "#F59E0B",
  agility: "#34D399",
  intellect: "#60A5FA",
  vitality: "#FB7185",
  luck: "#C084FC",
  all: "#FBBF24",
};

export function getStatColor(stat) {
  return STAT_COLORS[stat] || STAT_COLORS.all;
}

// Display label for an item's gear type. The stored type stays lowercase
// ("accessory"); only the visible label changes to "Ring".
export function gearTypeLabel(type) {
  if (!type) return "";
  if (type === "accessory") return "Ring";
  return type.charAt(0).toUpperCase() + type.slice(1);
}

export const STAT_DESCRIPTIONS = {
  strength: "Damage (STR class) or Armor vs Strength damage (other classes)",
  agility: "Dodge for all · Damage for AGI classes (bypasses Armor & Tech Resist)",
  intellect: "Tech Damage (INT class) or Tech Resist (other classes)",
  vitality: "Max HP — round(50 + 2.5×VIT + 0.008×VIT²)",
  luck: "Crit Chance (soft-capped by level, hard cap 30%, 1.5× dmg)",
};

// Class-aware attribute roles (STR / AGI / INT mapping).
export function getStatDescription(stat, className) {
  const cls = className ? CLASSES[className] : null;
  const isPrimary = stat === cls?.primaryStat;
  const primary = cls?.primaryStat;

  switch (stat) {
    case "luck":
      return "Crit Chance from Luck (cap 30%, soft-capped before Lv100, 1.5× crit)";
    case "agility":
      return isPrimary
        ? "Scales Agility damage (bypasses Armor & Tech Resist) · Dodge (cap 25%)"
        : "Dodge Chance (cap 25%, soft-capped before Lv100)";
    case "vitality":
      return "Max HP = round(50 + 2.5×VIT + 0.008×VIT²)";
    case "strength":
      if (isPrimary) return "Scales Strength damage";
      if (primary === "strength") return "Already your damage stat — no Armor from Strength";
      return "Armor vs Strength damage (cap 30%, soft-capped before Lv100)";
    case "intellect":
      if (isPrimary) return "Scales Tech damage";
      if (primary === "intellect") return "Already your damage stat — no Tech Resist from Intellect";
      return "Tech Resist vs Tech damage (cap 30%, soft-capped before Lv100)";
    default:
      return STAT_DESCRIPTIONS[stat] || "";
  }
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
// SHIP TYPES (buyable hulls — staged unlock levels)
// Each ship keeps its own independent mod loadout; inherent bonuses
// apply only while that ship is active.
// ═══════════════════════════════════════════
export const STARTER_SHIP = "scout";
/** Highest hull gate (dreadnought). Individual ships use unlock_level. */
export const SHIP_UNLOCK_LEVEL = 200;

/** Early Scout bay tune — free Fuel Tank T1 so the hangar teaches upgrades before Frigate. */
export const SCOUT_MILESTONE_LEVEL = 20;
export const SCOUT_MILESTONE_MOD_ID = "fuel_tank_1";

/** Hull order — each step’s mods are +8% stronger (and pricier) than the prior hull’s same tier. */
export const SHIP_TIER_ORDER = ["scout", "frigate", "cruiser", "dreadnought"];
export const SHIP_UPGRADE_STEP = 1.08;
/** Mod install cost rises a bit faster than power (~+10%/hull). */
export const SHIP_COST_STEP = 1.10;

export const SHIP_TYPES = {
  scout: {
    name: "Recon Scout", emoji: "🛩️", cost: 0, unlock_level: 1,
    desc: "Standard-issue exploration vessel. Reliable, if unremarkable.",
    inherent: {},
    upgrade_mult: 1.0,
    cost_mult: 1.0,
  },
  frigate: {
    name: "Storm Frigate", emoji: "🚀", cost: 5000, unlock_level: 50,
    desc: "Military-grade frigate with reinforced hull plating and salvage magnets.",
    inherent: { mission_stardust_mult: 0.05 },
    upgrade_mult: SHIP_UPGRADE_STEP,
    cost_mult: SHIP_COST_STEP,
  },
  cruiser: {
    name: "Galaxy Cruiser", emoji: "🛳️", cost: 15000, unlock_level: 100,
    desc: "Long-range endurance cruiser with an overcharged AI core.",
    inherent: { mission_xp_mult: 0.05, mission_duration_reduction: 0.03 },
    upgrade_mult: SHIP_UPGRADE_STEP ** 2,
    cost_mult: SHIP_COST_STEP ** 2,
  },
  dreadnought: {
    name: "Void Dreadnought", emoji: "🛸", cost: 40000, unlock_level: 200,
    desc: "Capital-class warship. The ultimate command vessel.",
    inherent: { mission_stardust_mult: 0.10, mission_xp_mult: 0.10, fuel_cost_reduction: 1 },
    upgrade_mult: SHIP_UPGRADE_STEP ** 3,
    cost_mult: SHIP_COST_STEP ** 3,
  },
};

// Minimum character level required to purchase a given ship hull.
export function getShipUnlockLevel(shipId) {
  return SHIP_TYPES[shipId]?.unlock_level || 1;
}

// Higher hulls amplify every installed mod — +8% vs the previous hull’s same tier.
export function getShipUpgradeMult(shipId) {
  return SHIP_TYPES[shipId]?.upgrade_mult ?? 1;
}

export function getShipCostMult(shipId) {
  return SHIP_TYPES[shipId]?.cost_mult ?? 1;
}

/** Stardust price for installing a mod tier on a given hull. */
export function getTierCost(tier, shipId) {
  if (!tier) return 0;
  return Math.max(1, Math.round((tier.cost || 0) * getShipCostMult(shipId)));
}

export function getActiveShipId(character) {
  return character?.active_ship || STARTER_SHIP;
}

export function getActiveShipType(character) {
  return SHIP_TYPES[getActiveShipId(character)] || SHIP_TYPES[STARTER_SHIP];
}

/** Mod IDs on a specific hull (defaults to active). Inactive hulls keep their own loadout. */
export function getShipModIds(character, shipId) {
  const id = shipId || getActiveShipId(character);
  const loadouts = character?.ship_mod_loadouts;
  if (loadouts && Array.isArray(loadouts[id])) return loadouts[id];
  if (id === getActiveShipId(character)) return character?.ship_mods || [];
  return [];
}

// Mods installed on the currently active ship (per-ship loadout).
export function getActiveShipMods(character) {
  return getShipModIds(character, getActiveShipId(character));
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

export function getInstalledMods(character, shipId) {
  const id = shipId || getActiveShipId(character);
  const ids = getShipModIds(character, id);
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

export function getCategoryProgress(character, catKey, shipId) {
  const cat = SHIP_MODS[catKey];
  if (!cat) return { installed: 0, next: null, maxed: false };
  const ids = getShipModIds(character, shipId);
  const installed = cat.tiers.filter((t) => ids.includes(t.id)).length;
  return { installed, next: installed < cat.tiers.length ? cat.tiers[installed] : null, maxed: installed >= cat.tiers.length };
}

export function getShipInherentLabel(ship) {
  if (!ship?.inherent && !(ship?.upgrade_mult > 1)) return "";
  const inh = ship.inherent || {};
  const parts = [];
  if (inh.mission_stardust_mult) parts.push(`+${Math.round(inh.mission_stardust_mult * 100)}% Stardust`);
  if (inh.mission_xp_mult) parts.push(`+${Math.round(inh.mission_xp_mult * 100)}% XP`);
  if (inh.mission_duration_reduction) parts.push(`-${Math.round(inh.mission_duration_reduction * 100)}% Time`);
  if (inh.fuel_cost_reduction) parts.push(`-${inh.fuel_cost_reduction} Fuel`);
  const mult = ship?.upgrade_mult;
  if (mult && mult > 1) parts.push(`+${Math.round((mult - 1) * 100)}% Upgrade Power`);
  return parts.join(" · ");
}

/** Lv 20 Scout milestone status (free first fuel-tank tier). */
export function getScoutMilestoneStatus(character) {
  const level = SCOUT_MILESTONE_LEVEL;
  const claimed = !!character?.ship_milestones?.scout_bay;
  const eligible = (character?.level || 1) >= level;
  return { level, claimed, eligible, ready: eligible && !claimed };
}

/**
 * Grant free Fuel Tank T1 on the Scout loadout once.
 * Returns a character patch, or null if nothing to do.
 */
export function buildScoutMilestonePatch(character) {
  const status = getScoutMilestoneStatus(character);
  if (!status.ready) return null;
  const loadouts = { ...(character.ship_mod_loadouts || {}) };
  const scoutMods = Array.isArray(loadouts[STARTER_SHIP])
    ? [...loadouts[STARTER_SHIP]]
    : [...getShipModIds(character, STARTER_SHIP)];
  if (!scoutMods.includes(SCOUT_MILESTONE_MOD_ID)) scoutMods.push(SCOUT_MILESTONE_MOD_ID);
  loadouts[STARTER_SHIP] = scoutMods;
  const patch = {
    ship_mod_loadouts: loadouts,
    ship_milestones: { ...(character.ship_milestones || {}), scout_bay: true },
  };
  if (getActiveShipId(character) === STARTER_SHIP) {
    const newMax = computeMaxFuelForLoadout(scoutMods, STARTER_SHIP);
    patch.max_fuel = newMax;
    patch.fuel = Math.min((character.fuel ?? FUEL_MAX) + (newMax - (character.max_fuel || FUEL_MAX)), newMax);
    patch.fuel_updated_at = new Date().toISOString();
  }
  return patch;
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