import React from "react";
import { motion } from "framer-motion";

// Big, class-specific VFX overlaid on the attacker when their special triggers.
// Each class gets a unique visual identity for their ability activation.
export default function ArenaAbilityBurst({ className, dir, color, evIdx }) {
  if (className === "Vanguard") {
    // Expanding red shockwave ring — heavy slam impact
    return (
      <motion.div
        key={evIdx}
        className="absolute inset-0 pointer-events-none z-30 flex items-center justify-center"
        initial={{ scale: 0.3, opacity: 1 }}
        animate={{ scale: [0.3, 1.8, 2.2], opacity: [1, 0.6, 0] }}
        transition={{ duration: 0.65, ease: "easeOut" }}
      >
        <div style={{ width: 110, height: 110, borderRadius: "50%", border: `5px solid ${color}`, boxShadow: `0 0 28px ${color}, inset 0 0 20px ${color}` }} />
      </motion.div>
    );
  }

  if (className === "Technomancer") {
    // Blue electric arcs crackling outward
    return (
      <motion.div key={evIdx} className="absolute inset-0 pointer-events-none z-30" initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={{ duration: 0.55 }}>
        <svg className="w-full h-full" viewBox="0 0 176 200">
          {[0, 1, 2, 3, 4].map((i) => {
            const cx = 88, cy = 90, a = (i * 72) * Math.PI / 180;
            const x1 = cx + Math.cos(a) * 18, y1 = cy + Math.sin(a) * 18;
            const x2 = cx + Math.cos(a) * 68, y2 = cy + Math.sin(a) * 68;
            const xm = (x1 + x2) / 2 + (i % 2 ? 12 : -12);
            const ym = (y1 + y2) / 2 + (i % 2 ? -8 : 8);
            return (
              <motion.path
                key={i}
                d={`M ${x1} ${y1} L ${xm} ${ym} L ${x2} ${y2}`}
                stroke={color} strokeWidth="2.5" fill="none" strokeLinecap="round"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: [0, 1, 0] }}
                transition={{ duration: 0.35, delay: i * 0.04 }}
                style={{ filter: `drop-shadow(0 0 4px ${color})` }}
              />
            );
          })}
        </svg>
      </motion.div>
    );
  }

  if (className === "Shadow Operative") {
    // Purple shadow afterimages trailing behind the dash
    return (
      <>
        {[0, 1, 2].map((i) => (
          <motion.div
            key={`${evIdx}-${i}`}
            className="absolute pointer-events-none z-10"
            style={{ top: 55, left: "50%", width: 70, height: 90, marginLeft: -35, borderRadius: "45%", background: color, filter: "blur(6px)" }}
            initial={{ x: 0, opacity: 0.35, scale: 0.85 }}
            animate={{ x: dir * -(25 + i * 18), opacity: 0, scale: 0.6 }}
            transition={{ duration: 0.45, delay: i * 0.05, ease: "easeOut" }}
          />
        ))}
      </>
    );
  }

  if (className === "Astral Warden") {
    // Golden radial light burst — warmth of the cosmos
    return (
      <motion.div
        key={evIdx}
        className="absolute inset-0 pointer-events-none z-30 flex items-center justify-center"
        initial={{ scale: 0.3, opacity: 1 }}
        animate={{ scale: [0.3, 1.5, 1.8], opacity: [1, 0.5, 0] }}
        transition={{ duration: 0.7, ease: "easeOut" }}
      >
        <div style={{ width: 130, height: 130, borderRadius: "50%", background: `radial-gradient(circle, ${color}cc 0%, ${color}33 40%, transparent 70%)`, filter: "blur(2px)" }} />
      </motion.div>
    );
  }

  if (className === "Void Runner") {
    // Twin cyan afterimage flashes — double strike
    return (
      <>
        {[0, 1].map((i) => (
          <motion.div
            key={`${evIdx}-vr-${i}`}
            className="absolute pointer-events-none z-30 flex items-center justify-center"
            style={{ inset: 0 }}
            initial={{ opacity: 0, scale: 0.6, x: dir * -10 }}
            animate={{ opacity: [0, 1, 0], scale: [0.6, 1.15, 1.3], x: dir * (20 + i * 28) }}
            transition={{ duration: 0.4, delay: i * 0.12, ease: "easeOut" }}
          >
            <div
              style={{
                width: 48,
                height: 72,
                borderRadius: "40%",
                border: `2px solid ${color}`,
                boxShadow: `0 0 16px ${color}`,
                background: `${color}22`,
              }}
            />
          </motion.div>
        ))}
      </>
    );
  }

  if (className === "Cosmic Engineer") {
    // Green combat drone projectile flying toward the target
    return (
      <motion.div
        key={evIdx}
        className="absolute pointer-events-none z-30"
        style={{ top: 50, [dir > 0 ? "right" : "left"]: 15 }}
        initial={{ x: 0, opacity: 1, rotate: 0, scale: 1 }}
        animate={{ x: dir * 120, opacity: [1, 1, 0], rotate: 720, scale: 0.7 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        <span style={{ fontSize: 26, filter: `drop-shadow(0 0 6px ${color})` }}>🛸</span>
      </motion.div>
    );
  }

  return null;
}