import React from "react";
import { motion } from "framer-motion";

// 30 distinct animation presets — one per species id (index = id - 1).
const PRESETS = [
  { animate: { y: [0, -8, 0] }, transition: { duration: 2.4, repeat: Infinity, ease: "easeInOut" } },
  { animate: { scale: [1, 1.12, 1] }, transition: { duration: 1.8, repeat: Infinity, ease: "easeInOut" } },
  { animate: { rotate: [0, 360] }, transition: { duration: 6, repeat: Infinity, ease: "linear" } },
  { animate: { rotate: [-8, 8, -8] }, transition: { duration: 1.6, repeat: Infinity, ease: "easeInOut" } },
  { animate: { x: [-4, 4, -4], y: [0, -3, 0] }, transition: { duration: 2.2, repeat: Infinity, ease: "easeInOut" } },
  { animate: { opacity: [1, 0.3, 1] }, transition: { duration: 1.2, repeat: Infinity, ease: "easeInOut" } },
  { animate: { y: [0, 0, -6, 0], scaleY: [1, 0.85, 1, 1] }, transition: { duration: 1.4, repeat: Infinity, ease: "easeInOut" } },
  { animate: { y: [0, 6, 0] }, transition: { duration: 1.8, repeat: Infinity, ease: "easeInOut" } },
  { animate: { rotate: [0, -360] }, transition: { duration: 8, repeat: Infinity, ease: "linear" } },
  { animate: { scale: [1, 0.85, 1], rotate: [0, 5, 0] }, transition: { duration: 2, repeat: Infinity, ease: "easeInOut" } },
  { animate: { x: [-3, 3, -3] }, transition: { duration: 0.6, repeat: Infinity, ease: "easeInOut" } },
  { animate: { y: [0, -12, 0], rotate: [0, 6, 0] }, transition: { duration: 2.6, repeat: Infinity, ease: "easeInOut" } },
  { animate: { skewX: [0, 8, 0, -8, 0] }, transition: { duration: 2, repeat: Infinity, ease: "easeInOut" } },
  { animate: { y: [0, -4, 0], x: [0, 4, 0] }, transition: { duration: 3, repeat: Infinity, ease: "easeInOut" } },
  { animate: { scale: [1, 1.15, 1], opacity: [1, 0.7, 1] }, transition: { duration: 1.5, repeat: Infinity, ease: "easeInOut" } },
  { animate: { rotate: [0, 15, 0, -15, 0] }, transition: { duration: 2.4, repeat: Infinity, ease: "easeInOut" } },
  { animate: { y: [0, -2, 0], scaleY: [1, 1.1, 1] }, transition: { duration: 1.2, repeat: Infinity, ease: "easeInOut" } },
  { animate: { x: [-6, 6, -6] }, transition: { duration: 2, repeat: Infinity, ease: "easeInOut" } },
  { animate: { scale: [1, 1.2, 1], rotate: [0, 360] }, transition: { duration: 7, repeat: Infinity, ease: "linear" } },
  { animate: { y: [0, 3, 0], opacity: [1, 0.5, 1] }, transition: { duration: 1.6, repeat: Infinity, ease: "easeInOut" } },
  { animate: { rotate: [0, 360], scale: [1, 1.1, 1] }, transition: { duration: 5, repeat: Infinity, ease: "linear" } },
  { animate: { y: [0, -6, 0], x: [0, 3, 0, -3, 0] }, transition: { duration: 3.2, repeat: Infinity, ease: "easeInOut" } },
  { animate: { scale: [1, 0.8, 1, 1.2, 1] }, transition: { duration: 2.2, repeat: Infinity, ease: "easeInOut" } },
  { animate: { rotate: [0, 8, -8, 0], y: [0, -5, 0] }, transition: { duration: 2.8, repeat: Infinity, ease: "easeInOut" } },
  { animate: { y: [0, -10, 0], opacity: [1, 0.8, 1], scale: [1, 1.05, 1] }, transition: { duration: 2, repeat: Infinity, ease: "easeInOut" } },
  { animate: { x: [0, 4, 0, -4, 0], y: [0, -3, 0] }, transition: { duration: 2.4, repeat: Infinity, ease: "easeInOut" } },
  { animate: { rotate: [0, -360], scale: [1, 0.9, 1] }, transition: { duration: 6, repeat: Infinity, ease: "linear" } },
  { animate: { scaleY: [1, 0.7, 1], y: [0, 4, 0] }, transition: { duration: 1.4, repeat: Infinity, ease: "easeInOut" } },
  { animate: { y: [0, -3, 0], rotate: [0, 4, -4, 0] }, transition: { duration: 1.8, repeat: Infinity, ease: "easeInOut" } },
  { animate: { scale: [1, 1.3, 1], opacity: [1, 0.4, 1], rotate: [0, 10, 0] }, transition: { duration: 2.2, repeat: Infinity, ease: "easeInOut" } },
];

export default function SpeciesAvatar({ species, size = 72, discovered = true }) {
  const preset = PRESETS[(species.id - 1) % PRESETS.length];
  return (
    <div
      className="relative flex items-center justify-center rounded-xl"
      style={{ width: size, height: size, background: `radial-gradient(circle, ${species.color}33, transparent 70%)` }}
    >
      <div className="absolute inset-0 rounded-xl" style={{ boxShadow: `0 0 14px ${species.color}55, inset 0 0 8px ${species.color}22` }} />
      <motion.span
        className="relative leading-none"
        style={{ fontSize: size * 0.5, filter: `drop-shadow(0 0 5px ${species.color}aa)` }}
        animate={preset.animate}
        transition={preset.transition}
      >
        {discovered ? species.emoji : "❔"}
      </motion.span>
    </div>
  );
}