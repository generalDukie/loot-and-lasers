// Registry of built-in hub buttons (defaults) + helpers shared by the hub and editor.

export const BUILTIN_BUTTONS = [
  {
    id: "cantina",
    type: "split",
    label: "Cantina",
    icon: "🍺",
    color: "#FF9E4F",
    desc: "Accept missions & bounties",
    options: [
      { label: "Missions", icon: "🍺", to: "/missions", color: "#FF9E4F" },
      { label: "Casino", icon: "🎰", to: "/casino", color: "#F59E0B" },
    ],
  },
  {
    id: "hero_ship",
    type: "split",
    label: "Hero / Ship Hangar",
    icon: "🛋️",
    color: "#5CFFB0",
    desc: "Your hero & vessel",
    options: [
      { label: "Hero", icon: "🦸", to: "/character", color: "#5CFFB0" },
      { label: "Ship Hangar", icon: "🚀", to: "/ship", color: "#FFD700" },
    ],
  },
  {
    id: "social",
    type: "split",
    label: "Social",
    icon: "💬",
    color: "#FFD700",
    desc: "Stay connected",
    options: [
      { label: "Mail", icon: "📬", to: "/mail", color: "#F87171" },
      { label: "Friends", icon: "👥", to: "/friends", color: "#34D399" },
      { label: "Guild", icon: "🏛️", to: "/guild", color: "#9D5CFF" },
      { label: "Messages", icon: "✉️", to: "/messages", color: "#38BDF8" },
    ],
  },
  {
    id: "galactic_frontier",
    type: "side",
    label: "Galactic Frontier",
    icon: "🧭",
    color: "#00E5FF",
    desc: "Explore the galaxy",
    options: [{ label: "Galactic Frontier", icon: "🧭", to: "/galaxy-map", color: "#00E5FF" }],
  },
  {
    id: "command_hub",
    type: "side",
    label: "Command Hub",
    icon: "⚙️",
    color: "#8BE8FF",
    desc: "Settings & inbox",
    options: [{ label: "Command Hub", icon: "⚙️", to: "/settings", color: "#8BE8FF" }],
  },
  {
    id: "bazaar",
    type: "split",
    label: "Bazaar",
    icon: "🛍️",
    color: "#9D6BFF",
    desc: "Black Market, mine & risk it all",
    options: [
      { label: "Black Market", icon: "🛒", to: "/shop", color: "#4ADE80" },
      { label: "Mining", icon: "⛏️", to: "/space-mining", color: "#60A5FA" },
      { label: "Crystals", icon: "💎", to: "/crystal-store", color: "#FFD700" },
      { label: "Void", icon: "🌀", to: "/black-hole", color: "#9D6BFF" },
    ],
  },
  {
    id: "arena",
    type: "split",
    label: "Arena",
    icon: "⚔️",
    color: "#FF4D6D",
    desc: "Test your might in PvP",
    options: [
      { label: "Arena", icon: "⚔️", to: "/arena", color: "#FF4D6D" },
      { label: "Leaderboard", icon: "🏆", to: "/leaderboard", color: "#FBBF24" },
    ],
  },
  {
    id: "casino",
    type: "side",
    label: "Casino",
    icon: "🎰",
    color: "#F59E0B",
    desc: "Risk your stardust",
    options: [{ label: "Casino", icon: "🎰", to: "/casino", color: "#F59E0B" }],
  },
];

// Width per custom-button size (literals so Tailwind keeps them).
export const BTN_SIZE_W = { sm: "w-32", md: "w-40", lg: "w-52" };

export function getBuiltin(id) {
  return BUILTIN_BUTTONS.find((b) => b.id === id);
}

// Merge a built-in default with a stored override (override wins; options replaced
// wholesale only when the override provides a non-empty array).
export function mergeBuiltin(def, override) {
  if (!override) return def;
  const merged = { ...def, ...override, type: def.type };
  merged.options = override.options && override.options.length ? override.options : def.options;
  return merged;
}