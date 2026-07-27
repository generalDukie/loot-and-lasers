import React, { useMemo } from "react";
import { motion } from "framer-motion";

// Deep-space arena backdrop — stars, nebula, planets, colosseum stands, crowd lights
export function ArenaBackdrop() {
  const stars = useMemo(() =>
    Array.from({ length: 90 }, () => ({
      x: Math.random() * 100,
      y: Math.random() * 55,
      s: Math.random() * 2 + 0.5,
      o: Math.random() * 0.6 + 0.2,
      tw: Math.random() * 4 + 2,
      delay: Math.random() * 4,
    })), []);

  const crowdLights = useMemo(() =>
    Array.from({ length: 45 }, () => ({
      x: Math.random() * 100,
      y: 55 + Math.random() * 28,
      s: Math.random() * 1.5 + 0.5,
      o: Math.random() * 0.5 + 0.2,
      delay: Math.random() * 3,
      hue: Math.floor(Math.random() * 3),
    })), []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Space gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#040214] via-[#0a0828] to-[#0c0420]" />

      {/* Multi-color nebula */}
      <div className="absolute inset-0" style={{
        background: `radial-gradient(ellipse 55% 35% at 25% 15%, rgba(124,58,237,0.18), transparent 60%), radial-gradient(ellipse 45% 30% at 78% 20%, rgba(34,211,238,0.12), transparent 60%), radial-gradient(ellipse 40% 25% at 50% 8%, rgba(236,72,153,0.1), transparent 60%), radial-gradient(ellipse 35% 20% at 10% 35%, rgba(59,130,246,0.08), transparent 60%)`,
      }} />

      {/* Twinkling stars */}
      {stars.map((s, i) => (
        <motion.div key={i} className="absolute rounded-full bg-white" style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.s, height: s.s }} animate={{ opacity: [s.o * 0.3, s.o, s.o * 0.3] }} transition={{ duration: s.tw, repeat: Infinity, delay: s.delay }} />
      ))}

      {/* Gas giant with orbital ring */}
      <div className="absolute" style={{ right: "6%", top: "4%" }}>
        <div style={{ width: 64, height: 64, borderRadius: "50%", background: "radial-gradient(circle at 32% 32%, #c4b5fd, #7c3aed 60%, #2e1065)", boxShadow: "0 0 24px rgba(139,92,246,0.45)" }} />
        <div className="absolute" style={{ top: "50%", left: "50%", transform: "translate(-50%,-50%) rotate(-22deg)", width: 104, height: 22, borderRadius: "50%", border: "1px solid rgba(196,181,253,0.2)" }} />
      </div>

      {/* Small moon */}
      <div className="absolute" style={{ left: "12%", top: "10%" }}>
        <div style={{ width: 28, height: 28, borderRadius: "50%", background: "radial-gradient(circle at 35% 35%, #e0e7ff, #6366f1 70%, #312e81)", boxShadow: "0 0 12px rgba(99,102,241,0.3)" }} />
      </div>

      {/* Colosseum stands */}
      <svg className="absolute bottom-0 left-0 right-0 w-full" style={{ height: "62%" }} viewBox="0 0 400 200" preserveAspectRatio="xMidYMax slice">
        <path d="M0 200 L0 145 Q200 85 400 145 L400 200 Z" fill="#070314" />
        <motion.path d="M0 145 Q200 85 400 145" fill="none" stroke="#22D3EE" strokeWidth="1.5" opacity="0.25" animate={{ opacity: [0.15, 0.3, 0.15] }} transition={{ duration: 4, repeat: Infinity }} />
        <path d="M0 165 Q200 105 400 165" fill="none" stroke="#7C3AED" strokeWidth="1" opacity="0.12" />
        <path d="M0 185 Q200 125 400 185" fill="none" stroke="#22D3EE" strokeWidth="0.8" opacity="0.08" />
        {[40, 100, 160, 240, 300, 360].map((x) => {
          const y = 145 - Math.abs(200 - x) * 0.25;
          return <g key={x}><rect x={x - 1} y={y} width="2" height="18" fill="#22D3EE" opacity="0.2" /><circle cx={x} cy={y} r="2.5" fill="#22D3EE" opacity="0.5" /></g>;
        })}
      </svg>

      {/* Horizon energy glow */}
      <div className="absolute left-0 right-0" style={{ top: "38%", height: "8%", background: "linear-gradient(to bottom, transparent, rgba(34,211,238,0.08), transparent)" }} />

      {/* Crowd lights — twinkling colored dots on the stands */}
      {crowdLights.map((l, i) => (
        <motion.div key={`c${i}`} className="absolute rounded-full" style={{ left: `${l.x}%`, top: `${l.y}%`, width: l.s, height: l.s, background: l.hue === 0 ? "#22D3EE" : l.hue === 1 ? "#C084FC" : "#FBBF24" }} animate={{ opacity: [l.o * 0.2, l.o, l.o * 0.2] }} transition={{ duration: 2 + Math.random() * 2, repeat: Infinity, delay: l.delay }} />
      ))}

      {/* Atmospheric haze */}
      <div className="absolute bottom-0 left-0 right-0" style={{ height: "25%", background: "linear-gradient(to top, rgba(7,3,20,0.9), transparent)" }} />

      {/* Spotlight beam from above */}
      <div className="absolute left-1/2 -translate-x-1/2 top-0" style={{ width: "60%", height: "50%", background: "linear-gradient(to bottom, rgba(34,211,238,0.04), transparent)", clipPath: "polygon(40% 0, 60% 0, 100% 100%, 0% 100%)" }} />

      {/* Scan lines */}
      <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.5) 2px, rgba(255,255,255,0.5) 3px)" }} />

      {/* Vignette */}
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 70% 60% at 50% 50%, transparent 50%, rgba(4,2,14,0.6) 100%)" }} />
    </div>
  );
}

// Holographic combat ring — foreground floor separating fighters from the backdrop
export function ArenaFloor({ pulse }) {
  return (
    <div className="absolute left-1/2 -translate-x-1/2 pointer-events-none" style={{ bottom: "3%", width: "88%", maxWidth: 600 }}>
      <svg viewBox="0 0 400 60" className="w-full">
        <motion.ellipse cx="200" cy="30" rx="195" ry="26" fill="rgba(34,211,238,0.06)" animate={{ opacity: pulse ? [0.06, 0.18, 0.06] : [0.06, 0.08, 0.06] }} transition={{ duration: pulse ? 0.5 : 3, repeat: Infinity }} />
        <ellipse cx="200" cy="30" rx="195" ry="26" fill="none" stroke="#22D3EE" strokeWidth="2" opacity="0.4" />
        <ellipse cx="200" cy="30" rx="170" ry="20" fill="none" stroke="#22D3EE" strokeWidth="1" opacity="0.2" />
        <line x1="200" y1="6" x2="200" y2="54" stroke="#7C3AED" strokeWidth="1.5" opacity="0.3" strokeDasharray="6 4" />
        <ellipse cx="95" cy="34" rx="65" ry="10" fill="rgba(34,211,238,0.1)" />
        <ellipse cx="305" cy="34" rx="65" ry="10" fill="rgba(251,113,133,0.1)" />
      </svg>
    </div>
  );
}