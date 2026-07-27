import React from "react";
import { motion } from "framer-motion";
import { RARITY_COLORS, weaponEmojiFor } from "@/lib/gameData";

// Animated visual per gear type — each piece gets its own playful motion.
const GEAR = {
  weapon: { emoji: "⚔️", animate: { rotate: [-9, 9, -9] }, transition: { duration: 2.4, repeat: Infinity, ease: "easeInOut" } },
  armor: { emoji: "🦺", animate: { scale: [1, 1.09, 1] }, transition: { duration: 2, repeat: Infinity, ease: "easeInOut" } },
  helmet: { emoji: "🪖", animate: { y: [0, -4, 0] }, transition: { duration: 2.2, repeat: Infinity, ease: "easeInOut" } },
  boots: { emoji: "🥾", animate: { x: [-3, 3, -3] }, transition: { duration: 0.85, repeat: Infinity, ease: "easeInOut" } },
  legs: { emoji: "🦵", animate: { y: [0, -3, 0] }, transition: { duration: 1.8, repeat: Infinity, ease: "easeInOut" } },
  neck: { emoji: "📿", animate: { rotate: [0, 360] }, transition: { duration: 6, repeat: Infinity, ease: "linear" } },
  accessory: { emoji: "💍", animate: { rotate: [0, 360] }, transition: { duration: 5, repeat: Infinity, ease: "linear" } },
  ship_module: { emoji: "⚙️", animate: { rotate: [0, 360] }, transition: { duration: 4, repeat: Infinity, ease: "linear" } },
  material: { emoji: "🪨", animate: { y: [0, -3, 0] }, transition: { duration: 2.5, repeat: Infinity, ease: "easeInOut" } },
  consumable: { emoji: "🧪", animate: { scale: [1, 1.12, 1] }, transition: { duration: 1.8, repeat: Infinity, ease: "easeInOut" } },
};

export default function GearVisual({ type, rarity, name, emoji: emojiProp, size = 56 }) {
  const g = GEAR[type] || GEAR.material;
  const color = RARITY_COLORS[rarity] || "#9CA3AF";
  const emoji =
    emojiProp ||
    (type === "weapon" ? weaponEmojiFor(name) : null) ||
    g.emoji;
  return (
    <div
      className="relative flex items-center justify-center rounded-xl"
      style={{ width: size, height: size, background: `radial-gradient(circle, ${color}22, transparent 70%)` }}
    >
      <div className="absolute inset-0 rounded-xl" style={{ boxShadow: `0 0 14px ${color}40, inset 0 0 8px ${color}20` }} />
      <motion.span
        className="relative leading-none"
        style={{ fontSize: size * 0.55, filter: `drop-shadow(0 0 4px ${color}99)` }}
        animate={g.animate}
        transition={g.transition}
      >
        {emoji}
      </motion.span>
    </div>
  );
}
