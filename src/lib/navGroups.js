import { Beer, MessageSquare, Zap, Trophy, Award, User, ShoppingBag, Orbit, Crown, Users, Mail, Pickaxe, Rocket, Dice5 } from "lucide-react";

// Navigation grouped into categories so the rail stays condensed and scannable.
export const NAV_GROUPS = [
  {
    name: "Explore",
    items: [
      { to: "/character", label: "Hero", icon: User, color: "#00E5FF" },
      { to: "/missions", label: "Crew Lounge", icon: Beer, color: "#FF8C00" },
      { to: "/galaxy-map", label: "Galaxy", icon: Orbit, color: "#ba55d3" },
      { to: "/ship", label: "Ship", icon: Rocket, color: "#22D3EE" },
    ],
  },
  {
    name: "Social",
    items: [
      { to: "/friends", label: "Friends", icon: Users, color: "#A855F7" },
      { to: "/messages", label: "Chat", icon: MessageSquare, color: "#22D3EE" },
      { to: "/mail", label: "Mail", icon: Mail, color: "#F59E0B" },
      { to: "/guild", label: "Guild", icon: Users, color: "#00ffff" },
    ],
  },
  {
    name: "Battle",
    items: [
      { to: "/arena", label: "Arena", icon: Zap, color: "#FF8C00" },
      { to: "/leaderboard", label: "Ranks", icon: Trophy, color: "#FBBF24" },
      { to: "/nexus", label: "Nexus", icon: Crown, color: "#FFD700" },
      { to: "/achievements", label: "Achievements", icon: Award, color: "#FFD700" },
    ],
  },
  {
    name: "Trade",
    items: [
      { to: "/shop", label: "Market", icon: ShoppingBag, color: "#ba55d3" },
      { to: "/casino", label: "Casino", icon: Dice5, color: "#F59E0B" },
      { to: "/black-hole", label: "Void", icon: Orbit, color: "#9D6BFF" },
      { to: "/space-mining", label: "Mine", icon: Pickaxe, color: "#F59E0B" },
    ],
  },
];

export const MOBILE_NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);