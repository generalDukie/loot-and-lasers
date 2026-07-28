import React, { useId } from "react";
import { motion } from "framer-motion";
import { FUEL_COLOR } from "@/lib/gameData";

export const SHIP_HULL_THEME = {
  scout: {
    accent: "#38BDF8",
    glow: "rgba(56,189,248,0.45)",
    bay: "from-[#0B1220] via-[#102033] to-[#081018]",
  },
  frigate: {
    accent: "#F59E0B",
    glow: "rgba(245,158,11,0.4)",
    bay: "from-[#1A1208] via-[#2A1A0C] to-[#0C0804]",
  },
  cruiser: {
    accent: "#34D399",
    glow: "rgba(52,211,153,0.4)",
    bay: "from-[#061816] via-[#0C2420] to-[#040E0C]",
  },
  dreadnought: {
    accent: "#C084FC",
    glow: "rgba(192,132,252,0.45)",
    bay: "from-[#14081C] via-[#220F30] to-[#08040C]",
  },
};

/** CSS silhouette per hull — hangar hero / card preview. */
export function ShipHullPreview({ shipId, accent, className = "w-full h-auto", ghost = false }) {
  const uid = useId().replace(/:/g, "");
  const gid = `${shipId || "scout"}-${uid}`;
  const a = accent || (SHIP_HULL_THEME[shipId] || SHIP_HULL_THEME.scout).accent;
  const opacity = ghost ? 0.45 : 1;

  if (shipId === "frigate") {
    return (
      <svg viewBox="0 0 280 120" className={className} style={{ opacity }} aria-hidden>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#1E293B" />
            <stop offset="55%" stopColor="#334155" />
            <stop offset="100%" stopColor={a} stopOpacity="0.85" />
          </linearGradient>
        </defs>
        <ellipse cx="210" cy="62" rx="42" ry="10" fill={a} opacity="0.25" />
        <path d="M28 68 L95 42 L175 38 L248 55 L248 72 L175 82 L95 78 Z" fill={`url(#${gid})`} stroke={a} strokeWidth="1.5" />
        <path d="M118 38 L132 18 L148 38" fill="#0F172A" stroke={a} strokeWidth="1" />
        <rect x="150" y="48" width="28" height="8" rx="2" fill={a} opacity="0.7" />
        <rect x="185" y="50" width="18" height="6" rx="2" fill={a} opacity="0.5" />
      </svg>
    );
  }
  if (shipId === "cruiser") {
    return (
      <svg viewBox="0 0 280 120" className={className} style={{ opacity }} aria-hidden>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#0F172A" />
            <stop offset="50%" stopColor="#1E293B" />
            <stop offset="100%" stopColor={a} stopOpacity="0.8" />
          </linearGradient>
        </defs>
        <ellipse cx="230" cy="64" rx="36" ry="12" fill={a} opacity="0.22" />
        <path d="M20 70 C60 48, 110 36, 160 40 L250 58 L250 74 L160 88 C110 90, 60 84, 20 70 Z" fill={`url(#${gid})`} stroke={a} strokeWidth="1.5" />
        <circle cx="95" cy="58" r="7" fill={a} opacity="0.55" />
        <circle cx="125" cy="54" r="5" fill={a} opacity="0.4" />
        <path d="M175 44 L190 28 L205 46" fill="#020617" stroke={a} strokeWidth="1" />
      </svg>
    );
  }
  if (shipId === "dreadnought") {
    return (
      <svg viewBox="0 0 280 130" className={className} style={{ opacity }} aria-hidden>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#1E1030" />
            <stop offset="45%" stopColor="#2E1A4A" />
            <stop offset="100%" stopColor={a} stopOpacity="0.9" />
          </linearGradient>
        </defs>
        <ellipse cx="200" cy="78" rx="70" ry="16" fill={a} opacity="0.2" />
        <path d="M18 78 L70 50 L130 36 L210 42 L262 68 L262 88 L210 102 L130 108 L70 96 Z" fill={`url(#${gid})`} stroke={a} strokeWidth="1.8" />
        <path d="M100 50 L120 22 L145 50" fill="#0B0614" stroke={a} strokeWidth="1.2" />
        <rect x="155" y="58" width="40" height="10" rx="2" fill={a} opacity="0.65" />
        <rect x="200" y="62" width="24" height="7" rx="2" fill={a} opacity="0.45" />
        <path d="M55 70 L40 88 L70 82 Z" fill={a} opacity="0.35" />
        <path d="M55 86 L40 68 L70 74 Z" fill={a} opacity="0.25" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 260 110" className={className} style={{ opacity }} aria-hidden>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#0F172A" />
          <stop offset="60%" stopColor="#1E293B" />
          <stop offset="100%" stopColor={a} stopOpacity="0.75" />
        </linearGradient>
      </defs>
      <ellipse cx="195" cy="58" rx="34" ry="9" fill={a} opacity="0.28" />
      <path d="M36 62 L100 40 L170 44 L228 56 L228 66 L170 74 L100 72 Z" fill={`url(#${gid})`} stroke={a} strokeWidth="1.4" />
      <circle cx="118" cy="56" r="5" fill={a} opacity="0.7" />
      <path d="M148 46 L156 32 L166 46" fill="#020617" stroke={a} strokeWidth="1" />
    </svg>
  );
}

/**
 * Full-bleed hangar bay hero for the active vessel.
 */
export default function ShipHangarHero({
  ship,
  shipId,
  fuel,
  maxFuel,
  modsInstalled,
  inherentLabel,
  bonuses = [],
}) {
  const theme = SHIP_HULL_THEME[shipId] || SHIP_HULL_THEME.scout;
  const fuelPct = Math.min(100, Math.round(((fuel ?? 0) / Math.max(1, maxFuel)) * 100));

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative overflow-hidden rounded-2xl border border-border/50 min-h-[240px] sm:min-h-[280px] shadow-[0_20px_50px_rgba(0,0,0,0.35)]`}
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${theme.bay}`} />
      {/* Bay lights / atmosphere */}
      <div
        className="absolute inset-0 opacity-80"
        style={{
          background: `
            radial-gradient(ellipse 80% 50% at 70% 55%, ${theme.glow}, transparent 60%),
            radial-gradient(ellipse 40% 30% at 20% 20%, rgba(255,255,255,0.07), transparent 50%),
            linear-gradient(180deg, transparent 50%, rgba(0,0,0,0.6) 100%)
          `,
        }}
      />
      {/* Stars */}
      <div
        className="absolute inset-0 opacity-40 pointer-events-none"
        style={{
          backgroundImage: `
            radial-gradient(1px 1px at 15% 20%, #fff, transparent),
            radial-gradient(1px 1px at 55% 12%, #fff, transparent),
            radial-gradient(1.5px 1.5px at 82% 28%, ${theme.accent}, transparent),
            radial-gradient(1px 1px at 35% 35%, rgba(255,255,255,0.7), transparent)
          `,
        }}
      />
      {/* Floor grid */}
      <div
        className="absolute inset-x-0 bottom-0 h-1/2 opacity-[0.14] pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(${theme.accent}40 1px, transparent 1px),
            linear-gradient(90deg, ${theme.accent}40 1px, transparent 1px)
          `,
          backgroundSize: "28px 28px",
          maskImage: "linear-gradient(to top, black, transparent)",
        }}
      />
      {/* Docking rim */}
      <div
        className="absolute inset-x-6 bottom-3 h-px pointer-events-none"
        style={{ background: `linear-gradient(90deg, transparent, ${theme.accent}88, transparent)` }}
      />
      {/* Soft engine wash */}
      <motion.div
        className="absolute right-[8%] top-1/2 -translate-y-1/2 w-44 h-28 rounded-full blur-2xl pointer-events-none"
        style={{ background: theme.glow }}
        animate={{ opacity: [0.35, 0.7, 0.35], scale: [0.95, 1.1, 0.95] }}
        transition={{ duration: 3.6, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute left-[12%] top-6 w-2 h-2 rounded-full pointer-events-none"
        style={{ background: theme.accent, boxShadow: `0 0 12px ${theme.accent}` }}
        animate={{ opacity: [0.3, 1, 0.3] }}
        transition={{ duration: 2.2, repeat: Infinity }}
      />

      <div className="relative z-10 flex flex-col sm:flex-row sm:items-end gap-4 p-5 sm:p-7 h-full min-h-[240px] sm:min-h-[280px]">
        <div className="flex-1 min-w-0 flex flex-col justify-end order-2 sm:order-1">
          <p className="text-[10px] font-display font-bold tracking-[0.2em] uppercase mb-1" style={{ color: theme.accent }}>
            Active Vessel
          </p>
          <h2 className="font-display font-black text-2xl sm:text-3xl text-foreground tracking-wide leading-tight">
            {ship.name}
          </h2>
          {inherentLabel && (
            <p className="text-[11px] mt-1 font-medium" style={{ color: theme.accent }}>{inherentLabel}</p>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            {modsInstalled} mod{modsInstalled === 1 ? "" : "s"} installed on this hull
          </p>

          <div className="mt-3 flex items-center gap-2 max-w-xs">
            <div className="flex-1 h-2 rounded-full bg-black/40 border border-white/10 overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${fuelPct}%`, background: FUEL_COLOR }} />
            </div>
            <span className="text-[10px] font-mono tabular-nums shrink-0" style={{ color: FUEL_COLOR }}>
              {fuel}/{maxFuel} ⛽
            </span>
          </div>

          {bonuses.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {bonuses.map((e) => (
                <span
                  key={e.label}
                  className="text-[10px] font-display font-semibold px-2 py-0.5 rounded-full border"
                  style={{
                    color: theme.accent,
                    borderColor: `${theme.accent}55`,
                    backgroundColor: `${theme.accent}18`,
                  }}
                >
                  {e.label} {e.value}
                </span>
              ))}
            </div>
          )}
        </div>

        <motion.div
          className="flex-1 flex items-center justify-center sm:justify-end order-1 sm:order-2 pt-2 sm:pt-0"
          animate={{ y: [0, -7, 0] }}
          transition={{ duration: 4.2, repeat: Infinity, ease: "easeInOut" }}
        >
          <div className="relative w-full max-w-md px-2">
            <ShipHullPreview shipId={shipId} accent={theme.accent} className="w-full max-w-md h-auto drop-shadow-2xl" />
            <span className="sr-only">{ship.emoji} {ship.name}</span>
          </div>
        </motion.div>
      </div>
    </motion.section>
  );
}
