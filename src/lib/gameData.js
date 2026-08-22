import { getEffectiveMissionDuration } from "@/lib/fuelMounts";
import { isShipHangarEnabled } from "@/lib/featureFlags";
import {
  todayET,
  getShopWindow,
  getShopGameDayKey,
  msUntilNextShopGameDay,
} from "@/lib/gameTime";
import {
  STARTING_ATTRIBUTES,
  xpToNext,
  missionXpPerFuel,
  roundHalfUp,
} from "@/lib/productionMath";
import {
  EQUIPMENT_SLOTS,
  rollItemStats,
  computeItemVendorValue,
} from "@/lib/itemGeneration";
import {
  getAllowedMissionDurations,
  getMissionDurationBracket,
  rollMissionDurationSeconds,
  remainingFuelDurationSeconds,
  needsRemainingFuelException,
  isNormalPoolDuration,
  isValidMissionDuration,
  isLaunchableMissionDuration,
  MISSION_MIN_DURATION_SECONDS,
  MISSION_MAX_DURATION_SECONDS,
  MISSION_SECONDS_PER_FUEL,
  MISSION_MIN_FUEL as MISSION_DURATION_MIN_FUEL,
} from "@/lib/missionDuration";
import {
  StardustPerFuel,
  AttributePurchaseCost,
  MissionStardustReward,
  ArenaWinStardust,
  computeMiningReward,
  JunkSaleValue,
  GearSaleValue,
  missionGearDropChance as seMissionGearDropChance,
  rollMissionGearDrop as seRollMissionGearDrop,
  computeMissionJunkSellValue as seComputeMissionJunkSellValue,
  MISSION_GEAR_BASE_CHANCE,
  MISSION_GEAR_PITY_INCREMENT,
  MISSION_GEAR_DROP_CAP as SE_MISSION_GEAR_DROP_CAP,
  MINING_EFFICIENCY,
  ARENA_WIN_FUEL_EQUIVALENT,
} from "./stardustEconomy.js";

export {
  StardustPerFuel,
  AttributePurchaseCost,
  MissionStardustReward,
  ArenaWinStardust,
  computeMiningReward,
  JunkSaleValue,
  GearSaleValue,
  MINING_EFFICIENCY,
  ARENA_WIN_FUEL_EQUIVALENT,
};

export {
  getAllowedMissionDurations,
  getMissionDurationBracket,
  rollMissionDurationSeconds,
  remainingFuelDurationSeconds,
  needsRemainingFuelException,
  isNormalPoolDuration,
  isValidMissionDuration,
  isLaunchableMissionDuration,
  MISSION_MIN_DURATION_SECONDS,
  MISSION_MAX_DURATION_SECONDS,
  MISSION_SECONDS_PER_FUEL,
};
/**
 * LEGACY ECONOMY IMPLEMENTATION — PENDING SYSTEM-SPECIFIC MIGRATION/RECONCILIATION
 * Historical ×10 value inflation. NOT production XP policy. NOT production
 * economy authority. Do not apply this constant to XP.
 */
export const XP_STARDUST_SCALE = 10;

const PERCENT_SCALE = 100;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const MILLISECONDS_PER_SECOND = 1_000;
const SECONDS_PER_MINUTE = 60;
const MILLISECONDS_PER_HOUR = MILLISECONDS_PER_SECOND * SECONDS_PER_MINUTE * MINUTES_PER_HOUR;
const FUEL_PRECISION_SCALE = 100;
const NOVA_HALF_UNIT_SCALE = 2;
const PERCENT_DISPLAY_DECIMAL_PLACES = 1;

// ═══════════════════════════════════════════
// RACES
// ═══════════════════════════════════════════
export const RACES = {
  Zyrathi: {
    name: "Zyrathi",
    emoji: "🐉",
    tagline: "Scaled hotheads from the Ember Nebula",
    lore: "Dragonfolk with armor for skin and a temper for fuel. They punch first, negotiate later, and insist the smoking crater was 'defensive.' Great at war. Terrible at dinner parties.",
    skinColors: ["#9B2D2D", "#8B4513", "#4A0E4E", "#1C3D5A"],
    eyeStyles: ["Slit Ember", "Twin Flame", "Void Gaze"],
    markings: ["Tribal Scars", "Heat Lines", "Scale Crown", "None"],
  },
  Cognati: {
    name: "Cognati",
    emoji: "🤖",
    tagline: "Walking spreadsheets with laser opinions",
    lore: "Half chrome, half attitude, fully convinced they already simulated this conversation. They run the numbers, win the argument, then blue-screen when someone asks how their day was.",
    skinColors: ["#C0C0C0", "#1a1a2e", "#0D2137", "#3D3D3D"],
    eyeStyles: ["LED Array", "Holographic", "Scan Beam"],
    markings: ["Circuit Lines", "Data Streams", "Chrome Plating", "None"],
  },
  Luminae: {
    name: "Luminae",
    emoji: "rainbow",
    tagline: "Living disco balls with a hero complex",
    lore: "Starlight given legs and an ego. They light up corridors, blind friends by accident, and somehow always land on their feet. Bring sunglasses. And maybe a mirror.",
    skinColors: ["#E8D5B7", "#C9B8FF", "#B8E6FF", "#FFE4B5"],
    eyeStyles: ["Star Burst", "Nebula Swirl", "Aurora Glow"],
    markings: ["Light Veins", "Star Map", "Constellation", "None"],
  },
  Grothak: {
    name: "Grothak",
    emoji: "💪",
    tagline: "High-gravity tanks who treat walls as suggestions",
    lore: "Grew up where the air weighs more than your regrets. Slow to start, impossible to stop, and vaguely offended by doors. If it needs smashing, hire a Grothak. If it needs subtlety… also hire a Grothak, then apologize.",
    skinColors: ["#696969", "#8B7355", "#4A4A4A", "#5C4033"],
    eyeStyles: ["Deep Set", "Crystal Shard", "Magma Core"],
    markings: ["Crack Lines", "Moss Growth", "Gem Inlays", "None"],
  },
  Synthara: {
    name: "Synthara",
    emoji: "🎭",
    tagline: "Face-swappers from the Shadow Reach",
    lore: "Professional strangers. They borrow faces, walk into restricted zones, and leave with the goods plus your dignity. Trust them? Sure. Just count the spoons afterward.",
    skinColors: ["#2E1A47", "#1A3C34", "#3D1F1F", "#1A1A3C"],
    eyeStyles: ["Shifting Iris", "Mirrored", "Phantom Glow"],
    markings: ["Shadow Wisps", "Phase Lines", "Mimic Spots", "None"],
  },
};

// ═══════════════════════════════════════════
// CLASSES
// ═══════════════════════════════════════════
/** Starting attributes by primary type — sourced from productionMath.STARTING_ATTRIBUTES. */
export const CLASS_TYPE_BASE_STATS = {
  strength: {
    strength: STARTING_ATTRIBUTES.Might.str,
    agility: STARTING_ATTRIBUTES.Might.agi,
    intellect: STARTING_ATTRIBUTES.Might.int,
    vitality: STARTING_ATTRIBUTES.Might.vit,
    luck: STARTING_ATTRIBUTES.Might.luck,
  },
  agility: {
    strength: STARTING_ATTRIBUTES.Reflex.str,
    agility: STARTING_ATTRIBUTES.Reflex.agi,
    intellect: STARTING_ATTRIBUTES.Reflex.int,
    vitality: STARTING_ATTRIBUTES.Reflex.vit,
    luck: STARTING_ATTRIBUTES.Reflex.luck,
  },
  intellect: {
    strength: STARTING_ATTRIBUTES.Tech.str,
    agility: STARTING_ATTRIBUTES.Tech.agi,
    intellect: STARTING_ATTRIBUTES.Tech.int,
    vitality: STARTING_ATTRIBUTES.Tech.vit,
    luck: STARTING_ATTRIBUTES.Tech.luck,
  },
};

export const CLASSES = {
  Vanguard: {
    name: "Vanguard",
    emoji: "⚔️",
    tagline: "Rage induced strength. Doesn't like dodges",
    description: "Vanguards meet the galaxy head-on, turning raw Might and a questionable relationship with self-preservation into overwhelming force. Missing one only seems to make them take the next swing personally.",
    primaryStat: "strength",
    baseStats: { ...CLASS_TYPE_BASE_STATS.strength },
    special: {
      name: "Kinetic Tantrum",
      effect: "When the Vanguard dodges, their next attack is a guaranteed 1.5× crit. When their attack is dodged, their next attack is guaranteed to hit and crit for 2.0× damage.",
      identity: "Punish every dodge with overwhelming force.",
    },
  },
  "Shadow Operative": {
    name: "Shadow Operative",
    emoji: "🗡️",
    tagline: "You'll see their hologram before them",
    description: "Shadow Operatives weaponize Reflex, misdirection, and precision to ensure the enemy is always firing at where they used to be. By the time you've found the real one, they've usually finished the job.",
    primaryStat: "agility",
    baseStats: { ...CLASS_TYPE_BASE_STATS.agility },
    special: {
      name: "Phantom Signal",
      effect: "The first 2 attacks made against the Shadow Operative each combat are guaranteed to hit a hologram and miss. These do not count as dodges.",
      identity: "Leave only a hologram for the opening volleys.",
    },
  },
  Technomancer: {
    name: "Technomancer",
    emoji: "⚡",
    tagline: "Relies on powerful but unstable Tech",
    description: "Technomancers push forbidden technology beyond every sensible operating limit, converting raw Tech into increasingly catastrophic firepower. Warning labels are generally treated as optimization suggestions.",
    primaryStat: "intellect",
    baseStats: { ...CLASS_TYPE_BASE_STATS.intellect },
    special: {
      name: "Overclock",
      effect: "Each attack (regardless of hit or miss) grants a stack that increases damage dealt by 12.5% and damage taken by 5%. Enemy critical hits remove 3 stacks.",
      identity: "Push the core until it screams.",
    },
  },
  "Astral Warden": {
    name: "Astral Warden",
    emoji: "🛡️",
    tagline: "A natural protector with powerful shields",
    description: "Astral Wardens are immovable bulwarks whose immense Might is matched only by their unnatural resilience. Even when their defenses finally crack, the cosmos has an irritating habit of putting them back together.",
    primaryStat: "strength",
    baseStats: { ...CLASS_TYPE_BASE_STATS.strength },
    special: {
      name: "Astral Barrier",
      effect: "At the start of each turn, the Astral Warden has a 10% chance to gain or fully restore a barrier equal to 15% of maximum HP.",
      identity: "The class that simply refuses to die.",
    },
  },
  "Void Runner": {
    name: "Void Runner",
    emoji: "☄️",
    tagline: "Masters of the jury-rig",
    description: "Void Runners survive the frontier through lightning Reflexes and an impressive collection of devices of questionable legality. Fair fights are mostly something that happens to other people.",
    primaryStat: "agility",
    baseStats: { ...CLASS_TYPE_BASE_STATS.agility },
    special: {
      name: "Dirty Tricks",
      effect: "At the start of each fight, the Void Runner has an equal chance to gain one trick for the combat: Flashbang (+7.5% Dodge), Targeting Beacon (+7.5% Crit Chance), or Unlicensed Stimulant (2 attacks before the opponent can act).",
      identity: "Never fight fair.",
    },
  },
  "Cosmic Engineer": {
    name: "Cosmic Engineer",
    emoji: "🔧",
    tagline: "Has a trusted Drone buddy",
    description: "Cosmic Engineers turn Tech into an arsenal of machines, drones, and improvised solutions that keep fighting long after common sense says they shouldn't. A good Engineer never fights alone... and rarely knows exactly what their equipment will do next.",
    primaryStat: "intellect",
    baseStats: { ...CLASS_TYPE_BASE_STATS.intellect },
    special: {
      name: "Orbital Assistant",
      effect: "Every 2nd turn, the Engineer’s drone has an equal chance to provide Fire Support (Deal 60% of the engineer's base damage as True Damage), Defensive Protocol (25% reduction in damage from next hit the engineer takes), or Acquire Target (Increases the critical strike chance of the engineer's next attack by 40%).",
      identity: "Wins through gadgets and sustained pressure.",
    },
  },
};

// ═══════════════════════════════════════════
// MISSIONS
// ═══════════════════════════════════════════
export const MISSION_TEMPLATES = [
  { name: "Patrol the Rimward Sector", location: "Nebula Station Alpha", description: "Stroll the rim like you own the place. Mostly squinting at blips that are, statistically, 99% space geese. Bring snacks and a thermos of questionable coffee.", difficulty: "easy", sector: 1, duration_seconds: 60, risk: 1, rewards: { experience: 250, stardust: 500, item_rarity_chance: "common" }, level_requirement: 1 },
  { name: "Salvage Run: Derelict Freighter", location: "Wreck of the ISS Meridian", description: "The ISS Meridian went quiet forty years ago. The cargo? Still there. The crew? Also still there, sort of. Bring a crowbar, a strong denial gland, and maybe a spare pair of pants.", difficulty: "easy", sector: 1, duration_seconds: 120, risk: 2, rewards: { experience: 400, stardust: 800, item_rarity_chance: "uncommon" }, level_requirement: 1 },
  { name: "Asteroid Mining Operation", location: "Kelvari Belt", description: "Smack glowing space rocks until they confess their secrets. The rocks have started fighting back recently. Nobody knows why. It's a whole thing. Bring a bigger hammer.", difficulty: "medium", sector: 1, duration_seconds: 180, risk: 2, rewards: { experience: 650, stardust: 1300, item_rarity_chance: "uncommon" }, level_requirement: 2 },
  { name: "Xeno-Archaeological Dig", location: "Planet Ashara IV", description: "Dig up ruins older than your grandpa's password. Whatever's buried down there keeps whispering your name in a language that shouldn't exist. It's probably fine. Probably.", difficulty: "medium", sector: 2, duration_seconds: 300, risk: 3, rewards: { experience: 1000, stardust: 2000, item_rarity_chance: "rare" }, level_requirement: 3 },
  { name: "Escort the Diplomat", location: "Luminae Homeworld", description: "Ambassador Zyr'tal is 'very important' and 'definitely not a war criminal.' Walk him through hostile territory while he critiques your posture. Do NOT, under any circumstances, let him order the seafood.", difficulty: "hard", sector: 2, duration_seconds: 420, risk: 3, rewards: { experience: 1500, stardust: 3000, item_rarity_chance: "rare" }, level_requirement: 4 },
  { name: "Infiltrate Pirate Stronghold", location: "Shadow Station Omega", description: "Sneak into the galaxy's worst-kept secret base, disable their shields, and try not to become someone's new parrot. Remember: stealth is just lying, but with extra steps and a turtleneck.", difficulty: "hard", sector: 3, duration_seconds: 600, risk: 4, rewards: { experience: 2200, stardust: 4500, item_rarity_chance: "epic" }, level_requirement: 5 },
  { name: "Void Rift Anomaly", location: "The Shattered Expanse", description: "A hole in spacetime is slowly eating the neighboring systems. Science says 'don't touch it.' We're paying you to touch it. A lot. With your hands. Good luck, you beautiful idiot.", difficulty: "elite", sector: 3, duration_seconds: 900, risk: 4, rewards: { experience: 3500, stardust: 7000, item_rarity_chance: "epic" }, level_requirement: 7 },
  { name: "Ancient AI Core Recovery", location: "Cognati Prime Archives", description: "Dive into a corrupted AI archive and rip out its glowing heart. The AI is unhappy about this. The AI has opinions. The AI has opinions AND lasers. This will be a conversation.", difficulty: "elite", sector: 4, duration_seconds: 1200, risk: 5, rewards: { experience: 5000, stardust: 10000, item_rarity_chance: "legendary" }, level_requirement: 9 },
  { name: "Supernova Extraction", location: "Dying Star VX-9", description: "Harvest exotic matter from a star that is, cosmically speaking, about to throw the mother of all tantrums. The window is 'now-ish.' The star is 'also now-ish.' Please sync your watches. And your affairs.", difficulty: "legendary", sector: 4, duration_seconds: 1800, risk: 5, rewards: { experience: 8000, stardust: 15000, item_rarity_chance: "legendary" }, level_requirement: 12 },
  { name: "Contraband Dash", location: "Keldris Reach", description: "Move some 'perfectly legal' cargo past a patrol that's definitely not looking for exactly this. The manifest says 'agricultural supplies.' The agricultural supplies are humming. Don't ask.", difficulty: "easy", sector: 1, duration_seconds: 90, risk: 1, rewards: { experience: 300, stardust: 600, item_rarity_chance: "common" }, level_requirement: 1 },
  { name: "Distress Signal: Freighter Vael", location: "Drift Sector 7", description: "A cargo ship sent a distress call consisting entirely of someone saying 'whoops' on a loop. Either they're very unlucky or very honest. Either way, they're paying.", difficulty: "easy", sector: 1, duration_seconds: 150, risk: 2, rewards: { experience: 450, stardust: 900, item_rarity_chance: "uncommon" }, level_requirement: 1 },
  { name: "Black Market Buy", location: "The Bazaar of Torment", description: "Meet a contact who insists on being called 'The Whisper' but whose real name is Gary. He's got rare goods and even rarer BO. Hold your breath and negotiate.", difficulty: "medium", sector: 1, duration_seconds: 210, risk: 2, rewards: { experience: 700, stardust: 1400, item_rarity_chance: "uncommon" }, level_requirement: 2 },
  { name: "Bioluminescent Survey", location: "Glowlily Marshes of Vesh", description: "Catalogue glowing alien flora that communicates via color-coded mood lighting. Right now it's flashing 'annoyed pink.' You've been warned. Bring sunscreen. Emotional sunscreen.", difficulty: "medium", sector: 2, duration_seconds: 330, risk: 3, rewards: { experience: 1100, stardust: 2200, item_rarity_chance: "rare" }, level_requirement: 3 },
  { name: "Prison Break: Vault Helix", description: "Spring a wrongly-accused scientist from a maximum-security asteroid prison. The warden is a massive fan of his work and won't stop asking for selfies. Escape plan includes 'sorry, we're late for a thing.'", location: "Vault Helix Penal Colony", difficulty: "hard", sector: 2, duration_seconds: 450, risk: 3, rewards: { experience: 1600, stardust: 3200, item_rarity_chance: "rare" }, level_requirement: 4 },
  { name: "Hunt the Rogue Synthetic", location: "Ferro Wastes", description: "A combat android went rogue and is now living in a junkyard, writing poetry. It's actually quite good. You still have to decommission it. Bring tissues. And a really big magnet.", difficulty: "hard", sector: 3, duration_seconds: 540, risk: 4, rewards: { experience: 2300, stardust: 4600, item_rarity_chance: "epic" }, level_requirement: 5 },
  { name: "Quasar Heist", location: "Banking Nexus of Cygnus", description: "Rob the most secure vault in the galaxy. The vault's AI has been bored for 300 years and might actually help you just for the entertainment. Don't disappoint it. It remembers faces.", difficulty: "elite", sector: 3, duration_seconds: 810, risk: 4, rewards: { experience: 3600, stardust: 7200, item_rarity_chance: "epic" }, level_requirement: 7 },
  { name: "Diplomatic Incident Cleanup", location: "Cethylli Embassy Ring", description: "Two alien species are about to go to war over a mispronounced compliment. You have one hour to apologize in seven dialects, including one that doesn't have mouths. Bring phrasebooks and a sense of humility.", difficulty: "medium", sector: 2, duration_seconds: 270, risk: 3, rewards: { experience: 950, stardust: 1900, item_rarity_chance: "rare" }, level_requirement: 3 },
  { name: "Ghost Ship Investigation", location: "Wreck of the Pale Horizon", description: "A ship reappeared after being lost for 200 years. The crew is gone. The coffee is still warm. The navigation logs just say 'we're sorry' on loop. Go figure out what 'sorry' means here.", difficulty: "hard", sector: 3, duration_seconds: 570, risk: 4, rewards: { experience: 2400, stardust: 4800, item_rarity_chance: "epic" }, level_requirement: 6 },
  { name: "Nebula Beast Migration", location: "Veil Nebula Corridor", description: "Escort a pod of migrating space leviathans through a shipping lane. The leviathans are enormous, gentle, and deeply curious about your ship. They will absolutely try to taste it. Be polite.", difficulty: "medium", sector: 1, duration_seconds: 240, risk: 2, rewards: { experience: 800, stardust: 1600, item_rarity_chance: "uncommon" }, level_requirement: 2 },
  { name: "Black Hole Survey", location: "Accretion Rim of X-7", description: "Take readings from just outside a black hole. The physics get weird. Your watch runs backwards. Your lunch is now your dinner. Don't lean too far over the railing. There is no railing.", difficulty: "elite", sector: 4, duration_seconds: 1050, risk: 5, rewards: { experience: 4000, stardust: 8000, item_rarity_chance: "legendary" }, level_requirement: 8 },
  // Early-board filler — keeps the cantina stocked with 8 unique names from level 1.
  { name: "Mail Run: Express Capsule", location: "Orbital Post Hub", description: "Deliver a sealed capsule that ticks when you shake it. The postal clerk says it's 'definitely not a bomb.' The postal clerk is sweating. A lot.", difficulty: "easy", sector: 1, duration_seconds: 75, risk: 1, rewards: { experience: 220, stardust: 450, item_rarity_chance: "common" }, level_requirement: 1 },
  { name: "Sensor Calibration Sweep", location: "Relay Buoy Cluster 12", description: "Tap every buoy with a wrench until the network stops screaming in binary. Yes, you are the IT department of deep space. No, there is no help desk.", difficulty: "easy", sector: 1, duration_seconds: 100, risk: 1, rewards: { experience: 280, stardust: 550, item_rarity_chance: "common" }, level_requirement: 1 },
  { name: "Lost Pet Retrieval", location: "Hangar Deck C", description: "Someone's pet void-ferret escaped into the vents. It has twelve eyes, zero manners, and your lunch. Bring gloves. Bring snacks. Bring regret.", difficulty: "easy", sector: 1, duration_seconds: 110, risk: 1, rewards: { experience: 260, stardust: 520, item_rarity_chance: "common" }, level_requirement: 1 },
  { name: "Cantina Tab Collection", location: "Station Corridor 9", description: "Politely remind three patrons that drinks aren't free. One of them is a cyborg. One of them is armed. One of them is both and also your cousin.", difficulty: "easy", sector: 1, duration_seconds: 85, risk: 2, rewards: { experience: 320, stardust: 650, item_rarity_chance: "common" }, level_requirement: 1 },
  { name: "Scrap Yard Sort", location: "Junk Moon Delta", description: "Sort 'valuable salvage' from 'cursed garbage' in a yard that rearranges itself when you blink. Wear boots you don't love.", difficulty: "easy", sector: 1, duration_seconds: 130, risk: 2, rewards: { experience: 380, stardust: 750, item_rarity_chance: "uncommon" }, level_requirement: 1 },
  { name: "Comet Tail Sampling", location: "Approach Vector K-4", description: "Scoop ice from a comet's tail without getting flash-frozen into a motivational poster. The science team wants samples. The science team is very far away.", difficulty: "easy", sector: 1, duration_seconds: 140, risk: 2, rewards: { experience: 420, stardust: 850, item_rarity_chance: "uncommon" }, level_requirement: 1 },
  { name: "Drone Herding Duty", location: "Fabrication Ring", description: "Round up a flock of maintenance drones that developed a personality and a union. They demand better oil. You demand they stop nesting in the airlocks.", difficulty: "medium", sector: 1, duration_seconds: 200, risk: 2, rewards: { experience: 580, stardust: 1150, item_rarity_chance: "uncommon" }, level_requirement: 2 },
  { name: "Static Storm Mapping", location: "Ion Flats", description: "Fly through a lightning field and draw a map that won't fry your console. Your hair will never be the same. Neither will your insurance.", difficulty: "medium", sector: 1, duration_seconds: 220, risk: 2, rewards: { experience: 620, stardust: 1250, item_rarity_chance: "uncommon" }, level_requirement: 2 },
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
  "Astral Warden":    { name: "Cosmic Aegis Blaster",   emoji: "stardust", style: "shoot", flavor: "Radiates protective starlight with every shot." },
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
    if (/blaster|aegis/.test(n)) return "stardust";
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

// Maximum unequipped items a character can hold in the bag (hard limit).
export const INVENTORY_CAP = 10;

/** Hard bag ceiling — unequipped items only. Never exceeds INVENTORY_CAP. */
export function getInventoryCap(character) {
  const base = INVENTORY_CAP;
  try {
    const modBonus = Math.round(getModEffectTotal(character, "inventory_cap_bonus") || 0);
    return base + modBonus;
  } catch {
    return base;
  }
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

function _rollItem(rarity, playerLevel, type, rng, className) {
  const r = rng || Math.random;
  const itemType = type || EQUIPMENT_SLOTS[Math.floor(r() * EQUIPMENT_SLOTS.length)];
  const names = ITEM_NAMES[itemType] || ITEM_NAMES.weapon;
  const baseName = names[Math.floor(r() * names.length)];
  const itemLevel = Math.max(1, playerLevel || 1);
  const { stats } = rollItemStats({ itemLevel, type: itemType, rarity, rng: r, className });

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

// Class signature weapons keep name/flavor/emoji; attribute pool uses the same
// class-aware Common–Epic rules (and class-neutral Legendary) as other gear.
export function generateClassWeapon(className, rarity, playerLevel, rng = Math.random) {
  const w = CLASS_WEAPONS[className] || CLASS_WEAPONS.Vanguard;
  const itemLevel = Math.max(1, playerLevel || 1);
  const { stats } = rollItemStats({ itemLevel, type: "weapon", rarity, rng, className });
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

const CLASS_SIGNATURE_WEAPON_CHANCE = 0.20;

/**
 * @param {string} [playerClass] Player class for Common–Epic 60/40 favored pools.
 *   When omitted, generation stays class-neutral (Total pool only).
 */
export function generateItem(rarity, playerLevel, type, playerClass) {
  // 20% chance for a class-signature weapon skin when rolling a weapon.
  // Skin class may be cosmetic-random; stat pool uses playerClass when provided.
  const rollingWeapon = !type || type === "weapon";
  if (rollingWeapon && Math.random() < CLASS_SIGNATURE_WEAPON_CHANCE) {
    const classKeys = Object.keys(CLASS_WEAPONS);
    const skinClass = playerClass && CLASS_WEAPONS[playerClass]
      ? playerClass
      : classKeys[Math.floor(Math.random() * classKeys.length)];
    // Prefer player class for pool bias; fall back to skin class so bots still bias.
    return generateClassWeapon(playerClass || skinClass, rarity, playerLevel);
  }
  return _rollItem(rarity, playerLevel, type, Math.random, playerClass);
}

// ═══════════════════════════════════════════
// ATTRIBUTE POINTS — Stardust purchases + free permanent attrs on level-up
// ═══════════════════════════════════════════
export const STAT_POINTS_START = 0;
/** Permanent free attributes awarded automatically per level gained (Prompt 04). */
export const STAT_POINTS_PER_LEVEL = 2;

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
 * Authoritative curve: productionMath.attributePurchaseCost (via AttributePurchaseCost).
 */
export function getAttributePointCost(purchaseNumber) {
  return AttributePurchaseCost(purchaseNumber);
}

export const ATTR_STAT_KEYS = ["strength", "agility", "intellect", "vitality", "luck"];

/**
 * Purchases already bought for one attribute (each stat has its own cost curve).
 * Prefers `attribute_purchases_by_stat[stat]`. Missing counters are 0 —
 * do not infer purchases from stats−base (stats also include free-from-level).
 */
export function getAttributePurchaseCount(character, stat) {
  if (!character) return 0;
  if (stat) {
    const by = character.attribute_purchases_by_stat;
    if (by && typeof by[stat] === "number" && Number.isFinite(by[stat])) {
      return Math.max(0, Math.floor(by[stat]));
    }
    return 0;
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

/** Permanent attrs awarded for crossing one level threshold. */
export function getStatPointsForLevel(_level) {
  return STAT_POINTS_PER_LEVEL;
}

/** Total permanent free attrs awarded when leveling from→to (exclusive of from). */
export function getStatPointsForLevelRange(fromLevel, toLevel) {
  const from = Math.max(1, Math.floor(Number(fromLevel) || 1));
  const to = Math.max(from, Math.floor(Number(toLevel) || from));
  return (to - from) * STAT_POINTS_PER_LEVEL;
}

// ═══════════════════════════════════════════
// STARDUST (primary currency — earned via missions, arena, and dissolving gear in the Void)
// ═══════════════════════════════════════════
/** Hard wallet ceiling for character stardust balance. */
/** JS integer safety bound — not a gameplay Stardust wallet cap. */
export const STARDUST_MAX = Number.MAX_SAFE_INTEGER;

export function clampStardust(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return 0;
  return Math.min(STARDUST_MAX, Math.max(0, Math.floor(n)));
}

// LEGACY ECONOMY IMPLEMENTATION — PENDING SYSTEM-SPECIFIC MIGRATION/RECONCILIATION
export const STARDUST_PER_RARITY = {
  common: 8 * XP_STARDUST_SCALE,
  uncommon: 20 * XP_STARDUST_SCALE,
  rare: 50 * XP_STARDUST_SCALE,
  epic: 120 * XP_STARDUST_SCALE,
  legendary: 280 * XP_STARDUST_SCALE,
};

// Gear type weight — re-exported from itemGeneration (weapon/ship modules sell higher).
export { ITEM_SELL_TYPE_WEIGHT as STARDUST_TYPE_WEIGHT } from "@/lib/itemGeneration";
export {
  getFullSetAttributeBudget,
  getItemStatBudget,
  rollItemStats,
  computeItemVendorValue,
} from "@/lib/itemGeneration";

// Stardust yielded by dissolving an item — GearSaleValue (level × rarity × type).
export function computeStardustValue(item) {
  return GearSaleValue(item);
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
// ROTATING SHOP / BLACK MARKET (6h stock; daily hot deal)
// ═══════════════════════════════════════════
const SHOP_GEAR_TYPES = ["weapon", "armor", "helmet", "boots", "legs", "neck", "accessory", "ship_module"];

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Shop window / game-day — re-export client mirrors of server helpers for UI countdowns.
export { getShopWindow, getShopGameDayKey, msUntilNextShopGameDay };

/** Nova cost to reroll a market stall (after free refresh is used). */
export const SHOP_REFRESH_COST = 20;

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
  "Market's honest. My smile isn't.",
  "Come back after midnight — same junk, better stories.",
];

export function getVendorLine(seed = 0) {
  const i = Math.abs(Math.floor(seed)) % VENDOR_LINES.length;
  return VENDOR_LINES[i];
}

/** @deprecated Client mirror only — Node `rollHaggle` is authoritative (Restoration 12A/12C). */
export function rollHaggle(..._args) {
  obsoleteShopClient("rollHaggle");
}

/**
 * @deprecated Obsolete client shop authority (Restoration 12C).
 * Node `economyFormulas.normalizeShopMeta` + EnsureShop own persistence.
 * These stubs throw so stray callers cannot silently diverge.
 */
function obsoleteShopClient(name) {
  throw new Error(
    `Obsolete client ${name} — use Node EnsureShop / server/src/shared/economyFormulas.js (Restoration 12C)`
  );
}

/** @deprecated */
export function normalizeShopMeta(..._args) {
  obsoleteShopClient("normalizeShopMeta");
}

/** @deprecated */
export function shopGearSeed(..._args) {
  obsoleteShopClient("shopGearSeed");
}

/** @deprecated */
export function shopConsSeed(..._args) {
  obsoleteShopClient("shopConsSeed");
}

/**
 * @deprecated Do not use for production stock — Node `generateSimpleShopStock` /
 * EnsureShop is authoritative (Restoration 12A/12C).
 */
export function generateShopInventory(..._args) {
  obsoleteShopClient("generateShopInventory");
}

/** @deprecated Node `generateSimpleHotDeal` is authoritative (Restoration 12A/12C). */
export function generateHotDeal(..._args) {
  obsoleteShopClient("generateHotDeal");
}

/** @deprecated */
export function generateShopConsumableSlots(..._args) {
  obsoleteShopClient("generateShopConsumableSlots");
}

// ═══════════════════════════════════════════
// MISSION GEAR DROP — hit chance (not rarity).
// Base 20%; +2.5% pity per consecutive gear miss; soft-capped at 100%.
// Stim/consumable rolls stay independent. On a miss, claim pays dissolve-value
// stardust for the piece that would have dropped (server-side).
// ═══════════════════════════════════════════
export const MISSION_GEAR_DROP_BASE = MISSION_GEAR_BASE_CHANCE;
export const MISSION_GEAR_PITY_STEP = MISSION_GEAR_PITY_INCREMENT;
export const MISSION_GEAR_DROP_CAP = SE_MISSION_GEAR_DROP_CAP;
export const MISSION_CONSUMABLE_DROP_CHANCE = 0.15;

export function missionGearMissStreak(character) {
  return Math.max(0, Math.floor(Number(character?.mission_gear_miss_streak) || 0));
}

export function missionGearDropChance(missStreak = 0) {
  return seMissionGearDropChance(missStreak);
}

export function rollMissionGearDrop(missStreak = 0, rng = Math.random) {
  return seRollMissionGearDrop(missStreak, rng);
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

const DROP_RATE_PERCENT_TOTAL = 100;

function _rollFromTable(rates) {
  const roll = Math.random() * DROP_RATE_PERCENT_TOTAL;
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

/**
 * XP to next: productionMath.xpToNext (canonical 1:1 units).
 * Historical polynomial / Post-200 constants below are unused by live progression.
 */
export const XP_REQUIREMENT_MULTIPLIER = 1.35;
export const POST_200_START_LEVEL = 200;
export const POST_200_A = 0.8;
export const POST_200_P = 0.48;
export const POST_200_B = 0.79;
export const POST_200_Q = 0.71;

export const XP_GLOBAL_SLOWDOWN = 1.5;
export const EARLY_GAME_XP_START_BONUS = 0.2;
export const EARLY_GAME_XP_TAPER_LEVEL = 100;

const POST_200_LEVEL_INTERVAL = 100;

/** @deprecated Historical — live XPToNext is productionMath.xpToNext. */
export function post200Growth(level) {
  const L = Math.max(1, Math.floor(Number(level) || 1));
  const X = Math.max(0, (L - POST_200_START_LEVEL) / POST_200_LEVEL_INTERVAL);
  return 1 + POST_200_A * X ** POST_200_P + POST_200_B * X ** POST_200_Q;
}

/** @deprecated Historical — live XPToNext is productionMath.xpToNext. */
export function earlyGameXpModifier(level) {
  const L = Math.max(1, Math.floor(Number(level) || 1));
  return 1 + EARLY_GAME_XP_START_BONUS * Math.max(0, 1 - L / EARLY_GAME_XP_TAPER_LEVEL);
}

export function xpToNextBase(level) {
  return xpToNext(level);
}

export function getExpForLevel(level) {
  return xpToNext(level);
}

/** Global mission XP rebalance (applied after XP/Fuel × efficiency; scale already in XP/Fuel). */
export const MISSION_XP_REBALANCE = 0.85;

/** Mission XP/Fuel design formula (pre-scale). Keep in sync with server rewards.js. */
export const XP_PER_FUEL_LINEAR_COEFFICIENT = 0.5;
export const XP_PER_FUEL_POWER_COEFFICIENT = 0.032;
export const XP_PER_FUEL_EXPONENT = 1.67;

export function missionXpPerFuelBase(level = 1) {
  return Math.max(1, roundHalfUp(missionXpPerFuel(level)));
}

/** Mission XP per 1 fuel in canonical units (no ×10). */
export function getMissionXpPerFuel(level = 1) {
  return missionXpPerFuelBase(level);
}

/** Mission stardust per 1 fuel at this level (SD/F). */
export function getMissionStardustPerFuel(level = 1) {
  return StardustPerFuel(level);
}

/** Max stardust casino bet = 50× SD/F; min = 1× SD/F (casino_v2). */
export const CASINO_STARDUST_BET_SD_MULT = 50;
export const CASINO_MAX_STARDUST_BET_CAP = 10_000_000 * XP_STARDUST_SCALE; // legacy Stardust cap, not XP
export const CASINO_MIN_STARDUST_BET_FLOOR = 1;
export const CASINO_MIN_NOVA_BET = 100;
export const CASINO_MAX_NOVA_BET = 1000;

export function getCasinoMinStardustBet(level = 1) {
  return Math.max(1, Math.round(getMissionStardustPerFuel(level)));
}

export function getCasinoMaxStardustBet(level = 1) {
  const sdf = Math.max(1, Math.round(getMissionStardustPerFuel(level)));
  return Math.min(CASINO_MAX_STARDUST_BET_CAP, sdf * CASINO_STARDUST_BET_SD_MULT);
}

/** Stardust wheel tiers — casino_v2 (90% RTP); server is authoritative. */
export const CASINO_WHEEL_TIERS = [
  { id: "lose", p: 0.6, mult: 0, label: "Lose", color: "#6B7280" },
  { id: "shove", p: 0.2, mult: 1, label: "Shove", color: "#9CA3AF" },
  { id: "x2", p: 0.1, mult: 2, label: "2×", color: "#22C55E" },
  { id: "x3", p: 0.05, mult: 3, label: "3×", color: "#3B82F6" },
  { id: "x5", p: 0.03, mult: 5, label: "5×", color: "#A855F7" },
  { id: "x10", p: 0.02, mult: 10, label: "10×", color: "#F59E0B" },
];

/** Arena win Stardust = ARENA_WIN_FUEL_EQUIVALENT × SD/F(playerLevel). */
export function getArenaStardustReward(level = 1) {
  return ArenaWinStardust(level);
}

const ARENA_XP_REWARD_NUMERATOR = 5;
const ARENA_XP_REWARD_DENOMINATOR = 7;
const MISSION_REWARD_VARIANCE = 0.10;
const MISSION_EFFICIENCY_PRECISION_SCALE = 100;
const COMBAT_XP_RELATIVE_MIN = 0.5;
const COMBAT_XP_RELATIVE_MAX = 1.65;
const COMBAT_XP_RELATIVE_BASE = 0.55;
const COMBAT_XP_LEVEL_RATIO_WEIGHT = 0.45;
const COMBAT_XP_BASE_UNITS = 10;
const EARLY_FUEL_DISCOUNT_BRACKETS = Object.freeze([
  Object.freeze({ maxLevel: 2, discount: 3 }),
  Object.freeze({ maxLevel: 4, discount: 2 }),
  Object.freeze({ maxLevel: 7, discount: 1 }),
]);

/** Arena win XP = XP/F(playerLevel) × 5/7 (≈0.714). */
export function getArenaXpReward(level = 1) {
  return Math.max(
    1,
    Math.round(
      (getMissionXpPerFuel(level) * ARENA_XP_REWARD_NUMERATOR)
      / ARENA_XP_REWARD_DENOMINATOR,
    ),
  );
}

/** Mission reward variance band by player level (±fraction around 1.0). */
export function getMissionRewardVariance(_playerLevel = 1) {
  return MISSION_REWARD_VARIANCE;
}

/**
 * Per-mission variance roll — independent for XP and Stardust.
 * Uniform ±10% (0.90–1.10) at every level.
 */
export function rollMissionEfficiency(playerLevel = 1, rng = Math.random) {
  const r = typeof rng === "function" ? rng : Math.random;
  const v = getMissionRewardVariance(playerLevel);
  const raw = (1 - v) + r() * (2 * v);
  return Math.round(raw * MISSION_EFFICIENCY_PRECISION_SCALE)
    / MISSION_EFFICIENCY_PRECISION_SCALE;
}

/** Clamp / default efficiency for the player's variance band. */
export function normalizeMissionEfficiency(value, playerLevel = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  const v = getMissionRewardVariance(playerLevel);
  const rounded = Math.round(n * MISSION_EFFICIENCY_PRECISION_SCALE)
    / MISSION_EFFICIENCY_PRECISION_SCALE;
  return Math.min(1 + v, Math.max(1 - v, rounded));
}

/** Display helper: 1.09 → "+9%", 0.93 → "-7%". */
export function formatEfficiencyPct(efficiency, playerLevel = 1) {
  const pct = Math.round(
    (normalizeMissionEfficiency(efficiency, playerLevel) - 1) * PERCENT_SCALE,
  );
  if (pct === 0) return "±0%";
  return pct > 0 ? `+${pct}%` : `${pct}%`;
}

/**
 * Mission XP = Fuel × Level XP/F × efficiency × MISSION_XP_REBALANCE.
 * Before ship/collection bonuses. getMissionXpPerFuel is canonical 1:1 XP.
 */
export function computeMissionXpFromFuel(fuelCost, level = 1, efficiency = 1) {
  const fuel = Math.max(0, Number(fuelCost) || 0);
  const eff = normalizeMissionEfficiency(efficiency, level);
  return Math.max(
    fuel > 0 ? 1 : 0,
    Math.round(fuel * getMissionXpPerFuel(level) * eff * MISSION_XP_REBALANCE)
  );
}

/**
 * Mission Stardust = Fuel × Level SD/F (no efficiency variance).
 * Before ship/nexus bonuses.
 */
export function computeMissionStardustFromFuel(fuelCost, level = 1, _efficiency = 1) {
  return MissionStardustReward(level, fuelCost);
}

/**
 * Mission junk trinket vendor/dissolve value.
 * Prefer passing missionStardustReward; level-only callers use stardustEconomy back-compat
 * (JunkSaleValue(MissionStardustReward(level, 1))).
 */
export function computeMissionJunkSellValue(missionStardustOrLevel = 1, maybeFuel) {
  return seComputeMissionJunkSellValue(missionStardustOrLevel, maybeFuel);
}

/**
 * Scale flat XP grants (dailies/promos) with the XP/fuel chart.
 * Matches server `shared/rewards.js` so UI previews stay honest.
 */
export function scaleXpReward(baseXp, level = 1) {
  const base = Math.max(0, Number(baseXp) || 0);
  const rate = getMissionXpPerFuel(level);
  const atOne = getMissionXpPerFuel(1);
  return Math.max(base > 0 ? 1 : 0, Math.round(base * (rate / atOne)));
}

/**
 * Combat/frontier XP helper (later-phase). COMBAT_XP_BASE_UNITS matches design
 * mission_xpf(1)=10 so baseXp is L1 fuel-minutes. Not XP_STARDUST_SCALE and
 * not an XP storage conversion.
 */
export function scaleCombatXp(baseXp, playerLevel = 1, contentLevel = 1) {
  const pl = Math.max(1, playerLevel || 1);
  const cl = Math.max(1, contentLevel || 1);
  const relative = Math.max(
    COMBAT_XP_RELATIVE_MIN,
    Math.min(
      COMBAT_XP_RELATIVE_MAX,
      COMBAT_XP_RELATIVE_BASE + COMBAT_XP_LEVEL_RATIO_WEIGHT * (pl / cl),
    ),
  );
  const fuelEquiv = (Number(baseXp) || 0) / COMBAT_XP_BASE_UNITS;
  return Math.max(1, Math.round(fuelEquiv * getMissionXpPerFuel(pl) * relative));
}

/** @deprecated Prefer getMissionXpPerFuel / computeMissionXpFromFuel. */
export function getEarlyXpMultiplier(_level = 1) {
  return 1;
}

export function getEarlyFuelDiscount(level = 1) {
  const l = Math.max(1, level || 1);
  const bracket = EARLY_FUEL_DISCOUNT_BRACKETS.find(({ maxLevel }) => l <= maxLevel);
  if (bracket) return bracket.discount;
  return 0;
}

// ═══════════════════════════════════════════
// CURRENCY COLORS (icons, labels, costs)
// ═══════════════════════════════════════════
export const FUEL_COLOR = "#39FF14";
/** Neon purple — stardust icons, labels, and costs. */
export const STARDUST_COLOR = "#E879F9";
/** Plain-text stand-in for toasts / notifications (no emoji sparkles). */
export const STARDUST_GLYPH = "✦";
/** Neon cyan — XP labels, bars, and reward panes (matches Arena experience). */
export const XP_COLOR = "#00E5FF";

// ═══════════════════════════════════════════
// FUEL (mission energy)
// ═══════════════════════════════════════════
export const FUEL_MAX = 100;
// Fuel is a flat pool that refills to full every 24h (no per-minute regen).
export const FUEL_CYCLE_MS = HOURS_PER_DAY * MILLISECONDS_PER_HOUR;
export const FUEL_PURCHASE_AMOUNT = 20;
export const FUEL_PURCHASE_COST = 20; // nova crystals (display)
export const FUEL_PURCHASE_MAX = 10; // per 24h cycle (200 fuel total)
/** Smallest chargeable fuel unit (L1 short jobs = 15s = 0.25 fuel). */
export const MISSION_MIN_FUEL = MISSION_DURATION_MIN_FUEL;

/** Canonical 2-decimal fuel value for comparisons and display. */
export function normalizeFuelAmount(n) {
  return Math.round((Number(n) || 0) * FUEL_PRECISION_SCALE) / FUEL_PRECISION_SCALE;
}

/** Display fuel with up to 2 decimals — matches cantina / mission UI. */
export function formatFuelAmount(n) {
  const v = normalizeFuelAmount(n);
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

/** Snap Nova to the nearest 0.5 (smallest spend unit). */
export function snapNovaDisplay(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return 0;
  return Math.round(v * NOVA_HALF_UNIT_SCALE) / NOVA_HALF_UNIT_SCALE;
}

/**
 * Character.nova_crystals may be half-units (economy_nova_scale === 2) or display.
 * Prefer nova_display / split display fields when present.
 */
export function novaDisplayFromCharacter(character) {
  if (!character) return 0;
  if (character.nova_display != null && character.nova_display !== "") {
    return snapNovaDisplay(character.nova_display);
  }
  if (character.nova_wagerable != null || character.nova_promotional != null) {
    return snapNovaDisplay(
      (Number(character.nova_wagerable) || 0) + (Number(character.nova_promotional) || 0)
    );
  }
  const raw = Number(character.nova_crystals) || 0;
  if (Number(character.economy_nova_scale) === NOVA_HALF_UNIT_SCALE) {
    return snapNovaDisplay(raw / NOVA_HALF_UNIT_SCALE);
  }
  return snapNovaDisplay(raw);
}

export function formatNovaAmount(n) {
  const v = snapNovaDisplay(n);
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

export function computeFuelCost(template) {
  // 1 fuel = 1 minute of mission time (15s = 0.25, 30s = 0.5, 60s = 1, etc.)
  const durationSeconds = Math.floor(template.duration_seconds || MISSION_SECONDS_PER_FUEL);
  return Math.round(
    (durationSeconds / MISSION_SECONDS_PER_FUEL) * FUEL_PRECISION_SCALE,
  ) / FUEL_PRECISION_SCALE;
}

// The actual fuel that will be deducted at launch — applies ship-mod reductions,
// the early-game fuel discount, and the 0.5 minimum floor. Use this everywhere
// a fuel cost is displayed so it matches the actual deduction.
export function getEffectiveFuelCost(character, mission) {
  // Residual / explicit fuel missions pin their cost so low-fuel offers stay runnable.
  if (typeof mission?.fuel_cost === "number") {
    return Math.max(
      MISSION_MIN_FUEL,
      Math.round(mission.fuel_cost * FUEL_PRECISION_SCALE) / FUEL_PRECISION_SCALE,
    );
  }
  // Fuel is charged per minute of the ACTUAL (effective) mission time, so it
  // matches the duration shown after warp/fuel-mount reductions.
  const effectiveSeconds = getEffectiveMissionDuration(character, mission);
  const raw = effectiveSeconds / MISSION_SECONDS_PER_FUEL
    - getModEffectTotal(character, "fuel_cost_reduction");
  return Math.max(
    MISSION_MIN_FUEL,
    Math.round(raw * FUEL_PRECISION_SCALE) / FUEL_PRECISION_SCALE,
  );
}

// Returns a patch refilling fuel to max once the 24h cycle elapses, else null.
export function checkFuelReset(character) {
  const max = character.max_fuel || FUEL_MAX;
  const resetAt = character.fuel_reset_at ? new Date(character.fuel_reset_at) : null;
  const now = Date.now();
  const fuelVal = Number(character.fuel);
  const fuelMissing = character.fuel == null || !Number.isFinite(fuelVal);
  if (fuelMissing || !resetAt || now - resetAt.getTime() >= FUEL_CYCLE_MS) {
    return { fuel: max, max_fuel: max, fuel_reset_at: new Date(now).toISOString(), fuel_purchases: 0 };
  }
  return null;
}

// Client-side mission-offer generation (QUEST_GIVERS, pickQuestGiver,
// generateDailyMissions, generateLowFuelMission, generateLowFuelBoard) has been
// removed. The Node API is the sole authority for mission offers — see the
// mission board in server/src/functions/economy.js.

// ═══════════════════════════════════════════
// CONSUMABLES — Stim qualities (Uncommon / Rare / Epic).
// Stored as items of type "consumable"; using one adds an entry to
// character.active_buffs { stat, mult, expires_at, name, rarity, stacks, duration_hours }.
// Bonus is applied as a final multiplier on pre-stim attribute totals.
// ═══════════════════════════════════════════
export const CONSUMABLE_TIERS = {
  uncommon: { mult: 0.05, duration_hours: 6,  label: "Uncommon", rarity: "uncommon", cost: 800,  sell_value: 250 },
  rare:     { mult: 0.10, duration_hours: 12, label: "Rare",     rarity: "rare",     cost: 2200, sell_value: 600 },
  epic:     { mult: 0.20, duration_hours: 24, label: "Epic",     rarity: "epic",     cost: 5000, sell_value: 1200 },
};

export const STIM_RARITY_RANK = { uncommon: 1, rare: 2, epic: 3 };

// Maximum times a stim's duration can be extended by stacking the same stim.
export const MAX_BUFF_STACKS = 3;
// Maximum distinct attributes that can be stimulated simultaneously.
export const MAX_ACTIVE_STAT_TYPES = 3;
export const STIM_YEARN_MESSAGE = "Your character doesn't yearn for more yet.";

const CONSUMABLE_STATS = ["strength", "agility", "intellect", "vitality", "luck"];
const EPIC_STIM_ROLL_THRESHOLD = 0.85;
const RARE_STIM_ROLL_THRESHOLD = 0.55;
const STIM_REFRESH_BASE_DURATION_SHARE = 0.5;

export const CONSUMABLES = Object.entries(CONSUMABLE_TIERS).flatMap(([tierKey, tier]) =>
  CONSUMABLE_STATS.map((stat) => ({
    name: `${tier.label} ${stat.charAt(0).toUpperCase() + stat.slice(1)} Stim`,
    type: "consumable",
    rarity: tier.rarity,
    level_requirement: 1,
    stats: {},
    consumable: { stat, mult: tier.mult, duration_hours: tier.duration_hours, tier: tierKey },
    sell_value: tier.sell_value,
    flavor_text: `Boosts ${stat} by ${Math.round(tier.mult * PERCENT_SCALE)}% for ${tier.duration_hours} hours (stacks duration up to ${tier.duration_hours * MAX_BUFF_STACKS}h).`,
    is_equipped: false,
    _cost: tier.cost,
  }))
);

export function consumableItem(def) {
  const { _cost, _slotId, ...rest } = def;
  return rest;
}

/** Weighted pick among Uncommon / Rare / Epic (no Common or Legendary). */
export function randomConsumable(rng = Math.random) {
  const roll = typeof rng === "function" ? rng() : Math.random();
  let rarity = "uncommon";
  if (roll >= EPIC_STIM_ROLL_THRESHOLD) rarity = "epic";
  else if (roll >= RARE_STIM_ROLL_THRESHOLD) rarity = "rare";
  const pool = CONSUMABLES.filter((c) => c.rarity === rarity);
  const pickRng = typeof rng === "function" ? rng() : Math.random();
  return pool[Math.floor(pickRng * pool.length)] || CONSUMABLES[0];
}

export function getActiveBuffs(character, nowMs = Date.now()) {
  const now = Number(nowMs) || Date.now();
  return (character?.active_buffs || []).filter((b) => {
    if (!b || !(new Date(b.expires_at).getTime() > now)) return false;
    const stat = String(b.stat || "").toLowerCase();
    // Single-attribute stims only — legacy "all" buffs are ignored.
    return CONSUMABLE_STATS.includes(stat);
  });
}

/** Apply Stim multipliers to already-complete pre-stim attribute totals. */
export function applyBuffs(stats, buffs) {
  const out = { ...(stats || {}) };
  for (const b of buffs || []) {
    const stat = String(b?.stat || "").toLowerCase();
    if (!CONSUMABLE_STATS.includes(stat)) continue;
    out[stat] = Math.round((out[stat] || 0) * (1 + (b.mult || 0)));
  }
  return out;
}

export function resolveStimRarity(source) {
  const raw = source?.rarity || source?.consumable?.tier || source?.tier || null;
  if (raw && STIM_RARITY_RANK[raw] != null) return raw;
  if (raw === "common" || raw === "minor") return "uncommon";
  if (raw === "legendary" || raw === "mythic" || raw === "prime") return "epic";
  const mult = Number(source?.mult ?? source?.consumable?.mult ?? 0);
  if (mult >= CONSUMABLE_TIERS.epic.mult) return "epic";
  if (mult >= CONSUMABLE_TIERS.rare.mult) return "rare";
  if (mult > 0) return "uncommon";
  return "uncommon";
}

export function stimRarityRank(rarity) {
  return STIM_RARITY_RANK[rarity] ?? 0;
}

export function stimMaxDurationMs(durationHours) {
  return Math.max(0, Number(durationHours) || 0) * MILLISECONDS_PER_HOUR * MAX_BUFF_STACKS;
}

export function stimRefreshRemainingMs(durationHours) {
  const base = Math.max(0, Number(durationHours) || 0) * MILLISECONDS_PER_HOUR;
  return stimMaxDurationMs(durationHours) - base * STIM_REFRESH_BASE_DURATION_SHARE;
}

function inferStimStacks(remainingMs, baseMs) {
  if (baseMs <= 0) return 1;
  return Math.min(MAX_BUFF_STACKS, Math.max(1, Math.ceil(remainingMs / baseMs)));
}

function makeStimBuff({ stat, mult, name, rarity, durationHours, stacks, expiresAt }) {
  return {
    stat,
    mult,
    name,
    rarity,
    duration_hours: durationHours,
    stacks,
    expires_at: new Date(expiresAt).toISOString(),
  };
}

/**
 * Validate + compute next active_buffs for a Stim use.
 * Caller must only remove the inventory item when ok === true.
 */
export function prepareConsumableBuffs(character, item, sourceBuffs, nowMs = Date.now()) {
  if (!character || item?.type !== "consumable" || !item.consumable) {
    return { ok: false, reason: "Not a stim." };
  }
  // Stim Trio bundles are retired.
  if (item._bundle === "stim_trio" || item.consumable?.tier === "bundle") {
    return { ok: false, reason: "Stim Trios are no longer available." };
  }

  const now = Number(nowMs) || Date.now();
  const stat = String(item.consumable.stat || "").toLowerCase();
  const VALID = ["strength", "agility", "intellect", "vitality", "luck"];
  if (!VALID.includes(stat)) {
    return { ok: false, reason: "Invalid Stim attribute." };
  }

  const rarity = resolveStimRarity(item);
  const tier = CONSUMABLE_TIERS[rarity];
  if (!tier || STIM_RARITY_RANK[rarity] == null) {
    return { ok: false, reason: "Invalid Stim rarity." };
  }
  // Authoritative mechanics — never trust item.consumable.mult / duration_hours.
  const durationHours = tier.duration_hours;
  const mult = tier.mult;
  const baseMs = durationHours * MILLISECONDS_PER_HOUR;
  const maxMs = baseMs * MAX_BUFF_STACKS;
  const refreshAt = maxMs - baseMs * STIM_REFRESH_BASE_DURATION_SHARE;

  const source = sourceBuffs ?? character.active_buffs ?? [];
  const active = (source || []).filter((b) => new Date(b.expires_at).getTime() > now);
  const sameStatIdx = active.findIndex((b) => b.stat === stat);

  if (sameStatIdx < 0) {
    if (new Set(active.map((b) => b.stat)).size >= MAX_ACTIVE_STAT_TYPES) {
      return {
        ok: false,
        reason: `You already have ${MAX_ACTIVE_STAT_TYPES} active Stim effects. Remove one first.`,
      };
    }
    return {
      ok: true,
      buffs: [
        ...active,
        makeStimBuff({
          stat,
          mult,
          name: item.name,
          rarity,
          durationHours,
          stacks: 1,
          expiresAt: now + baseMs,
        }),
      ],
    };
  }

  const existing = active[sameStatIdx];
  const existingRarity = resolveStimRarity(existing);
  const inRank = stimRarityRank(rarity);
  const exRank = stimRarityRank(existingRarity);

  if (inRank < exRank) {
    return {
      ok: false,
      reason: `A stronger ${stat} Stim is already active. Remove it first to use a lower quality.`,
    };
  }

  const buffs = [...active];

  if (inRank > exRank) {
    buffs[sameStatIdx] = makeStimBuff({
      stat,
      mult,
      name: item.name,
      rarity,
      durationHours,
      stacks: 1,
      expiresAt: now + baseMs,
    });
    return { ok: true, buffs };
  }

  const remaining = Math.max(0, new Date(existing.expires_at).getTime() - now);
  let stacks = Number(existing.stacks);
  if (!Number.isFinite(stacks) || stacks < 1) {
    stacks = inferStimStacks(remaining, baseMs);
  }
  stacks = Math.min(MAX_BUFF_STACKS, Math.max(1, Math.floor(stacks)));

  if (stacks >= MAX_BUFF_STACKS) {
    if (remaining > refreshAt) {
      return { ok: false, reason: STIM_YEARN_MESSAGE };
    }
    buffs[sameStatIdx] = makeStimBuff({
      stat,
      mult,
      name: item.name,
      rarity,
      durationHours,
      stacks: MAX_BUFF_STACKS,
      expiresAt: now + maxMs,
    });
    return { ok: true, buffs };
  }

  const newRemaining = Math.min(remaining + baseMs, maxMs);
  buffs[sameStatIdx] = makeStimBuff({
    stat,
    mult,
    name: item.name,
    rarity,
    durationHours,
    stacks: Math.min(MAX_BUFF_STACKS, stacks + 1),
    expiresAt: now + newRemaining,
  });
  return { ok: true, buffs };
}

export function dismissActiveBuff(character, { stat, expires_at, name } = {}, nowMs = Date.now()) {
  const now = Number(nowMs) || Date.now();
  if (!stat) return { ok: false, reason: "Missing stat" };
  const source = character?.active_buffs || [];
  const next = source.filter((b) => {
    if (b.stat !== stat) return true;
    if (expires_at && b.expires_at !== expires_at) return true;
    if (name && b.name !== name) return true;
    return false;
  });
  return { ok: true, buffs: next.filter((b) => new Date(b.expires_at).getTime() > now) };
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

/** Attribute emoji labels for text/chip UIs. Prefer `<StatIcon stat={…} />` for badge art. */
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
      { id: "fuel_tank_1", cost: 2000, max_fuel_bonus: 2 },
      { id: "fuel_tank_2", cost: 4500, max_fuel_bonus: 2 },
      { id: "fuel_tank_3", cost: 8000, max_fuel_bonus: 2 },
      { id: "fuel_tank_4", cost: 12500, max_fuel_bonus: 2 },
      { id: "fuel_tank_5", cost: 18000, max_fuel_bonus: 2 },
      { id: "fuel_tank_6", cost: 25000, max_fuel_bonus: 2 },
      { id: "fuel_tank_7", cost: 34000, max_fuel_bonus: 2 },
      { id: "fuel_tank_8", cost: 45000, max_fuel_bonus: 2 },
      { id: "fuel_tank_9", cost: 56000, max_fuel_bonus: 2 },
      { id: "fuel_tank_10", cost: 68000, max_fuel_bonus: 2 },
    ],
  },
  fuel_efficiency: {
    name: "Fuel Injector Tune",
    emoji: "🔧",
    category: "Propulsion",
    desc: "Optimises combustion so every launch burns less fuel.",
    tiers: [
      { id: "fuel_efficiency_1", cost: 3500, fuel_cost_reduction: 1 },
      { id: "fuel_efficiency_2", cost: 7000, fuel_cost_reduction: 1 },
      { id: "fuel_efficiency_3", cost: 11000, fuel_cost_reduction: 1 },
      { id: "fuel_efficiency_4", cost: 16000, fuel_cost_reduction: 1 },
      { id: "fuel_efficiency_5", cost: 22000, fuel_cost_reduction: 1 },
      { id: "fuel_efficiency_6", cost: 29000, fuel_cost_reduction: 1 },
      { id: "fuel_efficiency_7", cost: 37000, fuel_cost_reduction: 1 },
      { id: "fuel_efficiency_8", cost: 46000, fuel_cost_reduction: 1 },
      { id: "fuel_efficiency_9", cost: 56000, fuel_cost_reduction: 1 },
      { id: "fuel_efficiency_10", cost: 68000, fuel_cost_reduction: 1 },
    ],
  },
  warp_drive: {
    name: "Warp Drive",
    emoji: "🌀",
    category: "Propulsion",
    desc: "Folds space to shorten every mission's travel time.",
    tiers: [
      { id: "warp_drive_1", cost: 5000, mission_duration_reduction: 0.005 },
      { id: "warp_drive_2", cost: 9500, mission_duration_reduction: 0.005 },
      { id: "warp_drive_3", cost: 14500, mission_duration_reduction: 0.005 },
      { id: "warp_drive_4", cost: 20000, mission_duration_reduction: 0.005 },
      { id: "warp_drive_5", cost: 26000, mission_duration_reduction: 0.005 },
      { id: "warp_drive_6", cost: 33000, mission_duration_reduction: 0.005 },
      { id: "warp_drive_7", cost: 41000, mission_duration_reduction: 0.005 },
      { id: "warp_drive_8", cost: 50000, mission_duration_reduction: 0.005 },
      { id: "warp_drive_9", cost: 60000, mission_duration_reduction: 0.005 },
      { id: "warp_drive_10", cost: 71000, mission_duration_reduction: 0.005 },
    ],
  },
  stardust_magnet: {
    name: "Stardust Magnet",
    emoji: "🧲",
    category: "Harvesting",
    desc: "Magnetic hull plating draws extra stardust from mission rewards.",
    tiers: [
      { id: "stardust_magnet_1", cost: 3000, mission_stardust_mult: 0.005 },
      { id: "stardust_magnet_2", cost: 6500, mission_stardust_mult: 0.005 },
      { id: "stardust_magnet_3", cost: 10500, mission_stardust_mult: 0.005 },
      { id: "stardust_magnet_4", cost: 15000, mission_stardust_mult: 0.005 },
      { id: "stardust_magnet_5", cost: 20000, mission_stardust_mult: 0.005 },
      { id: "stardust_magnet_6", cost: 25500, mission_stardust_mult: 0.005 },
      { id: "stardust_magnet_7", cost: 31500, mission_stardust_mult: 0.005 },
      { id: "stardust_magnet_8", cost: 38000, mission_stardust_mult: 0.005 },
      { id: "stardust_magnet_9", cost: 45000, mission_stardust_mult: 0.005 },
      { id: "stardust_magnet_10", cost: 53000, mission_stardust_mult: 0.005 },
    ],
  },
  neural_accel: {
    name: "Neural Accelerator",
    emoji: "🧠",
    category: "Computing",
    desc: "Boosts your shipboard AI for faster combat learning and XP gain.",
    tiers: [
      { id: "neural_accel_1", cost: 4000, mission_xp_mult: 0.005 },
      { id: "neural_accel_2", cost: 8000, mission_xp_mult: 0.005 },
      { id: "neural_accel_3", cost: 12500, mission_xp_mult: 0.005 },
      { id: "neural_accel_4", cost: 17500, mission_xp_mult: 0.005 },
      { id: "neural_accel_5", cost: 23000, mission_xp_mult: 0.005 },
      { id: "neural_accel_6", cost: 29000, mission_xp_mult: 0.005 },
      { id: "neural_accel_7", cost: 35500, mission_xp_mult: 0.005 },
      { id: "neural_accel_8", cost: 42500, mission_xp_mult: 0.005 },
      { id: "neural_accel_9", cost: 50000, mission_xp_mult: 0.005 },
      { id: "neural_accel_10", cost: 58000, mission_xp_mult: 0.005 },
    ],
  },
  cargo_hold: {
    name: "Cargo Hold",
    emoji: "📦",
    category: "Storage",
    desc: "Expands your cargo bay so you can carry more gear before your inventory fills.",
    tiers: [
      { id: "cargo_hold_1", cost: 6000, inventory_cap_bonus: 1 },
      { id: "cargo_hold_2", cost: 12000, inventory_cap_bonus: 1 },
      { id: "cargo_hold_3", cost: 19000, inventory_cap_bonus: 1 },
      { id: "cargo_hold_4", cost: 27000, inventory_cap_bonus: 1 },
      { id: "cargo_hold_5", cost: 36000, inventory_cap_bonus: 1 },
      { id: "cargo_hold_6", cost: 46000, inventory_cap_bonus: 1 },
      { id: "cargo_hold_7", cost: 57000, inventory_cap_bonus: 1 },
      { id: "cargo_hold_8", cost: 69000, inventory_cap_bonus: 1 },
      { id: "cargo_hold_9", cost: 82000, inventory_cap_bonus: 1 },
      { id: "cargo_hold_10", cost: 96000, inventory_cap_bonus: 1 },
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
    name: "Storm Frigate", emoji: "🚀", cost: 50000, unlock_level: 50,
    desc: "Military-grade frigate with reinforced hull plating and salvage magnets.",
    inherent: { mission_stardust_mult: 0.05 },
    upgrade_mult: SHIP_UPGRADE_STEP,
    cost_mult: SHIP_COST_STEP,
  },
  cruiser: {
    name: "Galaxy Cruiser", emoji: "🛳️", cost: 150000, unlock_level: 100,
    desc: "Long-range endurance cruiser with an overcharged AI core.",
    inherent: { mission_xp_mult: 0.05, mission_duration_reduction: 0.03 },
    upgrade_mult: SHIP_UPGRADE_STEP ** 2,
    cost_mult: SHIP_COST_STEP ** 2,
  },
  dreadnought: {
    name: "Void Dreadnought", emoji: "🛸", cost: 400000, unlock_level: 200,
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
  if (!isShipHangarEnabled()) return 0;
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
  if (inh.mission_stardust_mult) parts.push(`+${Math.round(inh.mission_stardust_mult * PERCENT_SCALE)}% Stardust`);
  if (inh.mission_xp_mult) parts.push(`+${Math.round(inh.mission_xp_mult * PERCENT_SCALE)}% XP`);
  if (inh.mission_duration_reduction) parts.push(`-${Math.round(inh.mission_duration_reduction * PERCENT_SCALE)}% Time`);
  if (inh.fuel_cost_reduction) parts.push(`-${inh.fuel_cost_reduction} Fuel`);
  const mult = ship?.upgrade_mult;
  if (mult && mult > 1) parts.push(`+${Math.round((mult - 1) * PERCENT_SCALE)}% Upgrade Power`);
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
  const fmtPct = (v) => (v * PERCENT_SCALE)
    .toFixed(PERCENT_DISPLAY_DECIMAL_PLACES)
    .replace(/\.0$/, "");
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
  const fmtPct = (v) => (v * PERCENT_SCALE)
    .toFixed(PERCENT_DISPLAY_DECIMAL_PLACES)
    .replace(/\.0$/, "");
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
