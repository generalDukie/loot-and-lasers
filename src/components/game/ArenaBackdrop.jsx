import React, { useMemo } from "react";
import { motion } from "framer-motion";

// Deep-space orbital arena — void, nebula, distant worlds, floating galleries
export function ArenaBackdrop({ accent }) {
  const tint = accent || "#22d3ee";
  const stars = useMemo(() =>
    Array.from({ length: 110 }, () => ({
      x: Math.random() * 100,
      y: Math.random() * 70,
      s: Math.random() * 2.2 + 0.4,
      o: Math.random() * 0.65 + 0.2,
      tw: Math.random() * 4 + 2,
      delay: Math.random() * 4,
    })), []);

  const galleryLights = useMemo(() =>
    Array.from({ length: 36 }, () => ({
      x: 8 + Math.random() * 84,
      y: 58 + Math.random() * 22,
      s: Math.random() * 1.8 + 0.6,
      o: Math.random() * 0.45 + 0.2,
      delay: Math.random() * 3,
      hue: Math.floor(Math.random() * 3),
    })), []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="absolute inset-0 bg-gradient-to-b from-[#02010c] via-[#07051c] to-[#050318]" />

      {/* Nebula wash — tinted by frontier planet when accent is set */}
      <div className="absolute inset-0" style={{
        background: `
          radial-gradient(ellipse 60% 40% at 20% 12%, ${tint}24, transparent 58%),
          radial-gradient(ellipse 50% 35% at 82% 18%, rgba(244,63,94,0.1), transparent 55%),
          radial-gradient(ellipse 45% 28% at 50% 5%, rgba(99,102,241,0.12), transparent 60%),
          radial-gradient(ellipse 70% 35% at 50% 85%, ${tint}14, transparent 55%)
        `,
      }} />

      {stars.map((s, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full bg-white"
          style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.s, height: s.s }}
          animate={{ opacity: [s.o * 0.25, s.o, s.o * 0.25] }}
          transition={{ duration: s.tw, repeat: Infinity, delay: s.delay }}
        />
      ))}

      {/* Distant gas giant */}
      <div className="absolute" style={{ right: "5%", top: "3%" }}>
        <div style={{
          width: 72, height: 72, borderRadius: "50%",
          background: "radial-gradient(circle at 30% 28%, #a5b4fc, #6366f1 45%, #1e1b4b 78%)",
          boxShadow: "0 0 40px rgba(99,102,241,0.35)",
        }} />
        <div className="absolute" style={{
          top: "50%", left: "50%", transform: "translate(-50%,-50%) rotate(-18deg)",
          width: 118, height: 26, borderRadius: "50%",
          border: "1.5px solid rgba(165,180,252,0.28)",
          boxShadow: "0 0 12px rgba(165,180,252,0.15)",
        }} />
      </div>

      {/* Small ice moon */}
      <div className="absolute" style={{ left: "10%", top: "8%" }}>
        <div style={{
          width: 26, height: 26, borderRadius: "50%",
          background: "radial-gradient(circle at 35% 32%, #e2e8f0, #64748b 70%, #1e293b)",
          boxShadow: "0 0 14px rgba(148,163,184,0.25)",
        }} />
      </div>

      {/* Orbital gallery rings — floating spectator decks, not stadium bleachers */}
      <svg className="absolute bottom-0 left-0 right-0 w-full" style={{ height: "48%" }} viewBox="0 0 400 160" preserveAspectRatio="xMidYMax slice">
        <defs>
          <linearGradient id="galleryFade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0a1628" stopOpacity="0" />
            <stop offset="40%" stopColor="#06101c" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#030814" stopOpacity="0.92" />
          </linearGradient>
        </defs>
        <ellipse cx="200" cy="148" rx="220" ry="48" fill="url(#galleryFade)" />
        <motion.ellipse
          cx="200" cy="118" rx="195" ry="28"
          fill="none" stroke={tint} strokeWidth="1.2" opacity="0.22"
          animate={{ opacity: [0.12, 0.28, 0.12] }}
          transition={{ duration: 5, repeat: Infinity }}
        />
        <ellipse cx="200" cy="132" rx="210" ry="34" fill="none" stroke="#64748b" strokeWidth="0.8" opacity="0.2" />
        <ellipse cx="200" cy="145" rx="225" ry="40" fill="none" stroke="#334155" strokeWidth="0.6" opacity="0.25" />
        {/* Structural pylons */}
        {[55, 110, 160, 240, 290, 345].map((x) => {
          const depth = 1 - Math.abs(200 - x) / 200;
          const y = 118 + (1 - depth) * 18;
          return (
            <g key={x} opacity={0.35 + depth * 0.35}>
              <line x1={x} y1={y} x2={x} y2={y + 22} stroke={tint} strokeWidth="1.2" />
              <circle cx={x} cy={y} r="2.2" fill={tint} />
            </g>
          );
        })}
      </svg>

      {galleryLights.map((l, i) => (
        <motion.div
          key={`g${i}`}
          className="absolute rounded-full"
          style={{
            left: `${l.x}%`, top: `${l.y}%`, width: l.s, height: l.s,
            background: l.hue === 0 ? tint : l.hue === 1 ? "#F472B6" : "#FBBF24",
          }}
          animate={{ opacity: [l.o * 0.15, l.o, l.o * 0.15] }}
          transition={{ duration: 2.2 + (i % 5) * 0.35, repeat: Infinity, delay: l.delay }}
        />
      ))}

      {/* Void under the platform */}
      <div className="absolute bottom-0 left-0 right-0" style={{
        height: "30%",
        background: "linear-gradient(to top, rgba(2,1,12,0.95), rgba(2,1,12,0.35), transparent)",
      }} />

      {/* Soft overhead cone */}
      <div className="absolute left-1/2 -translate-x-1/2 top-0" style={{
        width: "55%", height: "45%",
        background: `linear-gradient(to bottom, ${tint}0d, transparent)`,
        clipPath: "polygon(42% 0, 58% 0, 100% 100%, 0% 100%)",
      }} />

      <div className="absolute inset-0" style={{
        background: "radial-gradient(ellipse 72% 65% at 50% 42%, transparent 45%, rgba(2,1,12,0.7) 100%)",
      }} />
    </div>
  );
}

/**
 * Floating hardlight combat deck — orbital arena floor with perspective grid,
 * team pads, and an energy rim that reacts to big hits.
 */
export function ArenaFloor({ pulse, accent }) {
  const rim = accent || "#67e8f9";
  const rimSoft = accent || "#22d3ee";
  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 pointer-events-none"
      style={{ bottom: "2%", width: "92%", maxWidth: 720 }}
    >
      <svg viewBox="0 0 720 200" className="w-full" style={{ filter: `drop-shadow(0 12px 40px ${rim}2e)` }}>
        <defs>
          <radialGradient id="deckFill" cx="50%" cy="42%" r="55%">
            <stop offset="0%" stopColor={rimSoft} stopOpacity="0.28" />
            <stop offset="45%" stopColor={rimSoft} stopOpacity="0.12" />
            <stop offset="100%" stopColor="#020617" stopOpacity="0.05" />
          </radialGradient>
          <linearGradient id="deckShine" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={rim} stopOpacity="0.35" />
            <stop offset="40%" stopColor={rimSoft} stopOpacity="0.08" />
            <stop offset="100%" stopColor="#0f172a" stopOpacity="0" />
          </linearGradient>
          <radialGradient id="voidGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={rimSoft} stopOpacity="0.2" />
            <stop offset="100%" stopColor={rimSoft} stopOpacity="0" />
          </radialGradient>
          <clipPath id="deckClip">
            <ellipse cx="360" cy="118" rx="330" ry="68" />
          </clipPath>
        </defs>

        {/* Soft void bloom under the deck */}
        <motion.ellipse
          cx="360" cy="150" rx="300" ry="36"
          fill="url(#voidGlow)"
          animate={{ opacity: pulse ? [0.35, 0.85, 0.35] : [0.25, 0.4, 0.25] }}
          transition={{ duration: pulse ? 0.45 : 4, repeat: Infinity }}
        />

        {/* Main hardlight deck */}
        <ellipse cx="360" cy="118" rx="330" ry="68" fill="url(#deckFill)" />
        <ellipse cx="360" cy="118" rx="330" ry="68" fill="url(#deckShine)" />

        {/* Perspective tech grid */}
        <g clipPath="url(#deckClip)" opacity="0.45">
          {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => {
            const t = i / 8;
            const y = 70 + t * 90;
            const half = 320 * (0.35 + t * 0.65);
            return (
              <line
                key={`h${i}`}
                x1={360 - half} y1={y} x2={360 + half} y2={y}
                stroke="#67e8f9" strokeWidth={i === 4 ? 1.4 : 0.7} opacity={0.15 + t * 0.35}
              />
            );
          })}
          {[-4, -3, -2, -1, 0, 1, 2, 3, 4].map((i) => (
            <line
              key={`v${i}`}
              x1={360 + i * 18} y1={72}
              x2={360 + i * 72} y2={175}
              stroke="#22d3ee" strokeWidth="0.7" opacity="0.22"
            />
          ))}
        </g>

        {/* Concentric energy rings */}
        <motion.ellipse
          cx="360" cy="118" rx="330" ry="68"
          fill="none" stroke="#67e8f9" strokeWidth="2.5"
          animate={{ opacity: pulse ? [0.55, 1, 0.55] : [0.45, 0.7, 0.45] }}
          transition={{ duration: pulse ? 0.4 : 3.2, repeat: Infinity }}
        />
        <ellipse cx="360" cy="118" rx="290" ry="56" fill="none" stroke="#22d3ee" strokeWidth="1.2" opacity="0.35" />
        <ellipse cx="360" cy="118" rx="210" ry="38" fill="none" stroke="#a5f3fc" strokeWidth="1" opacity="0.2" strokeDasharray="10 8" />

        {/* Center seam / arena divider */}
        <line x1="360" y1="55" x2="360" y2="180" stroke="#94a3b8" strokeWidth="1.5" opacity="0.35" strokeDasharray="7 6" />
        <circle cx="360" cy="118" r="10" fill="none" stroke="#e2e8f0" strokeWidth="1.2" opacity="0.4" />
        <circle cx="360" cy="118" r="3.5" fill="#e2e8f0" opacity="0.55" />

        {/* Player pad (cyan) */}
        <ellipse cx="195" cy="128" rx="95" ry="28" fill="rgba(34,211,238,0.12)" />
        <ellipse cx="195" cy="128" rx="95" ry="28" fill="none" stroke="#22d3ee" strokeWidth="1.6" opacity="0.55" />
        <ellipse cx="195" cy="128" rx="70" ry="18" fill="none" stroke="#67e8f9" strokeWidth="0.8" opacity="0.3" />

        {/* Opponent pad (rose) */}
        <ellipse cx="525" cy="128" rx="95" ry="28" fill="rgba(251,113,133,0.12)" />
        <ellipse cx="525" cy="128" rx="95" ry="28" fill="none" stroke="#fb7185" strokeWidth="1.6" opacity="0.55" />
        <ellipse cx="525" cy="128" rx="70" ry="18" fill="none" stroke="#fda4af" strokeWidth="0.8" opacity="0.3" />

        {/* Corner emitters / hardlight pylons */}
        {[
          [80, 100], [640, 100], [120, 155], [600, 155],
        ].map(([x, y], i) => (
          <g key={i}>
            <motion.circle
              cx={x} cy={y} r="5"
              fill={i % 2 === 0 ? "#22d3ee" : "#fb7185"}
              animate={{ opacity: [0.35, 0.95, 0.35], scale: pulse ? [1, 1.35, 1] : [1, 1.08, 1] }}
              transition={{ duration: pulse ? 0.4 : 2.4, repeat: Infinity, delay: i * 0.2 }}
              style={{ transformOrigin: `${x}px ${y}px` }}
            />
            <circle cx={x} cy={y} r="10" fill="none" stroke={i % 2 === 0 ? "#22d3ee" : "#fb7185"} strokeWidth="1" opacity="0.35" />
          </g>
        ))}

        {/* Outer force-field rim ticks */}
        {Array.from({ length: 24 }, (_, i) => {
          const a = (i / 24) * Math.PI * 2;
          const rx = 330; const ry = 68;
          const x1 = 360 + Math.cos(a) * rx;
          const y1 = 118 + Math.sin(a) * ry;
          const x2 = 360 + Math.cos(a) * (rx + 8);
          const y2 = 118 + Math.sin(a) * (ry + 4);
          return (
            <line
              key={`t${i}`}
              x1={x1} y1={y1} x2={x2} y2={y2}
              stroke="#94a3b8" strokeWidth="1.2" opacity="0.35"
            />
          );
        })}
      </svg>
    </div>
  );
}
