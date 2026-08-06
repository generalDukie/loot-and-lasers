import React from "react";
import { motion } from "framer-motion";
import { Lock } from "lucide-react";
import { spring } from "@/lib/goofyMotion";

// Constellation-style positions for the holographic sector path (percent).
const NODE_POS = [
  { x: 12, y: 66 },
  { x: 31, y: 36 },
  { x: 50, y: 60 },
  { x: 69, y: 30 },
  { x: 88, y: 54 },
];

const PLANET_EMOJI = ["🌍", "🏚️", "🏴‍☠️", "🌀", "🕳️"];

export default function GalaxyHolomap({ sectors, highestSector, onSelect }) {
  return (
    <div
      className="relative w-full rounded-xl overflow-hidden border border-primary/20"
      style={{
        aspectRatio: "16/9",
        minHeight: 280,
        background:
          "radial-gradient(ellipse at 50% 60%, hsl(190 90% 20% / 0.18), transparent 70%), radial-gradient(ellipse at 30% 30%, hsl(270 60% 25% / 0.16), transparent 60%), hsl(230 30% 6%)",
      }}
    >
      {/* Holographic grid */}
      <div
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(hsl(190 90% 60% / 0.25) 1px, transparent 1px), linear-gradient(90deg, hsl(190 90% 60% / 0.25) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />
      {/* Scanline sweep */}
      <motion.div
        className="absolute inset-x-0 h-16 pointer-events-none"
        style={{ background: "linear-gradient(to bottom, transparent, hsl(190 90% 60% / 0.08), transparent)" }}
        animate={{ y: ["-20%", "120%"] }}
        transition={{ duration: 5, repeat: Infinity, ease: "linear" }}
      />

      {/* Connection lanes */}
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        {sectors.slice(0, -1).map((s, i) => {
          const a = NODE_POS[i] || { x: 50, y: 50 };
          const b = NODE_POS[i + 1] || { x: 50, y: 50 };
          const unlocked = s.id <= highestSector;
          return (
            <motion.line
              key={s.id}
              x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke={unlocked ? s.color : "#444"}
              strokeWidth={0.5}
              strokeDasharray="2 2"
              strokeOpacity={unlocked ? 0.5 : 0.2}
              animate={{ strokeDashoffset: [0, -8] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
            />
          );
        })}
      </svg>

      {/* Sector nodes */}
      {sectors.map((sector, i) => {
        const pos = NODE_POS[i] || { x: 50, y: 50 };
        const unlocked = sector.id <= highestSector;
        const isCurrent = sector.id === highestSector;
        return (
          <motion.button
            key={sector.id}
            className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center group focus:outline-none"
            style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ ...spring, delay: 0.15 + i * 0.1 }}
            whileHover={unlocked ? { scale: 1.18, y: -4 } : {}}
            whileTap={unlocked ? { scale: 0.92 } : {}}
            onClick={() => onSelect(sector)}
          >
            {/* Current-location pulse — wrapper keeps Framer scale from drifting off-center */}
            {isCurrent && (
              <span className="absolute left-1/2 top-0 -translate-x-1/2 w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center pointer-events-none">
                <motion.span
                  className="w-12 h-12 sm:w-14 sm:h-14 rounded-full border-2"
                  style={{ borderColor: sector.color }}
                  animate={{ scale: [1, 1.7], opacity: [0.7, 0] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
                />
              </span>
            )}
            {/* Orb */}
            <motion.div
              className="relative w-11 h-11 sm:w-14 sm:h-14 rounded-full flex items-center justify-center text-lg sm:text-2xl border-2"
              style={{
                borderColor: unlocked ? sector.color : "#444",
                backgroundColor: unlocked ? sector.color + "22" : "rgba(20,20,30,0.6)",
                boxShadow: unlocked ? `0 0 14px ${sector.color}66` : "none",
                filter: unlocked ? "none" : "grayscale(1)",
              }}
              animate={{ y: [0, -5, 0], rotate: [-3, 3, -3] }}
              transition={{ duration: 2.4 + i * 0.4, repeat: Infinity, ease: "easeInOut" }}
            >
              {unlocked ? (PLANET_EMOJI[i] || "🪐") : <Lock className="w-4 h-4 text-muted-foreground" />}
            </motion.div>
            {/* Label */}
            <div className="mt-1.5 text-center">
              <p
                className="text-[9px] sm:text-[10px] font-display font-bold tracking-wide px-1.5 py-0.5 rounded bg-background/80 border border-border/40 whitespace-nowrap"
                style={{ color: unlocked ? sector.color : "#777" }}
              >
                {sector.name}
              </p>
              {isCurrent && (
                <p className="text-[8px] text-primary font-display mt-0.5 tracking-wider">YOU ARE HERE</p>
              )}
            </div>
          </motion.button>
        );
      })}

      {/* Goofy station mascot peeking */}
      <motion.div
        className="absolute bottom-2 right-2 text-2xl drop-shadow-lg pointer-events-none"
        animate={{ y: [0, -4, 0], rotate: [-4, 4, -4] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
      >
        🤖
      </motion.div>
    </div>
  );
}