import React from "react";
import { motion } from "framer-motion";
import { Lock } from "lucide-react";

/**
 * Quest-giver control — hologram beacon (not a portrait card).
 * size: "lg" (cantina floor) | "md" (preview) | "sm" (sheet header)
 */
export default function QuestGiverIcon({
  patron,
  available = true,
  locked = false,
  lowFuel = false,
  size = "lg",
  index = 0,
  className = "",
  showName = false,
}) {
  const color = locked ? "#6B7280" : patron?.color || "#00E5FF";
  const emoji = patron?.emoji || "🤖";
  const name = patron?.name || "Patron";
  const dimmed = locked || lowFuel;

  const SIZE = {
    lg: {
      wrap: "w-[8.75rem] sm:w-[10rem]",
      diamond: "w-[4.5rem] h-[4.5rem] sm:w-[5rem] sm:h-[5rem]",
      emoji: "text-3xl sm:text-4xl",
      column: "h-4 sm:h-5",
      base: "w-full h-2.5",
      pad: "px-2.5 pt-1.5 pb-1",
    },
    md: {
      wrap: "w-[4.25rem]",
      diamond: "w-12 h-12",
      emoji: "text-2xl",
      column: "h-3",
      base: "w-full h-1.5",
      pad: "px-1 py-1",
    },
    sm: {
      wrap: "w-[3.25rem]",
      diamond: "w-9 h-9",
      emoji: "text-xl",
      column: "h-2",
      base: "w-full h-1",
      pad: "px-0.5 py-0.5",
    },
  };
  const dims = SIZE[size] || SIZE.lg;

  return (
    <motion.div
      className={`relative flex flex-col items-center ${dims.wrap} ${dims.pad} ${className}`}
      animate={available && size === "lg" ? { y: [0, -5, 0] } : undefined}
      transition={{ duration: 2.8 + index * 0.2, repeat: Infinity, ease: "easeInOut" }}
      style={{
        filter: locked ? "grayscale(1)" : lowFuel ? "saturate(0.45) brightness(0.85)" : "none",
        // Solid dark stage so the beacon reads over busy cantina art
        background: "linear-gradient(180deg, rgba(6,8,14,0.92) 0%, rgba(6,8,14,0.88) 70%, rgba(6,8,14,0.55) 100%)",
        border: `2px solid ${color}`,
        borderRadius: "1rem 1rem 1.25rem 1.25rem",
        boxShadow: available
          ? `0 10px 28px rgba(0,0,0,0.75), 0 0 0 1px rgba(0,0,0,0.6), 0 0 24px ${color}55`
          : "0 8px 20px rgba(0,0,0,0.65), 0 0 0 1px rgba(0,0,0,0.5)",
      }}
    >
      {/* Diamond holo frame */}
      <div className={`relative ${dims.diamond} flex items-center justify-center`}>
        {available && (
          <motion.div
            className="absolute inset-[-14%] rounded-full border-2 border-dashed pointer-events-none"
            style={{ borderColor: `${color}cc` }}
            animate={{ rotate: 360 }}
            transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
          />
        )}

        {/* Opaque diamond body */}
        <div
          className="absolute inset-0"
          style={{
            clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)",
            background: locked
              ? "linear-gradient(160deg, #4a5060, #1a1e28)"
              : `linear-gradient(160deg, ${color} 0%, ${color}dd 35%, #0a0c12 100%)`,
            boxShadow: `0 0 20px ${color}88`,
          }}
        />
        <div
          className="absolute inset-[11%] flex items-center justify-center overflow-hidden"
          style={{
            clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)",
            background: "radial-gradient(circle at 40% 32%, rgba(255,255,255,0.2), #07090f 68%)",
            boxShadow: `inset 0 0 0 2px ${color}aa`,
          }}
        >
          {!dimmed && (
            <motion.div
              className="absolute inset-x-0 h-1/4 pointer-events-none"
              style={{
                background: `linear-gradient(180deg, transparent, ${color}66, transparent)`,
              }}
              animate={{ top: ["-25%", "110%"] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "linear", delay: index * 0.35 }}
            />
          )}
          <span
            className={`relative z-[1] leading-none ${dims.emoji}`}
            style={{
              filter: `drop-shadow(0 2px 4px rgba(0,0,0,0.9)) drop-shadow(0 0 6px ${color})`,
            }}
          >
            {emoji}
          </span>
        </div>

        {locked && (
          <span className="absolute -bottom-1 -right-1 z-10 flex items-center justify-center w-6 h-6 rounded-sm bg-background border border-border text-muted-foreground shadow-lg">
            <Lock className="w-3.5 h-3.5" />
          </span>
        )}
      </div>

      {/* Holo beam column */}
      <div
        className={`relative w-1 ${dims.column} mt-0.5 rounded-full`}
        style={{
          background: available
            ? `linear-gradient(180deg, ${color}, ${color}88)`
            : "linear-gradient(180deg, #888, #444)",
          boxShadow: available ? `0 0 12px ${color}` : undefined,
        }}
      >
        {available && size === "lg" && (
          <motion.span
            className="absolute left-1/2 -translate-x-1/2 w-2 h-2 rounded-full"
            style={{ background: "#fff", boxShadow: `0 0 10px ${color}, 0 0 4px #fff` }}
            animate={{ top: ["0%", "70%", "0%"], opacity: [1, 0.5, 1] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: index * 0.2 }}
          />
        )}
      </div>

      {/* Projector pad */}
      <div className={`relative ${dims.base} flex items-center justify-center mt-0.5`}>
        <div
          className="relative w-[90%] h-full rounded-[100%] border-2"
          style={{
            borderColor: color,
            background: `radial-gradient(ellipse at center, ${color}44, #05070c 70%)`,
            boxShadow: available
              ? `0 0 14px ${color}88, inset 0 1px 0 rgba(255,255,255,0.25)`
              : "inset 0 1px 0 rgba(255,255,255,0.1)",
          }}
        />
      </div>

      {showName && (
        <div
          className="mt-1.5 w-full px-1.5 py-0.5 truncate text-center font-display font-bold text-[10px] sm:text-xs tracking-wide rounded-sm"
          style={{
            color: locked ? "#9ca3af" : "#fff",
            background: locked ? "rgba(20,22,30,0.95)" : color,
            textShadow: locked ? undefined : "0 1px 2px rgba(0,0,0,0.45)",
            boxShadow: `0 2px 8px rgba(0,0,0,0.5)`,
          }}
        >
          {name}
        </div>
      )}
    </motion.div>
  );
}
