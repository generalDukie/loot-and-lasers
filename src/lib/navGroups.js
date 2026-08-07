import { Beer, MessageSquare, Zap, Trophy, User, ShoppingBag, Orbit, Crown, Users, Mail, Pickaxe, Rocket, Dice5 } from "lucide-react";

// Navigation grouped into categories so the rail stays condensed and scannable.
export const NAV_GROUPS = [
  {
    name: "Explore",
    items: [
      { to: "/character", label: "Hero", icon: User, color: "#00E5FF" },
      { to: "/missions", label: "Cantina", icon: Beer, color: "#FF8C00" },
      { to: "/galaxy-map", label: "Galactic Frontier", icon: Orbit, color: "#BA55D3" },
      { to: "/ship", label: "Ship Hangar", icon: Rocket, color: "#2DD4BF" },
    ],
  },
  {
    name: "Social",
    items: [
      { to: "/friends", label: "Friends", icon: Users, color: "#A855F7" },
      { to: "/messages", label: "Chat", icon: MessageSquare, color: "#38BDF8" },
      { to: "/mail", label: "Mail", icon: Mail, color: "#F59E0B" },
      { to: "/guild", label: "Guild", icon: Users, color: "#F43F5E" },
    ],
  },
  {
    name: "Battle",
    items: [
      { to: "/arena", label: "Arena", icon: Zap, color: "#FB7185" },
      { to: "/leaderboard", label: "Ranks", icon: Trophy, color: "#34D399" },
      { to: "/nexus", label: "Nexus", icon: Crown, color: "#60A5FA" },
    ],
  },
  {
    name: "Trade",
    items: [
      { to: "/shop", label: "Black Market", icon: ShoppingBag, color: "#9D6BFF" },
      { to: "/casino", label: "Casino", icon: Dice5, color: "#FBBF24" },
      { to: "/black-hole", label: "Void", icon: Orbit, color: "#14B8A6" },
      { to: "/space-mining", label: "Mine", icon: Pickaxe, color: "#EC4899" },
    ],
  },
];

export const MOBILE_NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);