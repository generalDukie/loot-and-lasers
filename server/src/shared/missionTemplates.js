/**
 * Authoritative Cantina mission-board content.
 *
 * These templates/patrons/collectibles were previously owned by the Godot client
 * (Scripts/MissionBoard.gd). They are mirrored here verbatim so Node can generate
 * the mission board and remain the single source of truth for gameplay-relevant
 * values (duration, efficiency, previews). The client renders whatever Node returns.
 *
 * NOTE: content is intentionally identical to the previous Godot tables — this is an
 * authority/consolidation move, not a balance or copy change.
 */

/** 0-based indices into the mission-explore art pool (6 images). */
export const EXPLORE_SCENE_COUNT = 6;

/** Loot-type label pool used for the "possible loot" preview + LaunchMission snapshot. */
export const MISSION_LOOT_TYPES = [
  "weapon",
  "armor",
  "helmet",
  "boots",
  "legs",
  "neck",
  "accessory",
  "ship_module",
];

export const MISSION_TEMPLATES = [
  {
    name: "Patrol the Rimward Sector",
    location: "Nebula Station Alpha",
    description:
      "Stroll the rim like you own the place. Mostly squinting at blips that are, statistically, 99% space geese.",
    sector: 1,
    level_requirement: 1,
  },
  {
    name: "Salvage Run: Derelict Freighter",
    location: "Wreck of the ISS Meridian",
    description:
      "The ISS Meridian went quiet forty years ago. The cargo? Still there. Bring a crowbar.",
    sector: 1,
    level_requirement: 1,
  },
  {
    name: "Contraband Dash",
    location: "Keldris Reach",
    description:
      "Move some 'perfectly legal' cargo past a patrol. The agricultural supplies are humming.",
    sector: 1,
    level_requirement: 1,
  },
  {
    name: "Mail Run: Express Capsule",
    location: "Orbital Post Hub",
    description:
      "Deliver a sealed capsule that ticks when you shake it. Definitely not a bomb.",
    sector: 1,
    level_requirement: 1,
  },
  {
    name: "Sensor Calibration Sweep",
    location: "Relay Buoy Cluster 12",
    description:
      "Tap every buoy with a wrench until the network stops screaming in binary.",
    sector: 1,
    level_requirement: 1,
  },
  {
    name: "Asteroid Mining Operation",
    location: "Kelvari Belt",
    description: "Smack glowing space rocks until they confess their secrets.",
    sector: 1,
    level_requirement: 2,
  },
  {
    name: "Black Market Buy",
    location: "The Bazaar of Torment",
    description: "Meet a contact named Gary who insists on being called The Whisper.",
    sector: 1,
    level_requirement: 2,
  },
  {
    name: "Xeno-Archaeological Dig",
    location: "Planet Ashara IV",
    description:
      "Dig up ruins older than your grandpa's password. The whispering is probably fine.",
    sector: 2,
    level_requirement: 3,
  },
  {
    name: "Escort the Diplomat",
    location: "Luminae Homeworld",
    description:
      "Walk Ambassador Zyr'tal through hostile territory. Do not let him order the seafood.",
    sector: 2,
    level_requirement: 4,
  },
  {
    name: "Infiltrate Pirate Stronghold",
    location: "Shadow Station Omega",
    description: "Disable their shields and try not to become someone's new parrot.",
    sector: 3,
    level_requirement: 5,
  },
];

export const LOW_FUEL_TEMPLATES = [
  {
    name: "Quick Salvage Sweep",
    description: "A fast burn through nearby debris — light on fuel, light on glory.",
    location: "Drift Sector 7",
  },
  {
    name: "Scavenge the Dock Lights",
    description: "Pop a few broken bay lamps for scrap wire. Tiny job, tiny tank.",
    location: "Hangar Rim",
  },
  {
    name: "Courier Hop: One Parcel",
    description: "Drop a sealed envelope two decks over. The recipient tips in dust. Barely.",
    location: "Station Corridor 3",
  },
];

export const MISSION_PATRONS = [
  { emoji: "👽", name: "Zyx", color: "#9D5CFF" },
  { emoji: "🤖", name: "CLANK", color: "#00E5FF" },
  { emoji: "👺", name: "Grimjaw", color: "#FF4D6D" },
  { emoji: "🥸", name: "Maskara", color: "#E879F9" },
  { emoji: "🤠", name: "Deputy Jax", color: "#F59E0B" },
  { emoji: "🐵", name: "Noko", color: "#D97706" },
  { emoji: "🐸", name: "Boggs", color: "#22C55E" },
  { emoji: "🦊", name: "Vix", color: "#FF9E4F" },
  { emoji: "👹", name: "Karn", color: "#EF4444" },
];

export const MISSION_COLLECTIBLES = [
  { name: "Void Geode", emoji: "🪨" },
  { name: "Star Fragment", emoji: "⭐" },
  { name: "Memory Crystal", emoji: "💠" },
  { name: "Stardust Cluster", emoji: "stardust" },
];

export function exploreImageId(sceneIndex) {
  const idx = Math.floor(Number(sceneIndex));
  if (!Number.isFinite(idx) || idx < 0) return "";
  const n = ((idx % EXPLORE_SCENE_COUNT) + EXPLORE_SCENE_COUNT) % EXPLORE_SCENE_COUNT;
  return `mission_explore_${String(n + 1).padStart(2, "0")}`;
}

/** Fisher–Yates shuffle in place using the provided rng ([0,1)). */
export function shuffleInPlace(arr, rng = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor((typeof rng === "function" ? rng() : Math.random()) * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

/** Unique explore-art indices for a board (no duplicates when count ≤ pool size). */
export function pickExploreScenes(count, rng = Math.random) {
  const pool = [];
  for (let i = 0; i < EXPLORE_SCENE_COUNT; i++) pool.push(i);
  shuffleInPlace(pool, rng);
  const out = [];
  for (let i = 0; i < Math.max(0, count); i++) out.push(pool[i % pool.length]);
  return out;
}

/** Authoritative loot-type label for a mission name (matches LaunchMission snapshot). */
export function missionLootTypeFromName(name) {
  return MISSION_LOOT_TYPES[String(name || "").length % MISSION_LOOT_TYPES.length];
}
