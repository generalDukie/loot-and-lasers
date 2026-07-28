import React from "react";
import { motion } from "framer-motion";
import { STAT_COLORS } from "@/lib/gameData";

const INK = "#120a1c";

/** Compact comic-style class art for selection cards. */
function EmblemArt({ name, color }) {
  switch (name) {
    case "Vanguard":
      return (
        <g>
          <path d="M100 38 L128 52 L128 108 Q100 138 72 108 L72 52 Z" fill={color} stroke={INK} strokeWidth="5" strokeLinejoin="round" />
          <path d="M100 48 L118 58 L118 100 Q100 120 82 100 L82 58 Z" fill="#fff" opacity="0.22" />
          <rect x="94" y="128" width="12" height="34" rx="4" fill={color} stroke={INK} strokeWidth="4" />
          <circle cx="100" cy="88" r="10" fill={INK} opacity="0.35" />
        </g>
      );
    case "Shadow Operative":
      return (
        <g>
          <path d="M78 42 L122 78 L108 92 L64 56 Z" fill={color} stroke={INK} strokeWidth="5" strokeLinejoin="round" />
          <path d="M108 92 L148 148" stroke={INK} strokeWidth="8" strokeLinecap="round" />
          <path d="M108 92 L148 148" stroke={color} strokeWidth="4" strokeLinecap="round" />
          <ellipse cx="86" cy="58" rx="10" ry="6" fill="#fff" opacity="0.25" transform="rotate(-35 86 58)" />
        </g>
      );
    case "Technomancer":
      return (
        <g>
          <circle cx="100" cy="96" r="42" fill={color} stroke={INK} strokeWidth="5" />
          <circle cx="100" cy="96" r="26" fill={INK} opacity="0.25" />
          <path d="M100 62 L108 90 L136 90 L114 108 L122 136 L100 118 L78 136 L86 108 L64 90 L92 90 Z" fill="#fff" opacity="0.85" stroke={INK} strokeWidth="3.5" strokeLinejoin="round" />
        </g>
      );
    case "Astral Warden":
      return (
        <g>
          <path d="M100 40 L140 58 L140 108 Q100 148 60 108 L60 58 Z" fill={color} stroke={INK} strokeWidth="5" strokeLinejoin="round" />
          <path d="M100 56 L122 68 L122 104 Q100 128 78 104 L78 68 Z" fill="#fff" opacity="0.2" />
          <path d="M100 78 L106 92 L122 92 L110 102 L114 118 L100 108 L86 118 L90 102 L78 92 L94 92 Z" fill="#fff" opacity="0.9" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
        </g>
      );
    case "Void Runner":
      return (
        <g>
          <path d="M48 118 Q78 48 118 78 Q148 98 152 128" fill="none" stroke={color} strokeWidth="14" strokeLinecap="round" opacity="0.35" />
          <path d="M52 112 Q80 52 116 80 Q142 98 146 124" fill="none" stroke={color} strokeWidth="7" strokeLinecap="round" />
          <circle cx="148" cy="128" r="14" fill={color} stroke={INK} strokeWidth="4" />
          <circle cx="148" cy="128" r="6" fill="#fff" opacity="0.7" />
          <path d="M70 70 L58 54" stroke={INK} strokeWidth="5" strokeLinecap="round" />
          <path d="M88 58 L82 42" stroke={INK} strokeWidth="5" strokeLinecap="round" />
        </g>
      );
    case "Cosmic Engineer":
      return (
        <g>
          <circle cx="100" cy="100" r="34" fill="none" stroke={INK} strokeWidth="12" />
          <circle cx="100" cy="100" r="34" fill="none" stroke={color} strokeWidth="7" />
          <circle cx="100" cy="100" r="14" fill={color} stroke={INK} strokeWidth="4" />
          {[0, 60, 120, 180, 240, 300].map((deg) => {
            const a = (deg * Math.PI) / 180;
            const x = 100 + Math.cos(a) * 34;
            const y = 100 + Math.sin(a) * 34;
            return <rect key={deg} x={x - 7} y={y - 10} width="14" height="20" rx="3" fill={color} stroke={INK} strokeWidth="3.5" transform={`rotate(${deg} ${x} ${y})`} />;
          })}
        </g>
      );
    default:
      return <circle cx="100" cy="100" r="40" fill={color} stroke={INK} strokeWidth="5" />;
  }
}

export default function ClassEmblem({ cls, size = 64, animate = true }) {
  const color = STAT_COLORS[cls?.primaryStat] || STAT_COLORS.all;
  const uid = String(cls?.name || "class").replace(/\s+/g, "-");

  return (
    <div
      className="relative shrink-0 flex items-center justify-center rounded-xl overflow-hidden"
      style={{
        width: size,
        height: size,
        background: `radial-gradient(circle at 40% 35%, ${color}33, transparent 68%)`,
        boxShadow: `inset 0 0 0 1px ${color}44, 0 0 14px ${color}28`,
      }}
    >
      <svg width={size} height={size} viewBox="0 0 200 200" className="absolute inset-0 opacity-40" aria-hidden>
        <defs>
          <radialGradient id={`cls-aura-${uid}`} cx="50%" cy="45%" r="55%">
            <stop offset="0%" stopColor={color} stopOpacity="0.5" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </radialGradient>
        </defs>
        <ellipse cx="100" cy="100" rx="88" ry="88" fill={`url(#cls-aura-${uid})`} />
      </svg>
      <motion.div
        className="relative"
        style={{ width: size * 0.88, height: size * 0.88 }}
        animate={animate ? { y: [0, -3, 0] } : undefined}
        transition={animate ? { duration: 3.2, repeat: Infinity, ease: "easeInOut" } : undefined}
      >
        <svg viewBox="0 0 200 200" width="100%" height="100%" className="select-none drop-shadow-sm">
          <EmblemArt name={cls?.name} color={color} />
        </svg>
      </motion.div>
    </div>
  );
}
